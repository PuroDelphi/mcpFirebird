// Run after npm run build: node src/__tests__/security/runtime-smoke.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { loadSecurityConfig } from '../../../dist/security/config.js';

const directory = mkdtempSync(join(tmpdir(), 'mcp-security-runtime-'));
const policy = join(directory, 'policy.json');
const commonjs = join(directory, 'policy.cjs');
const env = { ...process.env, LOG_LEVEL: 'info', DOTENV_CONFIG_QUIET: 'true' };
for (const key of ['FIREBIRD_SECURITY_CONFIG', 'SECURITY_CONFIG', 'SECURITY_CONFIG_PATH']) delete env[key];

try {
    writeFileSync(policy, JSON.stringify({ security: { forbiddenTables: ['PRIVATE_DATA'], maxRows: 17 } }));
    writeFileSync(commonjs, 'module.exports = { security: { maxRows: 19 } };');
    assert.equal(loadSecurityConfig(policy).maxRows, 17);
    assert.equal(loadSecurityConfig(commonjs).maxRows, 19);

    for (const args of [['--security-config'], ['--security-config=']]) {
        const result = spawnSync(process.execPath, ['dist/cli.js', ...args], { env, encoding: 'utf8', timeout: 10000 });
        assert.equal(result.status, 1, result.stderr);
        assert.match(result.stderr, /--security-config requires a configuration file path/);
    }

    // CLI override must win over all environment aliases. Exercise the actual
    // MCP protocol without requiring a database: authorization rejects first.
    const transport = new StdioClientTransport({
        command: process.execPath,
        args: ['dist/cli.js', '--transport-type', 'stdio', '--security-config', policy],
        env: { ...env, FIREBIRD_SECURITY_CONFIG: commonjs, SECURITY_CONFIG: commonjs, SECURITY_CONFIG_PATH: commonjs },
        stderr: 'pipe'
    });
    let logs = '';
    transport.stderr?.on('data', chunk => { logs += chunk.toString(); });
    const client = new Client({ name: 'security-regression', version: '1.0.0' });
    try {
        await client.connect(transport);
        const result = await client.callTool({ name: 'get-table-indexes', arguments: { tableName: 'PRIVATE_DATA' } });
        assert.match(JSON.stringify(result), /not allowed|forbidden|denied/i);
        assert.ok(logs.includes(`Loaded security configuration from ${policy}`), logs);
    } finally {
        await client.close();
    }
    console.log('ESM JSON/CommonJS, CLI validation, CLI precedence, and MCP authorization smoke checks passed.');
} finally {
    rmSync(directory, { recursive: true, force: true });
}
