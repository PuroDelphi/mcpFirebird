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
const tools = new Map([...dbTools, ...setupMetadataTools(dbTools, () => [...tools.keys()]), ...setupSimpleTools()]);
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

function assertToolStatus(name, response, catalog = [...tools.keys()]) {
    if (name === 'get-execution-plan') {
        assert.equal(response.isError, true);
        assert.equal(response.structuredContent.success, false);
        const result = response.structuredContent.result;
        assert.equal(result.success, false);
        assert.equal(result.plan, '');
        assert.deepEqual(result.planDetails, []);
        assert.equal(result.error, 'Execution plan not available');
        assert.match(result.analysis, /SET PLANONLY ON/);
        assert.deepEqual(JSON.parse(response.content[0].text), result);
    } else {
        assert.notEqual(response.isError, true, `${name}: ${JSON.stringify(response)}`);
        assert.equal(response.structuredContent.success, true, name);
    }
    if (name === 'get-server-info') {
        assert.equal(response.structuredContent.result.capabilities.totalTools, catalog.length);
        assert.deepEqual(response.structuredContent.result.capabilities.tools.toSorted(), catalog.toSorted());
    }
    if (name === 'system-health-check') {
        const counts = response.structuredContent.result.tools;
        assert.equal(counts.total, catalog.length);
        assert.equal(counts.database + counts.metadata + counts.other, counts.total);
    }
}

test('every finalized tool has a production-path fixture', () => {
    assert.deepEqual([...tools.keys()].sort(), cases.map(([name]) => name).sort());
});

for (const [name, args] of cases) {
    test(`${name}: real metadata mapping conforms to its output contract`, async () => {
        const tool = tools.get(name);
        const response = await tool.handler(args);
        assertToolStatus(name, response);
        assert.equal(tool.outputSchema.safeParse(response.structuredContent).success, true);
        // No silently stripped fields in the SDK's subsequent Zod parse.
        assert.deepEqual(tool.outputSchema.parse(response.structuredContent), response.structuredContent);
        if (name === 'list-tables' || name === 'get-database-info') {
            assert.deepEqual(response.structuredContent.result.tables, ['CUSTOMERS', 'ORDERS']);
            assert.deepEqual(JSON.parse(response.content[0].text), response.structuredContent.result);
        }
        if (name === 'analyze-table-statistics') {
            assert.equal(response.structuredContent.result.rowCount, 2);
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
      for (const format of [undefined, 'wall-clock']) {
        test(`${transportKind} ${era}, dates=${format || 'default'}: every tool reports its expected status with client output validation enabled`, { timeout: 30000 }, async () => {
            const savedFormat = process.env.FIREBIRD_DATE_FORMAT, savedTz = process.env.TZ;
            if (format === undefined) delete process.env.FIREBIRD_DATE_FORMAT;
            else process.env.FIREBIRD_DATE_FORMAT = format;
            process.env.TZ = 'UTC'; // Non-UTC and DST wire decoding has its separate matrix.
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
                    assertToolStatus(name, response, catalog.tools.map(tool => tool.name));
                    assert.deepEqual(tools.get(name).outputSchema.parse(response.structuredContent), response.structuredContent);
                    if (name === 'execute-query') {
                        const expectedDate = format === 'wall-clock' ? '2026-09-30 00:00:00.000' : '2026-09-30T00:00:00.000Z';
                        assert.equal(response.structuredContent.result.rows[0].CREATED, expectedDate);
                        assert.equal(JSON.parse(response.content[0].text).rows[0].CREATED, expectedDate);
                    }
                }
            } finally {
                await client.close();
                if (http) await http.close();
                if (listener) await new Promise(resolve => listener.close(resolve));
                if (savedFormat === undefined) delete process.env.FIREBIRD_DATE_FORMAT; else process.env.FIREBIRD_DATE_FORMAT = savedFormat;
                if (savedTz === undefined) delete process.env.TZ; else process.env.TZ = savedTz;
            }
        });
      }
    }
}
