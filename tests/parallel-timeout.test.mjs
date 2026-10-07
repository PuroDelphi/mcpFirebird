import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { Client as V1Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport as V1Stdio } from '@modelcontextprotocol/sdk/client/stdio.js';

for (const era of ['sdk1', 'legacy', 'modern']) {
    for (const outcome of ['success', 'rejection']) {
        test(`${era}: parallel timeout, next-turn probe failure and late ${outcome} preserve stdio`, { timeout: 15000 }, async () => {
            const env = {
                ...process.env, TRANSPORT_TYPE: 'stdio', LOG_LEVEL: 'error',
                FIREBIRD_POOL_MAX: '2', FIREBIRD_POOL_IDLE_MS: '0',
                QUERY_TIMEOUT: '200', LATE_QUERY_OUTCOME: outcome
            };
            for (const key of ['FIREBIRD_SECURITY_CONFIG', 'SECURITY_CONFIG', 'SECURITY_CONFIG_PATH', 'FIREBIRD_SECURITY_JSON', 'ALLOW_RAW_SQL']) delete env[key];
            const options = {
                command: process.execPath,
                args: ['--unhandled-rejections=strict', 'tests/fixtures/parallel-timeout-server.mjs'],
                env, stderr: 'pipe'
            };
            const transport = era === 'sdk1' ? new V1Stdio(options) : new StdioClientTransport(options);
            let stderr = '';
            transport.stderr.on('data', chunk => { stderr += chunk; });
            const client = era === 'sdk1' ? new V1Client({ name: 'timeout-sdk1', version: '1' }) : new Client(
                { name: 'timeout-sdk2', version: '1' },
                era === 'modern' ? { versionNegotiation: { mode: { pin: '2026-07-28' } } } : {}
            );
            const query = sql => client.callTool({ name: 'execute-query', arguments: { sql } });
            try {
                await client.connect(transport);
                await client.listTools(); // Keep discovered output-schema validation enabled.
                const [slow, fast] = await Promise.all([query('SELECT SLOW FROM T'), query('SELECT FAST FROM T')]);
                assert.equal(slow.isError, true);
                assert.equal(slow.structuredContent.error.type, 'QUERY_TIMEOUT');
                assert.equal(fast.structuredContent.success, true);
                const next = await query('SELECT NEXT FROM T');
                assert.equal(next.structuredContent.success, true, JSON.stringify(next));
                assert.deepEqual(next.structuredContent.result.rows, [{ ID: 3, ATTACHED: 3, DETACHED: 1 }]);
                const drained = await query('SELECT RELEASE FROM T');
                assert.equal(drained.structuredContent.success, true, JSON.stringify(drained));
                assert.deepEqual(drained.structuredContent.result.rows, [{ ID: 3, ATTACHED: 3, DETACHED: 2 }]);
                const final = await query('SELECT FINAL FROM T');
                assert.equal(final.structuredContent.success, true);
                assert.doesNotMatch(stderr, /AssertionError|Cannot set properties of undefined|Error closing result set|UnhandledPromiseRejection/);
            } catch (error) {
                throw new Error(`${error.message}\nServer stderr:\n${stderr}`, { cause: error });
            } finally { await client.close(); }
        });
    }
}
