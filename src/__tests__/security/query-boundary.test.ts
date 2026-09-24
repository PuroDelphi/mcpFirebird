jest.mock('../../db/connection.js', () => ({
    DEFAULT_CONFIG: {}, getGlobalConfig: jest.fn(), connectToDatabase: jest.fn(), queryDatabase: jest.fn(),
    getPool: jest.fn(() => ({ release: releaseMock, destroy: destroyMock }))
}));
jest.mock('../../security/audit.js', () => ({ logQueryExecution: jest.fn().mockResolvedValue(undefined) }));
const releaseMock = jest.fn();
const destroyMock = jest.fn();
import { connectToDatabase, queryDatabase } from '../../db/connection.js';
import { executeQuery, executeMetadataQuery, executeBatchQueries, listTables } from '../../db/queries.js';
import { logQueryExecution } from '../../security/audit.js';
import { DEFAULT_SECURITY_CONFIG, securityConfig } from '../../security/config.js';
import { resetQueryCount, resetRateLimit } from '../../security/resourceLimits.js';

describe('real query boundary with mocked Firebird I/O', () => {
    beforeEach(() => {
        jest.clearAllMocks(); resetQueryCount(); resetRateLimit();
        for (const key of Object.keys(securityConfig)) delete (securityConfig as any)[key];
        Object.assign(securityConfig, structuredClone(DEFAULT_SECURITY_CONFIG));
        jest.mocked(connectToDatabase).mockResolvedValue({} as any);
        jest.mocked(queryDatabase).mockResolvedValue([{ ID: 1 }]);
        jest.mocked(logQueryExecution).mockResolvedValue(undefined);
    });
    it('rejects catalog SQL before opening a connection, but allows fixed internal metadata SQL', async () => {
        await expect(executeQuery('SELECT * FROM RDB$RELATIONS')).rejects.toThrow('System table');
        expect(connectToDatabase).not.toHaveBeenCalled();
        await expect(executeMetadataQuery('SELECT * FROM RDB$RELATIONS')).resolves.toEqual([{ ID: 1 }]);
        expect(releaseMock).toHaveBeenCalledTimes(1);
    });
    it('filters table listing and protects direct SQL using the same policy', async () => {
        securityConfig.allowedTables = ['PUBLIC_DATA'];
        jest.mocked(queryDatabase).mockResolvedValue([{RDB$RELATION_NAME:'PRIVATE_DATA '},{RDB$RELATION_NAME:'PUBLIC_DATA '}]);
        await expect(listTables()).resolves.toEqual(['PUBLIC_DATA']);
        await expect(executeQuery('SELECT * FROM PRIVATE_DATA')).rejects.toThrow();
    });
    it('applies row filtering, parameter binding and masking inside the query boundary', async () => {
        securityConfig.rowFilters = { T: 'VISIBLE = 1' };
        securityConfig.dataMasking = [{ columns: ['SSN'], pattern: '^.*$', replacement: 'hidden' }];
        jest.mocked(queryDatabase).mockResolvedValue([{ OTHER: '123' }]);
        await expect(executeQuery('SELECT SSN AS OTHER FROM T WHERE ID = ?', [7])).resolves.toEqual([{ OTHER: 'hidden' }]);
        expect(queryDatabase).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('WHERE (VISIBLE = 1)'), [7]);
        expect(logQueryExecution).toHaveBeenLastCalledWith(expect.any(String), [7], '', '', true, '', expect.any(Number), 1, [{OTHER:'hidden'}]);
    });
    it('does not release oversized results and enforces policy in batch queries', async () => {
        securityConfig.maxRows = 1;
        jest.mocked(queryDatabase).mockResolvedValue([{ID:1},{ID:2}]);
        await expect(executeQuery('SELECT * FROM T')).rejects.toThrow('rows');
        expect(destroyMock).toHaveBeenCalled();
        const results = await executeBatchQueries([{sql:'SELECT * FROM RDB$RELATIONS'}, {sql:'SELECT * FROM T'}]);
        expect(results.every(result => !result.success)).toBe(true);
    });
    it('prevents execution when the configured audit sink fails', async () => {
        jest.mocked(logQueryExecution).mockRejectedValue(new Error('Unavailable audit sink'));
        await expect(executeQuery('SELECT * FROM T')).rejects.toThrow();
        expect(queryDatabase).not.toHaveBeenCalled();
    });
    it('releases the completed query attachment before completion auditing borrows a connection', async () => {
        jest.mocked(logQueryExecution).mockImplementation(async (...args) => {
            if (args[8] !== undefined) expect(releaseMock).toHaveBeenCalledTimes(1);
        });
        await executeQuery('SELECT * FROM T');
        expect(releaseMock).toHaveBeenCalledTimes(1);
    });
    it('discards timed-out connections rather than returning them to the pool', async () => {
        securityConfig.queryTimeout = 10;
        jest.mocked(queryDatabase).mockImplementation(() => new Promise(() => {}));
        await expect(executeQuery('SELECT * FROM T')).rejects.toThrow('deadline');
        expect(destroyMock).toHaveBeenCalledTimes(1);
        expect(releaseMock).not.toHaveBeenCalled();
    });
    it('closes an attachment that arrives after the deadline', async () => {
        securityConfig.queryTimeout = 10;
        let resolveConnection!: (value: any) => void;
        jest.mocked(connectToDatabase).mockImplementation(() => new Promise(resolve => { resolveConnection = resolve; }));
        await expect(executeQuery('SELECT * FROM T')).rejects.toThrow('deadline');
        resolveConnection({}); await new Promise(resolve => setTimeout(resolve, 0));
        expect(destroyMock).toHaveBeenCalledTimes(1);
        expect(queryDatabase).not.toHaveBeenCalled();
    });
});
