jest.mock('../../db/index.js', () => ({
    executeQuery: jest.fn(), listTables: jest.fn(), describeTable: jest.fn(),
    getFieldDescriptions: jest.fn(), analyzeQueryPerformance: jest.fn(),
    getExecutionPlan: jest.fn(), analyzeMissingIndexes: jest.fn(),
    executeBatchQueries: jest.fn(), describeBatchTables: jest.fn(),
    getTableIndexes: jest.fn(), getTableConstraints: jest.fn(), getTableTriggers: jest.fn()
}));

import { z } from 'zod';
import * as db from '../../db/index.js';
import { setupDatabaseTools } from '../../tools/database.js';
import { setupSimpleTools } from '../../tools/simple.js';
import { toolError, finalizeTools, toolResult } from '../../tools/contracts.js';
import { DEFAULT_SECURITY_CONFIG, securityConfig } from '../../security/config.js';
import { FirebirdError } from '../../utils/errors.js';

const sql = 'SELECT * FROM TEST';
const performanceResult = {
    query: sql, executionTimes: [], averageTime: 0, minTime: 0,
    maxTime: 0, rowCount: 0, success: false, error: 'Execution failed', analysis: 'Failed'
};
const planResult = {
    query: sql, plan: '', planDetails: [], success: false,
    error: 'Plan failed', analysis: 'Failed'
};

describe('MCP tool contracts', () => {
    const savedEnv = { ...process.env };
    beforeEach(() => {
        jest.resetAllMocks();
        delete process.env.ALLOW_RAW_SQL;
        for (const key of Object.keys(securityConfig)) delete (securityConfig as any)[key];
        Object.assign(securityConfig, structuredClone(DEFAULT_SECURITY_CONFIG));
    });
    afterAll(() => { process.env = savedEnv; });

    it('advertises a concrete JSON object output schema for every database tool', () => {
        for (const tool of setupDatabaseTools().values()) {
            const schema = z.toJSONSchema(tool.outputSchema);
            expect(schema.type).toBe('object');
            expect(schema.properties).toHaveProperty('success');
            expect(schema.properties).toHaveProperty('result');
            expect(schema.properties).toHaveProperty('error');
        }
    });

    it('keeps SQL execution annotations conservative even with the default policy', () => {
        const tools = setupDatabaseTools();
        for (const name of ['execute-query', 'execute-batch-queries', 'analyze-query-performance']) {
            expect(tools.get(name)!.annotations).toEqual({
                readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true
            });
        }
        for (const name of ['list-tables', 'get-table-indexes', 'get-table-constraints', 'get-table-triggers', 'describe-table']) {
            expect(tools.get(name)!.annotations).toEqual({
                readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false
            });
        }
    });

    it.each([{ rows: [] }, { rows: [{ success: false, error: 'This is ordinary row data' }] }])(
        'treats valid query data as successful, including empty rows and error-like fields: %j', async ({ rows }) => {
            jest.mocked(db.executeQuery).mockResolvedValue(rows);
            const tool = setupDatabaseTools().get('execute-query')!;
            const response = await tool.handler({ sql });
            expect(response.isError).not.toBe(true);
            expect(response.structuredContent).toEqual({ success: true, result: { rows } });
            expect(JSON.parse(response.content[0].text)).toEqual({ rows });
            expect(tool.outputSchema.safeParse(response.structuredContent).success).toBe(true);
        }
    );

    it.each([
        ['execute-query', 'executeQuery', { sql }],
        ['list-tables', 'listTables', {}],
        ['describe-table', 'describeTable', { tableName: 'TEST' }],
        ['get-field-descriptions', 'getFieldDescriptions', { tableName: 'TEST' }],
        ['get-table-indexes', 'getTableIndexes', { tableName: 'TEST' }],
        ['get-table-constraints', 'getTableConstraints', { tableName: 'TEST' }],
        ['get-table-triggers', 'getTableTriggers', { tableName: 'TEST' }],
        ['analyze-query-performance', 'analyzeQueryPerformance', { sql }],
        ['get-execution-plan', 'getExecutionPlan', { sql }],
        ['analyze-missing-indexes', 'analyzeMissingIndexes', { sql }],
        ['execute-batch-queries', 'executeBatchQueries', { queries: [{ sql }] }],
        ['describe-batch-tables', 'describeBatchTables', { tableNames: ['TEST'] }],
        ['get-table-data', 'executeQuery', { tableName: 'TEST', first: 10, skip: 0 }],
        ['analyze-table-statistics', 'executeQuery', { tableName: 'TEST' }],
        ['get-database-info', 'listTables', {}]
    ])('marks caught %s failures as MCP tool errors', async (name, operation, args) => {
        (db[operation as keyof typeof db] as jest.Mock).mockRejectedValue(new FirebirdError('Database unavailable', 'CONNECTION_ERROR'));
        const tool = setupDatabaseTools().get(name as string)!;
        const response = await tool.handler(args);
        expect(response.isError).toBe(true);
        expect(response.structuredContent).toMatchObject({
            success: false, error: { message: 'Database unavailable', type: 'CONNECTION_ERROR' }
        });
        expect(JSON.parse(response.content[0].text)).toMatchObject({ success: false, error: 'Database unavailable' });
        expect(tool.outputSchema.safeParse(response.structuredContent).success).toBe(true);
    });

    it.each([
        ['analyze-query-performance', 'analyzeQueryPerformance', performanceResult],
        ['get-execution-plan', 'getExecutionPlan', planResult],
        ['analyze-missing-indexes', 'analyzeMissingIndexes', {
            missingIndexes: [], recommendations: [], success: false, error: 'Analysis failed'
        }]
    ])('recognizes the explicit failure result from %s', async (name, operation, result) => {
        (db[operation as keyof typeof db] as jest.Mock).mockResolvedValue(result);
        const tool = setupDatabaseTools().get(name as string)!;
        const response = await tool.handler({ sql });
        expect(response.isError).toBe(true);
        expect(response.structuredContent).toMatchObject({ success: false, result });
        expect(JSON.parse(response.content[0].text)).toEqual(result);
        expect(tool.outputSchema.safeParse(response.structuredContent).success).toBe(true);
    });

    it('preserves the informative unavailable-plan response as success', async () => {
        const result = { ...planResult, success: true, error: undefined, plan: 'Execution plan not available' };
        jest.mocked(db.getExecutionPlan).mockResolvedValue(result);
        const response = await setupDatabaseTools().get('get-execution-plan')!.handler({ sql });
        expect(response.isError).not.toBe(true);
        expect(response.structuredContent.success).toBe(true);
    });

    it('marks partially failed query batches without losing successful items or error types', async () => {
        const results = [{ success: true, data: [] }, { success: false, error: 'Denied', errorType: 'SECURITY_ERROR' }];
        jest.mocked(db.executeBatchQueries).mockResolvedValue(results);
        const tool = setupDatabaseTools().get('execute-batch-queries')!;
        const response = await tool.handler({ queries: [{ sql }, { sql }] });
        expect(response.isError).toBe(true);
        expect(response.structuredContent).toMatchObject({ success: false, result: { results } });
        expect(JSON.parse(response.content[0].text)).toEqual({ results });
        expect(tool.outputSchema.safeParse(response.structuredContent).success).toBe(true);
    });

    it.each([false, true])('uses only schema:null to recognize failed table descriptions: %s', async failed => {
        const results = [{ tableName: 'TEST', schema: failed ? null : [], ...(failed ? { error: 'Denied' } : {}) }];
        jest.mocked(db.describeBatchTables).mockResolvedValue(results);
        const response = await setupDatabaseTools().get('describe-batch-tables')!.handler({ tableNames: ['TEST'] });
        expect(response.isError === true).toBe(failed);
        expect(response.structuredContent).toMatchObject({ success: !failed, result: results });
        expect(JSON.parse(response.content[0].text)).toEqual(results);
    });

    it('keeps empty successful batches successful', async () => {
        jest.mocked(db.executeBatchQueries).mockResolvedValue([{ success: true, data: [] }]);
        const response = await setupDatabaseTools().get('execute-batch-queries')!.handler({ queries: [{ sql }] });
        expect(response.isError).not.toBe(true);
        expect(response.structuredContent.success).toBe(true);
    });

    it('marks policy failures and failures before local try blocks as tool errors', async () => {
        const tool = setupDatabaseTools().get('execute-query')!;
        const denied = await tool.handler({ sql: 'DELETE FROM TEST' });
        expect(denied.isError).toBe(true);
        expect(denied.structuredContent.error?.type).toBe('SECURITY_ERROR');
        const malformed = await tool.handler(null);
        expect(malformed.isError).toBe(true);
        expect(db.executeQuery).not.toHaveBeenCalled();
    });

    it('checks the whole MCP response size and converts the rejection to an error result', async () => {
        securityConfig.resourceLimits = { maxResponseSize: 400 };
        jest.mocked(db.executeQuery).mockResolvedValue([{ TEXT: 'x'.repeat(500) }]);
        const response = await setupDatabaseTools().get('execute-query')!.handler({ sql });
        expect(response.isError).toBe(true);
        expect(response.structuredContent.error?.type).toBe('RESOURCE_LIMIT_EXCEEDED');
        expect(response.structuredContent.result).toBeUndefined();
    });

    it('converts non-JSON driver results into a failure rather than an unstructured success', async () => {
        jest.mocked(db.executeQuery).mockResolvedValue([{ BIG_NUMBER: BigInt(10) }]);
        const response = await setupDatabaseTools().get('execute-query')!.handler({ sql });
        expect(response.isError).toBe(true);
        expect(response.structuredContent.success).toBe(false);
    });

    it('preserves echo text and exposes its structured message', async () => {
        const tool = setupSimpleTools().get('echo')!;
        const message = 'hello\n{not json}';
        const response = await tool.handler({ message });
        expect(response.content).toEqual([{ type: 'text', text: message }]);
        expect(response.structuredContent).toEqual({ success: true, result: { message } });
        expect(tool.outputSchema.safeParse(response.structuredContent).success).toBe(true);
    });

    it('can report errors whose context cannot be serialized', () => {
        const context: Record<string, unknown> = {};
        context.circular = context;
        const response = toolError(new FirebirdError('Failure', 'QUERY_ERROR', undefined, context));
        expect(response.isError).toBe(true);
        expect(response.structuredContent.error).toEqual({ message: 'Failure', type: 'QUERY_ERROR' });
        expect(() => JSON.stringify(response)).not.toThrow();
    });

    it('fails closed when a handler returns data outside its advertised schema', async () => {
        const tool = finalizeTools(new Map([['example', {
            description: 'Test', inputSchema: z.object({}), handler: async () => toolResult({ wrong: true })
        }]]), { example: z.object({ required: z.string() }) }).get('example')!;
        const response = await tool.handler({});
        expect(response.isError).toBe(true);
        expect(response.structuredContent.success).toBe(false);
    });
});
