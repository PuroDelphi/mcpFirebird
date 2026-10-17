import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { Client as V1Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport as V1Stdio } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport as V1Http } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { installContractDriver } from './fixtures/contract-driver.mjs';

process.env.LOG_LEVEL = 'error'; process.env.USE_NATIVE_DRIVER = 'false';
installContractDriver({ plans: true });
const { closePool } = await import('../dist/db/connection.js');
const { createMcpServerInstance } = await import('../dist/server/index.js');
const { createHttpApplication } = await import('../dist/server/http-server.js');
const { loadHttpSecurityConfig } = await import('../dist/server/http-security.js');
after(closePool);

for (const transportKind of ['stdio', 'http']) for (const era of ['sdk1', 'legacy', 'modern']) {
    test(`${transportKind} ${era}: real diagnostic handlers return plans and catalog-checked advice`, { timeout: 30000 }, async () => {
        const client = era === 'sdk1' ? new V1Client({ name: 'diagnostics-sdk1', version: '1' }) : new Client(
            { name: 'diagnostics-sdk2', version: '1' }, era === 'modern' ? { versionNegotiation: { mode: { pin: '2026-07-28' } } } : {});
        let http, listener;
        try {
            let transport;
            if (transportKind === 'stdio') {
                const env = { ...process.env, TRANSPORT_TYPE: 'stdio', LOG_LEVEL: 'error' };
                for (const key of ['FIREBIRD_SECURITY_CONFIG', 'SECURITY_CONFIG', 'SECURITY_CONFIG_PATH', 'FIREBIRD_SECURITY_JSON', 'QUERY_TIMEOUT', 'ALLOW_RAW_SQL']) delete env[key];
                const options = { command: process.execPath, args: ['tests/fixtures/diagnostics-server.mjs'], env, stderr: 'pipe' };
                transport = era === 'sdk1' ? new V1Stdio(options) : new StdioClientTransport(options);
            } else {
                process.env.STREAMABLE_STATELESS_MODE = 'false';
                http = createHttpApplication(createMcpServerInstance, loadHttpSecurityConfig({}));
                listener = http.app.listen(0, '127.0.0.1'); await once(listener, 'listening');
                const url = new URL(`http://127.0.0.1:${listener.address().port}/mcp`);
                transport = era === 'sdk1' ? new V1Http(url) : new StreamableHTTPClientTransport(url);
            }
            await client.connect(transport); await client.listTools();
            const call = async (name, args) => {
                const response = await client.callTool({ name, arguments: args });
                assert.notEqual(response.isError, true, JSON.stringify(response)); assert.equal(response.structuredContent.success, true);
                assert.deepEqual(JSON.parse(response.content[0].text), response.structuredContent.result);
                return response.structuredContent.result;
            };
            const plan = await call('get-execution-plan', { sql: 'SELECT * FROM CUSTOMERS WHERE ID = ?', params: [1] });
            assert.equal(plan.plan, 'PLAN (CUSTOMERS INDEX (IX_CUSTOMERS))'); assert.equal(plan.success, true); assert.deepEqual(plan.planDetails, []);
            assert.match(plan.analysis, /without execution/);
            assert.deepEqual((await call('analyze-missing-indexes', { sql: 'SELECT * FROM CUSTOMERS WHERE ID = ?' })).missingIndexes, []);
            const missing = await call('analyze-missing-indexes', { sql: 'SELECT * FROM CUSTOMERS WHERE NAME = ?' });
            assert.equal(missing.missingIndexes.length, 1); assert.match(missing.missingIndexes[0], /ON "CUSTOMERS" \("NAME"\)/);
            const failure = await client.callTool({ name: 'get-execution-plan', arguments: { sql: 'DELETE FROM CUSTOMERS' } });
            assert.equal(failure.isError, true); assert.equal(failure.structuredContent.success, false);
        } finally {
            await client.close(); if (http) await http.close(); if (listener) await new Promise(resolve => listener.close(resolve));
        }
    });
}
