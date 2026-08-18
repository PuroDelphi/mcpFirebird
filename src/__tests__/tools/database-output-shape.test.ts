jest.mock('../../db/index.js', () => ({
    executeQuery: jest.fn(),
    listTables: jest.fn(),
    describeTable: jest.fn(),
    getFieldDescriptions: jest.fn(),
    analyzeQueryPerformance: jest.fn(),
    getExecutionPlan: jest.fn(),
    analyzeMissingIndexes: jest.fn(),
    executeBatchQueries: jest.fn(),
    describeBatchTables: jest.fn()
}));

import { executeQuery, executeBatchQueries } from '../../db/index.js';
import { setupDatabaseTools } from '../../tools/database.js';

const mockedExecuteQuery = jest.mocked(executeQuery);
const mockedExecuteBatchQueries = jest.mocked(executeBatchQueries);

describe('database tool output shape', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('wraps execute-query rows in an object', async () => {
        const rows = [{ ID: 1 }, { ID: 2 }];
        mockedExecuteQuery.mockResolvedValue(rows);

        const response = await setupDatabaseTools().get('execute-query')!.handler({
            sql: 'SELECT * FROM TEST'
        });

        expect(JSON.parse(response.content[0].text)).toEqual({ rows });
    });

    it('wraps execute-batch-queries results in an object', async () => {
        const results = [{ success: true, result: [{ ID: 1 }] }];
        mockedExecuteBatchQueries.mockResolvedValue(results);

        const response = await setupDatabaseTools().get('execute-batch-queries')!.handler({
            queries: [{ sql: 'SELECT * FROM TEST' }]
        });

        expect(JSON.parse(response.content[0].text)).toEqual({ results });
    });
});
