import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { Client as V1Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport as V1Stdio } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport as V1Http } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { installContractDriver } from './fixtures/contract-driver.mjs';

process.env.LOG_LEVEL = 'error';
process.env.USE_NATIVE_DRIVER = 'false';
installContractDriver({ plans: true });
const { closePool } = await import('../dist/db/connection.js');
const { createMcpServerInstance } = await import('../dist/server/index.js');
const { createHttpApplication } = await import('../dist/server/http-server.js');
const { loadHttpSecurityConfig } = await import('../dist/server/http-security.js');
after(closePool);

const payload = '<b>tofu-poc</b>{{value}}[link](javascript:alert(1))';
const encodedPayload = '&#60;b&#62;tofu-poc&#60;/b&#62;&#123;&#123;value&#125;&#125;&#91;link&#93;(javascript:alert(1))';

function stdioOptions(extraEnv = {}) {
    const env = { ...process.env, TRANSPORT_TYPE: 'stdio', LOG_LEVEL: 'info', ...extraEnv };
    for (const key of ['FIREBIRD_SECURITY_CONFIG', 'SECURITY_CONFIG', 'SECURITY_CONFIG_PATH', 'FIREBIRD_SECURITY_JSON', 'QUERY_TIMEOUT', 'ALLOW_RAW_SQL']) delete env[key];
    return { command: process.execPath, args: ['tests/fixtures/output-encoding-server.mjs'], env, stderr: 'pipe' };
}

function assertJsonResponse(response) {
    assert.doesNotMatch(response.content[0].text, /<b>|{{value}}|\[link\]/);
    assert.deepEqual(JSON.parse(response.content[0].text), response.structuredContent.result);
}

for (const transportKind of ['stdio', 'http']) for (const era of ['sdk1', 'legacy', 'modern']) {
    test(`issue #47: ${transportKind} ${era} encodes all reported tools and preserves structured data`, { timeout: 30000 }, async () => {
        const client = era === 'sdk1' ? new V1Client({ name: 'encoding-sdk1', version: '1' }) : new Client(
            { name: 'encoding-sdk2', version: '1' }, era === 'modern' ? { versionNegotiation: { mode: { pin: '2026-07-28' } } } : {});
        let http, listener;
        let stderr = '';
        try {
            let transport;
            if (transportKind === 'stdio') {
                transport = era === 'sdk1' ? new V1Stdio(stdioOptions()) : new StdioClientTransport(stdioOptions());
                transport.stderr.on('data', chunk => { stderr += chunk.toString(); });
            } else {
                process.env.STREAMABLE_STATELESS_MODE = 'false';
                http = createHttpApplication(createMcpServerInstance, loadHttpSecurityConfig({}));
                listener = http.app.listen(0, '127.0.0.1');
                await once(listener, 'listening');
                const url = new URL(`http://127.0.0.1:${listener.address().port}/mcp`);
                transport = era === 'sdk1' ? new V1Http(url) : new StreamableHTTPClientTransport(url);
            }
            await client.connect(transport);
            await client.listTools(); // Enable client output-schema validation.

            const echo = await client.callTool({ name: 'echo', arguments: { message: payload } });
            assert.equal(echo.content[0].text, encodedPayload);
            assert.deepEqual(echo.structuredContent.result, { message: payload });
            if (transportKind === 'stdio') {
                assert.match(stderr, /Echo tool called/);
                assert.ok(!stderr.includes(payload), 'echo must not log the caller message');
            }

            const batch = await client.callTool({ name: 'describe-batch-tables', arguments: { tableNames: [payload], maxConcurrent: 1 } });
            assert.notEqual(batch.isError, true);
            assertJsonResponse(batch);
            assert.equal(batch.structuredContent.result[0].tableName, payload);

            const sql = `SELECT '${payload}' FROM CUSTOMERS`;
            const plan = await client.callTool({ name: 'get-execution-plan', arguments: { sql } });
            assert.notEqual(plan.isError, true);
            assertJsonResponse(plan);
            assert.equal(plan.structuredContent.result.query, sql);

            const catalog = await client.callTool({ name: 'list-available-tools', arguments: { category: payload } });
            const prefix = `Available tools (category: ${encodedPayload}):\n\n`;
            assert.ok(catalog.content[0].text.startsWith(prefix));
            assert.deepEqual(JSON.parse(catalog.content[0].text.slice(prefix.length)), catalog.structuredContent.result);

            const help = await client.callTool({ name: 'get-tool-help', arguments: { toolName: payload } });
            assert.equal(help.isError, true);
            assert.ok(help.content[0].text.includes(encodedPayload));
            assert.ok(help.structuredContent.error.message.includes(payload));
        } finally {
            await client.close();
            if (http) await http.close();
            if (listener) await new Promise(resolve => listener.close(resolve));
        }
    });
}

test('issue #47: connection failures encode table names and driver errors without a Firebird server', { timeout: 30000 }, async () => {
    const client = new Client({ name: 'encoding-failure', version: '1' });
    try {
        await client.connect(new StdioClientTransport(stdioOptions({ OUTPUT_ENCODING_DRIVER_FAILURE: 'true' })));
        await client.listTools();
        const response = await client.callTool({ name: 'describe-batch-tables', arguments: { tableNames: [payload], maxConcurrent: 1 } });
        assert.equal(response.isError, true);
        assertJsonResponse(response);
        const item = response.structuredContent.result[0];
        assert.equal(item.tableName, payload);
        assert.equal(item.schema, null);
        assert.ok(item.error.includes('<b>tofu-poc</b>'));
    } finally { await client.close(); }
});
