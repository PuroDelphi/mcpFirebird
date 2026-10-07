import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { z } from 'zod';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { Client as V1Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport as V1Stdio } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport as V1Http } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { cases, installContractDriver } from './fixtures/contract-driver.mjs';

process.env.LOG_LEVEL = 'error';
process.env.USE_NATIVE_DRIVER = 'false';
installContractDriver();
const { setupDatabaseTools } = await import('../dist/tools/database.js');
const { setupMetadataTools } = await import('../dist/tools/metadata.js');
const { setupSimpleTools } = await import('../dist/tools/simple.js');
const { closePool } = await import('../dist/db/connection.js');
const { createMcpServerInstance } = await import('../dist/server/index.js');
const { createHttpApplication } = await import('../dist/server/http-server.js');
const { loadHttpSecurityConfig } = await import('../dist/server/http-security.js');
const dbTools = setupDatabaseTools();
const tools = new Map([...dbTools, ...setupMetadataTools(dbTools), ...setupSimpleTools()]);
after(closePool);

// Walk schema positions only: {} under "properties" is a valid property map,
// whereas {} under additionalProperties/items is an unconstrained value schema.
function assertConcreteSchema(schema, path = 'outputSchema') {
    if (typeof schema === 'boolean') return;
    assert.ok(schema && typeof schema === 'object', path);
    assert.ok(['type', '$ref', 'anyOf', 'oneOf', 'allOf', 'enum', 'const', 'not'].some(key => key in schema), `Unconstrained schema at ${path}`);
    for (const key of ['properties', '$defs', 'definitions', 'patternProperties']) {
        for (const [name, child] of Object.entries(schema[key] || {})) assertConcreteSchema(child, `${path}.${key}.${name}`);
    }
    for (const key of ['items', 'additionalProperties', 'propertyNames', 'not']) {
        if (schema[key] !== undefined) assertConcreteSchema(schema[key], `${path}.${key}`);
    }
    for (const key of ['anyOf', 'oneOf', 'allOf']) {
        (schema[key] || []).forEach((child, i) => assertConcreteSchema(child, `${path}.${key}[${i}]`));
    }
}

test('every finalized tool has a nonempty successful production-path fixture', () => {
    assert.deepEqual([...tools.keys()].sort(), cases.map(([name]) => name).sort());
});

for (const [name, args] of cases) {
    test(`${name}: real metadata mapping conforms to its output contract`, async () => {
        const tool = tools.get(name);
        const response = await tool.handler(args);
        assert.notEqual(response.isError, true, JSON.stringify(response));
        assert.equal(response.structuredContent.success, true);
        assert.equal(tool.outputSchema.safeParse(response.structuredContent).success, true);
        // No silently stripped fields in the SDK's subsequent Zod parse.
        assert.deepEqual(tool.outputSchema.parse(response.structuredContent), response.structuredContent);
        if (name === 'list-tables' || name === 'get-database-info') {
            assert.deepEqual(response.structuredContent.result.tables, ['CUSTOMERS', 'ORDERS']);
            assert.deepEqual(JSON.parse(response.content[0].text), response.structuredContent.result);
        }
        if (name === 'analyze-table-statistics') {
            assert.deepEqual(response.structuredContent.result.columns, [
                { name: 'ID', type: 'INTEGER', nullable: false, hasDefault: false },
                { name: 'NAME', type: 'VARCHAR', nullable: true, hasDefault: true }
            ]);
        }
    });
}

test('all tool schemas explicitly describe JSON values instead of empty schemas', () => {
    for (const [name, tool] of tools) assertConcreteSchema(z.toJSONSchema(tool.outputSchema), name);
});

for (const transportKind of ['stdio', 'http']) {
    for (const era of ['sdk1', 'legacy', 'modern']) {
        test(`${transportKind} ${era}: every tool succeeds with client output validation enabled`, { timeout: 30000 }, async () => {
            const client = era === 'sdk1' ? new V1Client({ name: 'contract-sdk1', version: '1' }) : new Client(
                { name: 'contract-sdk2', version: '1' }, era === 'modern' ? { versionNegotiation: { mode: { pin: '2026-07-28' } } } : {});
            let http, listener;
            try {
                let transport;
                if (transportKind === 'stdio') {
                    const env = { ...process.env, TRANSPORT_TYPE: 'stdio', LOG_LEVEL: 'error' };
                    for (const key of ['FIREBIRD_SECURITY_CONFIG', 'SECURITY_CONFIG', 'SECURITY_CONFIG_PATH', 'FIREBIRD_SECURITY_JSON', 'QUERY_TIMEOUT', 'ALLOW_RAW_SQL']) delete env[key];
                    const options = { command: process.execPath, args: ['tests/fixtures/contract-server.mjs'], env, stderr: 'pipe' };
                    transport = era === 'sdk1' ? new V1Stdio(options) : new StdioClientTransport(options);
                } else {
                    process.env.STREAMABLE_STATELESS_MODE = 'false';
                    http = createHttpApplication(createMcpServerInstance, loadHttpSecurityConfig({}));
                    listener = http.app.listen(0, '127.0.0.1');
                    await once(listener, 'listening');
                    const url = new URL(`http://127.0.0.1:${listener.address().port}/mcp`);
                    transport = era === 'sdk1' ? new V1Http(url) : new StreamableHTTPClientTransport(url);
                }
                await client.connect(transport);
                const catalog = await client.listTools(); // Caches output schemas for client validation.
                for (const tool of catalog.tools) assertConcreteSchema(tool.outputSchema, tool.name);
                for (const [name, args] of cases) {
                    const response = await client.callTool({ name, arguments: args });
                    assert.notEqual(response.isError, true, `${name}: ${JSON.stringify(response)}`);
                    assert.equal(response.structuredContent.success, true, name);
                }
            } finally {
                await client.close();
                if (http) await http.close();
                if (listener) await new Promise(resolve => listener.close(resolve));
            }
        });
    }
}
