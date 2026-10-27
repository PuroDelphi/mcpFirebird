jest.mock('../../db/index.js', () => ({ describeBatchTables: jest.fn(), getExecutionPlan: jest.fn() }));

import * as db from '../../db/index.js';
import { setupDatabaseTools } from '../../tools/database.js';
import { setupSimpleTools } from '../../tools/simple.js';
import { finalizeTools, toolError, toolResult } from '../../tools/contracts.js';
import { FirebirdError } from '../../utils/errors.js';
import { DEFAULT_SECURITY_CONFIG, securityConfig } from '../../security/config.js';
import { z } from 'zod';

const payloads = [
    '<b>tofu-poc</b>',
    '</script><img src=x onerror=alert(1)>',
    '{{{{{{{aaa',
    '&lt;img src=x onerror=alert(1)&gt;',
    '[click](javascript:alert(1))',
    '```html\n<img src=x onerror=alert(1)>\n```'
];

describe('issue #47: display text encoding without data loss', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        for (const key of Object.keys(securityConfig)) delete (securityConfig as any)[key];
        Object.assign(securityConfig, structuredClone(DEFAULT_SECURITY_CONFIG));
    });

    it.each(payloads)('encodes nested JSON strings and keys: %s', payload => {
        const data = { [payload]: [payload, { value: payload }], number: 7, bool: false, empty: null };
        const response = toolResult(data);
        expect(response.content[0].text).not.toContain(payload);
        expect(JSON.parse(response.content[0].text)).toEqual(data);
        expect(response.structuredContent).toEqual({ success: true, result: data });
    });

    it('preserves JSON escapes, Unicode, Dates and Buffers and invokes toJSON only once', () => {
        const data = { text: '\\u003c \\" <tag>\n\t\u0000 ñ 漢字 😀', date: new Date('2026-10-27T12:00:00Z'), buffer: Buffer.from('hello') };
        const toJSON = jest.fn(() => data);
        const response = toolResult({ toJSON });
        expect(toJSON).toHaveBeenCalledTimes(1);
        expect(JSON.parse(response.content[0].text)).toEqual(JSON.parse(JSON.stringify(data)));
        expect(response.structuredContent.result).toEqual(JSON.parse(response.content[0].text));
        expect(response.content[0].text).not.toContain('<tag>');
    });

    it.each([false, true])('encodes batch table names on success and failure (failure=%s)', async failed => {
        const tableName = '<b>tofu-poc</b>';
        const result = [{ tableName, schema: failed ? null : [], ...(failed ? { error: `Cannot describe ${tableName}` } : {}) }];
        jest.mocked(db.describeBatchTables).mockResolvedValue(result);
        const response = await setupDatabaseTools().get('describe-batch-tables')!.handler({ tableNames: [tableName] });
        expect(db.describeBatchTables).toHaveBeenCalledWith([tableName], undefined, 5);
        expect(response.content[0].text).not.toContain(tableName);
        expect(JSON.parse(response.content[0].text)).toEqual(result);
        expect(response.structuredContent.result).toEqual(result);
        expect(response.isError === true).toBe(failed);
    });

    it.each([false, true])('encodes plan SQL on success and failure (failure=%s)', async failed => {
        const sql = "SELECT '<b>tofu-poc</b>' FROM TEST";
        const result = { query: sql, plan: failed ? '' : 'PLAN (TEST NATURAL)', planDetails: [], success: !failed, analysis: 'Prepared', ...(failed ? { error: 'Plan unavailable' } : {}) };
        jest.mocked(db.getExecutionPlan).mockResolvedValue(result);
        const response = await setupDatabaseTools().get('get-execution-plan')!.handler({ sql });
        expect(db.getExecutionPlan).toHaveBeenCalledWith(sql, []);
        expect(response.content[0].text).not.toContain('<b>');
        expect(JSON.parse(response.content[0].text)).toEqual(result);
        expect(response.structuredContent.result).toEqual(result);
        expect(response.isError === true).toBe(failed);
    });

    it.each(payloads)('encodes echo display text: %s', async message => {
        const response = await setupSimpleTools().get('echo')!.handler({ message });
        expect(response.content[0].text).not.toContain(message);
        expect(response.structuredContent.result).toEqual({ message });
    });

    it.each([false, true])('encodes error messages and nested context (compact=%s)', compact => {
        const message = '<img src=x onerror=alert(1)>';
        const details = { tableName: message, nested: { '{{key}}': message } };
        const response = toolError(new FirebirdError(message, 'QUERY_ERROR', undefined, details), { compact });
        expect(response.content[0].text).not.toContain(message);
        expect(JSON.parse(response.content[0].text)).toMatchObject({ error: message, errorDetails: details });
        expect(response.structuredContent.error).toEqual({ message, type: 'QUERY_ERROR', details });
    });

    it('encodes custom error text and prefixes without encoding the JSON syntax', () => {
        const payload = '<b>{{message}}</b>';
        expect(toolError(new Error(payload), { text: payload }).content[0].text).not.toContain(payload);
        const response = toolResult({ payload }, { prefix: `${payload}\n\n` });
        expect(response.content[0].text).not.toContain(payload);
        expect(JSON.parse(response.content[0].text.split('\n\n')[1])).toEqual({ payload });
    });

    it('applies response limits to the encoded size', async () => {
        const value = '<'.repeat(80);
        const tool = finalizeTools(new Map([['example', {
            description: 'Test', inputSchema: z.object({}), handler: async () => toolResult({ value })
        }]]), { example: z.object({ value: z.string() }) }).get('example')!;
        securityConfig.resourceLimits = { maxResponseSize: 400 };
        const response = await tool.handler({});
        expect(response.isError).toBe(true);
        expect(response.structuredContent.error?.type).toBe('RESOURCE_LIMIT_EXCEEDED');
    });
});
