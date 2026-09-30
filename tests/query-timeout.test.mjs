import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// A real Node subprocess with fatal unhandled rejections: do not mask the
// regression by installing a global uncaughtException/unhandledRejection hook.
for (const outcome of ['success', 'rejection', 'cleanup-rejection']) {
    test(`timeout keeps MCP process alive after late driver ${outcome}`, () => {
        const source = `
            import assert from 'node:assert/strict';
            import { DriverFactory } from './dist/db/driver-factory.js';
            import { executeQuery } from './dist/db/queries.js';
            import { closePool } from './dist/db/connection.js';
            import { securityConfig } from './dist/security/config.js';
            const outcome = ${JSON.stringify(outcome)};
            process.env.FIREBIRD_POOL_MAX = '1';
            process.env.LOG_LEVEL = 'error';
            let finish, detached = 0, attached = 0;
            DriverFactory.getDriver = async () => ({ attach: async () => {
                const id = ++attached;
                let closed = false;
                return {
                    query: async (sql, params, callback) => {
                        if (id === 1) {
                            if (outcome === 'cleanup-rejection') callback(null, [{ ID: 99 }]);
                            await new Promise(resolve => { finish = resolve; });
                            assert.equal(closed, false, 'attachment destroyed during driver I/O');
                            if (outcome !== 'success') throw new Error('late native driver rejection');
                            callback(null, [{ DATA: () => assert.fail('late result must not start BLOB reads') }]);
                        } else callback(null, [{ ID: 2 }]);
                    },
                    detach: callback => { closed = true; detached++; callback(null); }
                };
            } });
            const config = { host: '127.0.0.1', port: 3050, database: 'mock-only', user: 'test', password: 'test' };
            securityConfig.queryTimeout = 20;
            await assert.rejects(executeQuery('SELECT * FROM T', [], config), /deadline/);
            assert.equal(detached, 0);
            delete securityConfig.queryTimeout;
            const next = executeQuery('SELECT * FROM T', [], config);
            await new Promise(resolve => setTimeout(resolve, 10));
            assert.equal(attached, 1, 'pending operation must still occupy its pool slot');
            finish();
            assert.deepEqual(await next, [{ ID: 2 }]);
            assert.equal(detached, 1);
            await closePool();
            assert.equal(detached, 2);
            await new Promise(resolve => setTimeout(resolve, 10));
            console.log('timeout survived; next query succeeded');
        `;
        const child = spawnSync(process.execPath, ['--unhandled-rejections=strict', '--input-type=module', '-e', source], {
            cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 10000,
            env: { ...process.env, LOG_LEVEL: 'error', USE_NATIVE_DRIVER: 'false' }
        });
        assert.equal(child.status, 0, child.stderr || child.error?.message);
        assert.match(child.stdout, /timeout survived; next query succeeded/);
    });
}
