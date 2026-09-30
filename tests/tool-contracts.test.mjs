import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { setupDatabaseTools } from '../dist/tools/database.js';
import { setupMetadataTools } from '../dist/tools/metadata.js';
import { securityConfig } from '../dist/security/config.js';

const tools = setupMetadataTools(setupDatabaseTools());

test('all metadata tools advertise object output schemas and read-only annotations', () => {
    for (const tool of tools.values()) {
        assert.equal(z.toJSONSchema(tool.outputSchema).type, 'object');
        assert.deepEqual(tool.annotations, {
            readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false
        });
    }
});

for (const [name, args, prefix] of [
    ['get-server-info', {}, 'Firebird MCP server information:\n\n'],
    ['list-available-tools', {}, 'Available tools:\n\n'],
    ['list-available-tools', { category: 'metadata' }, 'Available tools (category: metadata):\n\n'],
    ['get-tool-help', { toolName: 'list-tables' }, 'Help for tool: list-tables\n\n'],
    ['system-health-check', {}, 'System health status:\n\n']
]) {
    test(`${name} preserves its text prefix and exposes the same structured payload`, async () => {
        const tool = tools.get(name);
        const result = await tool.handler(args);
        assert.notEqual(result.isError, true);
        assert.equal(result.structuredContent.success, true);
        assert.ok(result.content[0].text.startsWith(prefix));
        assert.deepEqual(JSON.parse(result.content[0].text.slice(prefix.length)), result.structuredContent.result);
        assert.equal(tool.outputSchema.safeParse(result.structuredContent).success, true);
    });
}

test('unknown tool help preserves text and exposes a structured tool error', async () => {
    const result = await tools.get('get-tool-help').handler({ toolName: 'unknown' });
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.success, false);
    assert.match(result.content[0].text, /Tool 'unknown' not found/);
});

test('all database-backed metadata handlers mark policy failures as tool errors', async () => {
    const original = securityConfig.forbiddenOperations;
    securityConfig.forbiddenOperations = ['EXECUTE'];
    try {
        for (const [name, args] of [
            ['list-available-events', {}], ['list-triggers', {}], ['list-procedures', {}],
            ['list-functions', {}], ['list-packages', {}],
            ['describe-trigger', { triggerName: 'T' }], ['describe-procedure', { procedureName: 'P' }],
            ['describe-function', { functionName: 'F' }], ['describe-package', { packageName: 'P' }]
        ]) {
            const tool = tools.get(name);
            const result = await tool.handler(args);
            assert.equal(result.isError, true, name);
            assert.equal(result.structuredContent.success, false, name);
            assert.equal(tool.outputSchema.safeParse(result.structuredContent).success, true, name);
        }
    } finally {
        securityConfig.forbiddenOperations = original;
    }
});
