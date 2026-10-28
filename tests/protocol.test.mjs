import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { spawn } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport, SSEClientTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { createMcpServerInstance } from '../dist/server/index.js';
import { createHttpApplication } from '../dist/server/http-server.js';
import { loadHttpSecurityConfig } from '../dist/server/http-security.js';
import { securityConfig } from '../dist/security/config.js';

process.env.LOG_LEVEL = 'error';
process.env.USE_NATIVE_DRIVER = 'false';
// Never import a developer's .env or bind a configured production port.
process.env.DOTENV_CONFIG_PATH = join(tmpdir(), `mcp-test-${randomUUID()}.env`);
process.env.PORT = '0';
process.env.MCP_HTTP_SECURITY_MODE = 'strict';

async function checkCatalog(client) {
    const { tools } = await client.listTools();
    assert(tools.length >= 29);
    const query = tools.find(tool => tool.name === 'execute-query');
    assert.equal(query.inputSchema.type, 'object');
    assert.equal(query.outputSchema.type, 'object');
    assert.equal(query.annotations.readOnlyHint, false);
    assert.equal(query.annotations.destructiveHint, true);
    assert((await client.listResources()).resources.length > 0);
    assert((await client.listResourceTemplates()).resourceTemplates.length > 0);
    assert((await client.listPrompts()).prompts.length > 0);
    for (const [name, argument] of [['migration-planning', 'migrationType'], ['query-optimization-guide', 'queryType'], ['database-health-check', 'focusAreas'], ['security-audit', 'auditScope']]) {
        for (const args of [{}, { [argument]: '$1' }]) {
            const prompt = await client.getPrompt({ name, arguments: args });
            assert.ok(prompt.messages[0].content.text);
            assert.ok(!prompt.messages[0].content.text.includes('undefined'));
        }
    }
    const failed = await client.callTool({ name: 'execute-query', arguments: { sql: 'DROP TABLE NOT_ALLOWED' } });
    assert.equal(failed.isError, true);
    assert.equal(failed.structuredContent.success, false);
    assert(failed.content[0].text);
    const invalid = await client.callTool({ name: 'execute-query', arguments: {} });
    assert.equal(invalid.isError, true);
}

for (const era of ['legacy', 'modern']) {
    for (const entry of ['dist/cli.js', 'dist/index.js']) {
        test(`${entry}: ${era} stdio catalog and errors`, { timeout: 20000 }, async () => {
            const transport = new StdioClientTransport({ command: process.execPath, args: [entry], stderr: 'pipe', env: {
                ...process.env, TRANSPORT_TYPE: 'stdio', LOG_LEVEL: 'error',
                FIREBIRD_SECURITY_JSON: JSON.stringify({ security: { allowedOperations: ['SELECT'] } })
            } });
            const client = new Client({ name: 'protocol-test', version: '1' }, era === 'modern'
                ? { versionNegotiation: { mode: { pin: '2026-07-28' } } } : {});
            try {
                await client.connect(transport);
                assert.equal(client.getProtocolEra(), era);
                await checkCatalog(client);
            } finally { await client.close(); }
        });
    }
}

for (const stateless of [false, true]) {
    for (const era of ['legacy', 'modern']) {
        test(`HTTP ${era}, legacy stateless=${stateless}`, { timeout: 20000 }, async () => {
            process.env.STREAMABLE_STATELESS_MODE = String(stateless);
            securityConfig.allowedOperations = ['SELECT'];
            const http = createHttpApplication(createMcpServerInstance, loadHttpSecurityConfig({}));
            const listener = http.app.listen(0, '127.0.0.1');
            await once(listener, 'listening');
            const url = new URL(`http://127.0.0.1:${listener.address().port}/mcp`);
            const transport = new StreamableHTTPClientTransport(url);
            const client = new Client({ name: 'http-test', version: '1' }, era === 'modern'
                ? { versionNegotiation: { mode: { pin: '2026-07-28' } } } : {});
            try {
                await client.connect(transport);
                assert.equal(client.getProtocolEra(), era);
                await checkCatalog(client);
                if (era === 'modern') assert.equal(transport.sessionId, undefined);
                else assert.equal(Boolean(transport.sessionId), !stateless);
            } finally {
                await client.close(); await http.close();
                await new Promise(resolve => listener.close(resolve));
            }
        });
    }
}

test('legacy SSE transport is connected to the same complete server', { timeout: 20000 }, async () => {
    const http = createHttpApplication(createMcpServerInstance, loadHttpSecurityConfig({}));
    const listener = http.app.listen(0, '127.0.0.1'); await once(listener, 'listening');
    const client = new Client({ name: 'sse-test', version: '1' });
    const transport = new SSEClientTransport(new URL(`http://127.0.0.1:${listener.address().port}/sse`));
    try { await client.connect(transport); await checkCatalog(client); }
    finally { await client.close(); await http.close(); await new Promise(resolve => listener.close(resolve)); }
});

for (const entry of ['dist/cli.js', 'dist/index.js', 'dist/http-entry.js']) {
    test(`${entry} starts an actual loopback HTTP listener`, { timeout: 15000 }, async () => {
        const child = spawn(process.execPath, [entry], { env: { ...process.env, TRANSPORT_TYPE: 'sse', SSE_PORT: '0', HTTP_PORT: '0', LOG_LEVEL: 'info' }, stdio: ['pipe', 'pipe', 'pipe'] });
        let stderr = '';
        child.stderr.on('data', chunk => { stderr += chunk; });
        try {
            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error(stderr)), 8000);
                child.stderr.on('data', () => {
                    if (stderr.includes('MCP HTTP server listening on 127.0.0.1:0')) { clearTimeout(timer); resolve(); }
                });
                child.once('exit', code => { clearTimeout(timer); reject(new Error(`Early exit ${code}: ${stderr}`)); });
            });
        } finally { child.kill('SIGTERM'); await once(child, 'exit'); }
    });
}

test('SDK 1 client remains compatible over HTTP', { timeout: 15000 }, async () => {
    const { Client: V1Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { StreamableHTTPClientTransport: V1Http } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
    process.env.STREAMABLE_STATELESS_MODE = 'false';
    const http = createHttpApplication(createMcpServerInstance, loadHttpSecurityConfig({}));
    const listener = http.app.listen(0, '127.0.0.1'); await once(listener, 'listening');
    const client = new V1Client({ name: 'v1-client', version: '1' });
    try {
        await client.connect(new V1Http(new URL(`http://127.0.0.1:${listener.address().port}/mcp`)));
        await checkCatalog(client);
    } finally { await client.close(); await http.close(); await new Promise(resolve => listener.close(resolve)); }
});

test('HTTP preserves valid gzip requests and survives malformed compressed bodies', { timeout: 10000 }, async () => {
    const http = createHttpApplication(createMcpServerInstance, loadHttpSecurityConfig({}));
    const listener = http.app.listen(0, '127.0.0.1');
    await once(listener, 'listening');
    const base = `http://127.0.0.1:${listener.address().port}`;
    const body = gzipSync(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
        protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'compressed-body-test', version: '1' }
    } }));
    const send = compressed => new Promise((resolve, reject) => {
        const req = httpRequest(base + '/mcp', { method: 'POST', headers: {
            'Content-Type': 'application/json', 'Content-Encoding': 'gzip',
            Accept: 'application/json, text/event-stream', 'Content-Length': compressed.length
        } }, res => {
            let text = '';
            res.on('data', chunk => { text += chunk.toString(); });
            res.once('error', reject);
            res.once('end', () => resolve({ status: res.statusCode, text }));
        });
        req.once('error', reject);
        req.setTimeout(3000, () => req.destroy(new Error('Compressed request timed out')));
        req.end(compressed);
    });
    try {
        const valid = await send(body);
        assert.equal(valid.status, 200);
        assert.match(valid.text, /"result"/);
        // Regression coverage for the body-parser trailing-bytes crash advisory.
        const malformed = await send(Buffer.concat([body, Buffer.from('trailing garbage')]));
        assert.equal(malformed.status, 400);
        assert.deepEqual(JSON.parse(malformed.text), { error: 'Request failed' });
        assert.equal((await fetch(base + '/')).status, 200);
        assert.equal((await send(body)).status, 200);
    } finally {
        await http.close();
        await new Promise(resolve => listener.close(resolve));
    }
});

test('real HTTP rejects rebinding and malformed modern headers before dispatch', { timeout: 10000 }, async () => {
    let created = 0;
    const http = createHttpApplication(async ctx => { created++; return createMcpServerInstance(ctx); }, loadHttpSecurityConfig({ MCP_HTTP_SECURITY_MODE: 'strict', MCP_ALLOWED_ORIGIN: 'https://app.example' }));
    const listener = http.app.listen(0, '127.0.0.1'); await once(listener, 'listening');
    const base = `http://127.0.0.1:${listener.address().port}`;
    try {
        const hostileStatus = await new Promise((resolve, reject) => {
            const req = httpRequest(base + '/health', { headers: { Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); });
            req.on('error', reject); req.end();
        });
        assert.equal(hostileStatus, 403);
        assert.equal((await fetch(base + '/mcp', { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' } })).status, 403);
        const preflight = await fetch(base + '/mcp', { method: 'OPTIONS', headers: {
            Origin: 'https://app.example', 'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'mcp-protocol-version,mcp-method,mcp-name,authorization'
        } });
        assert.equal(preflight.status, 204);
        assert(preflight.headers.get('access-control-allow-headers').toLowerCase().includes('mcp-method'));
        const nonJson = await fetch(base + '/mcp', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' });
        assert.equal(nonJson.status, 415);
        const empty = await fetch(base + '/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        assert.equal(empty.status, 400);
        const mismatch = await fetch(base + '/mcp', { method: 'POST', headers: {
            'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
            'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'tools/list'
        }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'server/discover', params: { _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {}
        } } }) });
        assert.equal(mismatch.status, 400); assert.equal((await mismatch.json()).error.code, -32020);
        assert.equal(created, 0);
    } finally { await http.close(); await new Promise(resolve => listener.close(resolve)); }
});
