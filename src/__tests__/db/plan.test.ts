import Firebird from 'node-firebird';
import { prepareDatabasePlan } from '../../db/plan.js';

function pure(plan: unknown = 'PLAN (T NATURAL)') {
    const events: string[] = [];
    const statement = { plan };
    const transaction = { rollback: jest.fn(cb => { events.push('rollback'); cb(null); }) };
    const connection = {
        prepare: jest.fn((_tx, _sql, _plan, cb) => cb(null, statement)),
        allocateStatement: jest.fn(cb => cb(null, statement)),
        prepareStatement: jest.fn((_tx, _statement, _sql, _plan, cb) => cb(null, statement)),
        dropStatement: jest.fn((_statement, cb) => { events.push('drop'); cb(null); }),
        getCachedQuery: jest.fn(() => undefined as any),
        _cache_query: {} as Record<string, any>
    };
    const db = { connection, transaction: jest.fn((_mode, cb) => cb(null, transaction)), query: jest.fn(), execute: jest.fn() };
    return { db, connection, transaction, statement, events };
}

describe('prepare-only execution plans', () => {
    it('uses the read-only wire prepare flag, drops and rolls back without execution', async () => {
        const f = pure('  PLAN (T INDEX (PK_T))  ');
        await expect(prepareDatabasePlan(f.db as any, 'SELECT * FROM T WHERE ID = ?', () => false)).resolves.toBe('PLAN (T INDEX (PK_T))');
        expect(f.db.transaction).toHaveBeenCalledWith(Firebird.ISOLATION_READ_COMMITTED_READ_ONLY, expect.any(Function));
        expect(f.connection.prepare).toHaveBeenCalledWith(f.transaction, 'SELECT * FROM T WHERE ID = ?', true, expect.any(Function));
        expect(f.connection.allocateStatement).not.toHaveBeenCalled();
        expect(f.events).toEqual(['drop', 'rollback']);
        expect(f.db.query).not.toHaveBeenCalled(); expect(f.db.execute).not.toHaveBeenCalled();
    });

    it('uses the native statement info API with a read-only transaction, not a result cursor', async () => {
        const events: string[] = [];
        const tx = { rollback: jest.fn(async () => { events.push('rollback'); }) };
        const statement = { statementHandle: { getPlanAsync: jest.fn(async () => 'PLAN (T NATURAL)') },
            dispose: jest.fn(async () => { events.push('dispose'); }), execute: jest.fn(), executeQuery: jest.fn() };
        const native = { startTransaction: jest.fn(async () => tx), prepare: jest.fn(async () => statement),
            client: { statusAction: jest.fn(async action => action('status')) } };
        await expect(prepareDatabasePlan({ _nativeAttachment: native } as any, 'SELECT * FROM T', () => false)).resolves.toBe('PLAN (T NATURAL)');
        expect(native.startTransaction).toHaveBeenCalledWith({ accessMode: 'READ_ONLY' });
        expect(statement.statementHandle.getPlanAsync).toHaveBeenCalledWith('status', false);
        expect(statement.execute).not.toHaveBeenCalled(); expect(statement.executeQuery).not.toHaveBeenCalled();
        expect(events).toEqual(['dispose', 'rollback']);
    });

    it.each(['info failure', 'missing API'])('cleans native statement/transaction after %s', async mode => {
        const tx = { rollback: jest.fn(async () => undefined) };
        const statement = { statementHandle: mode === 'missing API' ? {} : { getPlanAsync: async () => { throw new Error('info failure'); } }, dispose: jest.fn(async () => undefined) };
        const native = { startTransaction: async () => tx, prepare: async () => statement, client: { statusAction: async (action: any) => action({}) } };
        await expect(prepareDatabasePlan({ _nativeAttachment: native } as any, 'SELECT * FROM T', () => false)).rejects.toThrow();
        expect(statement.dispose).toHaveBeenCalledTimes(1); expect(tx.rollback).toHaveBeenCalledTimes(1);
    });

    it.each([undefined, '', '   '])('rejects absent/empty plan metadata (%p) and still cleans up', async plan => {
        const f = pure(plan); f.statement.plan = plan;
        await expect(prepareDatabasePlan(f.db as any, 'SELECT * FROM T', () => false)).rejects.toMatchObject({ type: 'PLAN_UNAVAILABLE' });
        expect(f.events).toEqual(['drop', 'rollback']);
    });

    it('fails honestly for adapters without a supported prepare/info interface', async () => {
        await expect(prepareDatabasePlan({ query: jest.fn() } as any, 'SELECT * FROM T', () => false)).rejects.toMatchObject({ type: 'PLAN_UNAVAILABLE' });
    });

    it('rolls back after a prepare error without assuming a statement handle was returned', async () => {
        const f = pure();
        f.connection.prepare.mockImplementation((_t, _q, _p, cb) => cb(new Error('prepare failed')));
        await expect(prepareDatabasePlan(f.db as any, 'SELECT * FROM T', () => false)).rejects.toThrow('prepare failed');
        expect(f.events).toEqual(['rollback']);
    });

    it.each([false, true])('contains asynchronous wire descriptor-parser throws (staged=%s) and restores the queue hook', async staged => {
        const f = pure(); const response = { handle: 42 };
        const queue = jest.fn((callback: any) => {
            expect(callback.response).toBe(response); expect(callback.lazy_count).toBe(2);
            queueMicrotask(() => callback(null, response));
        });
        (f.connection as any)._queueEvent = queue;
        const parse = Object.assign(() => { throw new Error('Unsupported descriptor'); }, { response, lazy_count: 2 });
        f.connection.prepare.mockImplementation(() => {
            const first = staged ? Object.assign(() => (f.connection as any)._queueEvent(parse), { response, lazy_count: 2 }) : parse;
            (f.connection as any)._queueEvent(first);
        });
        await expect(prepareDatabasePlan(f.db as any, 'SELECT * FROM T', () => false)).rejects.toThrow('Unsupported descriptor');
        expect(f.events).toEqual(['rollback']); expect((f.connection as any)._queueEvent).toBe(queue);
        expect(queue).toHaveBeenCalledTimes(staged ? 2 : 1);
    });

    it('attempts rollback even if dropping a returned statement fails', async () => {
        const f = pure();
        f.connection.dropStatement.mockImplementation((_s, cb) => { f.events.push('drop'); cb(new Error('drop failed')); });
        await expect(prepareDatabasePlan(f.db as any, 'SELECT * FROM T', () => false)).rejects.toThrow('drop failed');
        expect(f.events).toEqual(['drop', 'rollback']);
    });

    it('never returns a successful plan if cleanup fails', async () => {
        const f = pure(); f.transaction.rollback.mockImplementation(cb => cb(new Error('rollback failed')));
        await expect(prepareDatabasePlan(f.db as any, 'SELECT * FROM T', () => false)).rejects.toThrow('rollback failed');
    });

    it('does not start I/O after the deadline', async () => {
        const f = pure();
        await expect(prepareDatabasePlan(f.db as any, 'SELECT * FROM T', () => true)).rejects.toMatchObject({ type: 'QUERY_TIMEOUT' });
        expect(f.db.transaction).not.toHaveBeenCalled();
    });

    it('rolls back a transaction arriving after its deadline without allocating a statement', async () => {
        const f = pure(); let expired = false;
        f.db.transaction.mockImplementation((_mode, cb) => { expired = true; cb(null, f.transaction); });
        await expect(prepareDatabasePlan(f.db as any, 'SELECT * FROM T', () => expired)).rejects.toMatchObject({ type: 'QUERY_TIMEOUT' });
        expect(f.connection.allocateStatement).not.toHaveBeenCalled(); expect(f.events).toEqual(['rollback']);
    });

    it('waits for adapter promises as well as cleanup callbacks', async () => {
        const f = pure(); let finish!: () => void, completed = false;
        f.connection.dropStatement.mockImplementation((_s, cb) => { cb(null); return new Promise<void>(resolve => { finish = resolve; }); });
        const pending = prepareDatabasePlan(f.db as any, 'SELECT * FROM T', () => false).then(value => { completed = true; return value; });
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(completed).toBe(false); expect(f.transaction.rollback).toHaveBeenCalledTimes(1);
        finish(); await expect(pending).resolves.toContain('PLAN'); expect(f.transaction.rollback).toHaveBeenCalledTimes(1);
    });

    it('queues rollback to flush lazy-send DROP, then awaits both acknowledgments', async () => {
        const f = pure(); let acknowledgeDrop!: () => void;
        f.connection.dropStatement.mockImplementation((_s, cb) => { acknowledgeDrop = () => cb(null); });
        f.transaction.rollback.mockImplementation(cb => { acknowledgeDrop(); cb(null); });
        await expect(prepareDatabasePlan(f.db as any, 'SELECT * FROM T', () => false)).resolves.toContain('PLAN');
    });

    it.each([false, true])('does not leave a dropped statement in the wire cache (prior=%s)', async prior => {
        const f = pure(); const sql = 'SELECT * FROM T', old = { handle: 123 };
        if (prior) f.connection._cache_query[sql] = old;
        f.connection.getCachedQuery.mockReturnValue(prior ? old : undefined);
        f.connection.prepare.mockImplementation((_t, query, _p, cb) => { f.connection._cache_query[query] = f.statement; cb(null, f.statement); });
        await prepareDatabasePlan(f.db as any, sql, () => false);
        expect(f.connection._cache_query[sql]).toBe(prior ? old : undefined);
    });

    it('rejects near-buffer-limit plans instead of exposing a possibly truncated prefix', async () => {
        const f = pure('x'.repeat(60000));
        await expect(prepareDatabasePlan(f.db as any, 'SELECT * FROM T', () => false)).rejects.toMatchObject({ type: 'RESOURCE_LIMIT_EXCEEDED' });
        expect(f.events).toEqual(['drop', 'rollback']);
    });
});
