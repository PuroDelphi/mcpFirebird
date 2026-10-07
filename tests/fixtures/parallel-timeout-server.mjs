// Driver-boundary fixture only: real SQL policy, pool, handlers and stdio MCP.
// No Firebird service or native library is used.
import assert from 'node:assert/strict';
import { DriverFactory } from '../../dist/db/driver-factory.js';

globalThis.MCP_FIREBIRD_CONFIG = {
    host: '127.0.0.1', port: 3050, database: 'mock-parallel-timeout-only', user: 'test', password: 'test'
};
let attached = 0, detached = 0;
let finishSlow, markSlowDone;
const slowGate = new Promise(resolve => { finishSlow = resolve; });
const slowDone = new Promise(resolve => { markSlowDone = resolve; });
DriverFactory.getDriver = async () => ({ attach: async () => {
    const id = ++attached;
    let closed = false;
    return {
        async query(sql, params, callback) {
            if (sql === 'SELECT SLOW FROM T') {
                try {
                    await slowGate;
                    assert.equal(closed, false, 'timed-out query detached during pending I/O');
                    if (process.env.LATE_QUERY_OUTCOME === 'rejection') throw new Error('controlled late query rejection');
                    callback(null, [{ VALUE: 'late' }]);
                } finally { markSlowDone(); }
            } else if (sql === 'SELECT 1 FROM RDB$DATABASE' && id === 2) {
                // Native-style callback precedes async error-path cleanup.
                callback(new Error('controlled pooled probe failure'));
                await new Promise(resolve => setTimeout(resolve, 20));
                assert.equal(closed, false, 'pooled probe detached during native cleanup');
            } else {
                if (sql === 'SELECT RELEASE FROM T') {
                    finishSlow();
                    await slowDone;
                    await new Promise(resolve => setImmediate(resolve));
                }
                callback(null, [{ ID: id, ATTACHED: attached, DETACHED: detached }]);
            }
        },
        detach(callback) { closed = true; detached++; callback(null); }
    };
} });
const { main } = await import('../../dist/server/index.js');
await main();
