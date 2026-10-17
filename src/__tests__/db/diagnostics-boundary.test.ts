jest.mock('../../db/connection.js', () => ({
    DEFAULT_CONFIG: {}, getGlobalConfig: jest.fn(), connectToDatabase: jest.fn(), queryDatabase: jest.fn(),
    getPool: jest.fn(() => ({ release: releaseMock, destroy: destroyMock }))
}));
jest.mock('../../security/audit.js', () => ({ logQueryExecution: jest.fn().mockResolvedValue(undefined) }));
const releaseMock = jest.fn(), destroyMock = jest.fn();
import { connectToDatabase, queryDatabase } from '../../db/connection.js';
import { getExecutionPlan, analyzeMissingIndexes } from '../../db/queries.js';
import { logQueryExecution } from '../../security/audit.js';
import { DEFAULT_SECURITY_CONFIG, securityConfig } from '../../security/config.js';
import { resetQueryCount, resetRateLimit } from '../../security/resourceLimits.js';

function planConnection() {
    const statement = { plan: 'PLAN (T NATURAL)' };
    const tx = { rollback: jest.fn(cb => cb(null)) };
    const prepare = jest.fn((_tx, _sql, _flag, cb) => cb(null, statement));
    const db = { transaction: jest.fn((_mode, cb) => cb(null, tx)), connection: {
        prepare,
        dropStatement: jest.fn((_s, cb) => cb(null))
    } };
    jest.mocked(connectToDatabase).mockResolvedValue(db as any);
    return { db, tx, prepare };
}

describe('plan/advisor use the existing policy, quota, audit and pool boundary', () => {
    beforeEach(() => {
        jest.clearAllMocks(); resetQueryCount(); resetRateLimit();
        for (const key of Object.keys(securityConfig)) delete (securityConfig as any)[key];
        Object.assign(securityConfig, structuredClone(DEFAULT_SECURITY_CONFIG));
        jest.mocked(logQueryExecution).mockResolvedValue(undefined);
    });

    it('prepares the row-filtered statement without binding/executing parameter values', async () => {
        const { prepare } = planConnection();
        securityConfig.allowedTables = ['T']; securityConfig.rowFilters = { T: 'VISIBLE = 1' };
        const result = await getExecutionPlan('SELECT * FROM T WHERE ID = ?', [1]);
        expect(result.success).toBe(true); expect(result.analysis).toContain('not bound');
        expect(prepare.mock.calls[0][1]).toContain('FROM (SELECT * FROM T WHERE (VISIBLE = 1)) T');
        expect(prepare.mock.calls[0][1]).toContain('ID = ?');
        expect(queryDatabase).not.toHaveBeenCalled(); expect(releaseMock).toHaveBeenCalledTimes(1);
        expect(logQueryExecution).toHaveBeenCalledTimes(2);
    });

    it.each(['SELECT * FROM SECRET', 'SELECT * FROM MON$ATTACHMENTS', 'SELECT SECRET_FN(ID) FROM T'])('denies unauthorized plan SQL before driver I/O: %s', async sql => {
        planConnection(); securityConfig.allowedTables = ['T']; securityConfig.sql = { allowSystemTables: false, allowUnsafeQueries: false };
        expect((await getExecutionPlan(sql)).success).toBe(false);
        expect(connectToDatabase).not.toHaveBeenCalled(); expect(queryDatabase).not.toHaveBeenCalled();
    });

    it('rejects non-SELECT even when raw writes are allowed', async () => {
        planConnection(); const old = process.env.ALLOW_RAW_SQL; process.env.ALLOW_RAW_SQL = 'true';
        try {
            expect((await getExecutionPlan('UPDATE T SET ID=1')).success).toBe(false);
            expect(connectToDatabase).not.toHaveBeenCalled();
        } finally { if (old === undefined) delete process.env.ALLOW_RAW_SQL; else process.env.ALLOW_RAW_SQL = old; }
    });

    it('keeps query-count, response-size and audit enforcement for plans', async () => {
        planConnection(); securityConfig.resourceLimits = { maxQueriesPerSession: 1 };
        expect((await getExecutionPlan('SELECT * FROM T')).success).toBe(true);
        expect((await getExecutionPlan('SELECT * FROM T')).success).toBe(false);
        expect(connectToDatabase).toHaveBeenCalledTimes(1);
        resetQueryCount(); securityConfig.resourceLimits = { maxResponseSize: 5 };
        expect((await getExecutionPlan('SELECT * FROM T')).success).toBe(false);
        expect(destroyMock).toHaveBeenCalledTimes(1);
        jest.mocked(logQueryExecution).mockRejectedValue(new Error('audit denied'));
        expect((await getExecutionPlan('SELECT * FROM T')).success).toBe(false);
        expect(connectToDatabase).toHaveBeenCalledTimes(2);
    });

    it('retains masking projection policy instead of using plan requests as a policy bypass', async () => {
        planConnection(); securityConfig.dataMasking = [{ columns: ['NAME'], pattern: '.*', replacement: 'hidden' }];
        const result = await getExecutionPlan('SELECT ABS(ID) FROM T');
        expect(result.success).toBe(false); expect(connectToDatabase).not.toHaveBeenCalled();
    });

    it('holds a timed-out wire prepare until cleanup completes, then destroys exactly once', async () => {
        const f = planConnection(); securityConfig.queryTimeout = 10;
        let complete!: (err: any, statement?: any) => void;
        f.prepare.mockImplementation((_t, _q, _p, cb) => { complete = cb; });
        const result = await getExecutionPlan('SELECT * FROM T');
        expect(result.success).toBe(false); expect(result.error).toContain('deadline');
        expect(destroyMock).not.toHaveBeenCalled(); expect(releaseMock).not.toHaveBeenCalled();
        complete(null, { plan: 'PLAN (T NATURAL)' }); await new Promise(resolve => setTimeout(resolve, 0));
        expect(f.db.connection.dropStatement).toHaveBeenCalledTimes(1); expect(f.tx.rollback).toHaveBeenCalledTimes(1);
        expect(destroyMock).toHaveBeenCalledTimes(1); expect(releaseMock).not.toHaveBeenCalled();
        planConnection(); expect((await getExecutionPlan('SELECT * FROM T')).success).toBe(true);
    });

    it('does not detach during delayed native statement disposal and observes late rejection', async () => {
        securityConfig.queryTimeout = 10;
        let fail!: (error: Error) => void;
        const tx = { rollback: jest.fn(async () => undefined) };
        const native = { startTransaction: async () => tx, prepare: async () => ({
            statementHandle: { getPlanAsync: async () => 'PLAN (T NATURAL)' },
            dispose: () => new Promise((_, reject) => { fail = reject; })
        }), client: { statusAction: async (action: any) => action({}) } };
        jest.mocked(connectToDatabase).mockResolvedValue({ _nativeAttachment: native } as any);
        expect((await getExecutionPlan('SELECT * FROM T')).success).toBe(false);
        expect(destroyMock).not.toHaveBeenCalled(); expect(releaseMock).not.toHaveBeenCalled();
        fail(new Error('late disposal failure')); await new Promise(resolve => setTimeout(resolve, 0));
        expect(tx.rollback).toHaveBeenCalledTimes(1); expect(destroyMock).toHaveBeenCalledTimes(1);
    });

    it('returns no advisor DDL after metadata failure or policy denial', async () => {
        planConnection(); jest.mocked(queryDatabase).mockRejectedValue(new Error('catalog denied'));
        expect(await analyzeMissingIndexes('SELECT * FROM T WHERE ID=1')).toMatchObject({ success: false, missingIndexes: [] });
        jest.clearAllMocks(); securityConfig.allowedTables = ['T'];
        expect(await analyzeMissingIndexes('SELECT * FROM SECRET WHERE ID=1')).toMatchObject({ success: false, missingIndexes: [] });
        expect(connectToDatabase).not.toHaveBeenCalled();
    });
});
