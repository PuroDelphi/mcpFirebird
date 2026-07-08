/**
 * Tests for ConnectionPool self-healing behavior:
 * - validate-on-acquire (probe)
 * - evict-on-error (destroy vs release)
 * - idle reaper (max-age)
 *
 * These lock in the fix for the pool handing back dead/stale connections
 * forever once one breaks.
 */

// driver-factory.ts uses ESM-only `import.meta.url`, which can't load under the
// CommonJS test runtime — mock it so only the pool logic is exercised.
jest.mock('../../db/driver-factory.js', () => ({
    DriverFactory: { getDriver: jest.fn() },
    DriverType: { PURE_JS: 'node-firebird', NATIVE: 'node-firebird-driver-native' }
}));

import { ConnectionPool, ConfigOptions } from '../../db/connection.js';
import { DriverFactory } from '../../db/driver-factory.js';

interface FakeDb {
    id: number;
    detached: boolean;
    alive: boolean;
    query: (sql: string, params: any[], cb: (err: Error | null, rows?: any[]) => void) => void;
    detach: (cb?: (err: Error | null) => void) => void;
    [key: string]: any;
}

const config: ConfigOptions = {
    host: '127.0.0.1',
    port: 3050,
    database: '/tmp/test.fdb',
    user: 'SYSDBA',
    password: 'masterkey'
};

let counter = 0;
function makeFakeDb(): FakeDb {
    const db: FakeDb = {
        id: ++counter,
        detached: false,
        alive: true,
        query(_sql, _params, cb) {
            // The pool's read-only probe goes through this path.
            if (!db.alive) {
                cb(new Error('connection lost'));
                return;
            }
            cb(null, [{ CONST: 1 }]);
        },
        detach(cb) {
            db.detached = true;
            if (cb) cb(null);
        }
    };
    return db;
}

/**
 * Latest connections handed out by the mocked driver, in creation order.
 */
let created: FakeDb[] = [];

beforeEach(() => {
    counter = 0;
    created = [];
    (DriverFactory.getDriver as jest.Mock).mockResolvedValue({
        attach: async () => {
            const db = makeFakeDb();
            created.push(db);
            return db as any;
        }
    });
});

afterEach(() => {
    jest.clearAllMocks();
});

describe('ConnectionPool self-healing', () => {
    test('reuses a healthy pooled connection after probe passes', async () => {
        const pool = new ConnectionPool(config, 5, 60000);

        const db1 = await pool.acquire();
        pool.release(db1);

        const db2 = await pool.acquire();
        expect(db2).toBe(db1);          // same physical connection reused
        expect(created).toHaveLength(1); // no extra connection opened
    });

    test('discards a stale pooled connection (probe fails) and opens a fresh one', async () => {
        const pool = new ConnectionPool(config, 5, 60000);

        const db1 = (await pool.acquire()) as FakeDb;
        pool.release(db1);

        // Simulate an idle socket drop: the connection is dead but still pooled.
        db1.alive = false;

        const db2 = (await pool.acquire()) as FakeDb;
        expect(db2).not.toBe(db1);      // stale one not handed back
        expect(db1.detached).toBe(true); // it was really disconnected
        expect(created).toHaveLength(2);
    });

    test('handles several stale pooled connections in a row', async () => {
        const pool = new ConnectionPool(config, 5, 60000);

        const a = (await pool.acquire()) as FakeDb;
        const b = (await pool.acquire()) as FakeDb;
        pool.release(a);
        pool.release(b);
        a.alive = false;
        b.alive = false;

        const fresh = (await pool.acquire()) as FakeDb;
        expect(fresh).not.toBe(a);
        expect(fresh).not.toBe(b);
        expect(a.detached).toBe(true);
        expect(b.detached).toBe(true);
        expect(fresh.alive).toBe(true);
    });

    test('reaps a pooled connection older than the idle TTL', async () => {
        const pool = new ConnectionPool(config, 5, 60000);

        const db1 = (await pool.acquire()) as FakeDb;
        pool.release(db1);

        // Age it past the TTL without killing the socket; the reaper must not
        // even bother probing — it should reopen fresh.
        db1._lastUsed = Date.now() - 999999;

        const db2 = (await pool.acquire()) as FakeDb;
        expect(db2).not.toBe(db1);
        expect(db1.detached).toBe(true);
    });

    test('idleMs = 0 disables the reaper', async () => {
        const pool = new ConnectionPool(config, 5, 0);

        const db1 = (await pool.acquire()) as FakeDb;
        pool.release(db1);
        db1._lastUsed = Date.now() - 999999;

        const db2 = (await pool.acquire()) as FakeDb;
        expect(db2).toBe(db1);          // not reaped despite age
    });

    test('destroy() really disconnects and never recycles', async () => {
        const pool = new ConnectionPool(config, 1, 60000); // max 1 to prove the slot frees

        const db1 = (await pool.acquire()) as FakeDb;
        pool.destroy(db1);
        expect(db1.detached).toBe(true);

        // Slot was freed: a new acquire succeeds with a different connection.
        const db2 = (await pool.acquire()) as FakeDb;
        expect(db2).not.toBe(db1);
    });

    test('a waiter is served with a fresh connection after destroy frees a slot', async () => {
        const pool = new ConnectionPool(config, 1, 60000);

        const db1 = (await pool.acquire()) as FakeDb;

        // Second acquire blocks — pool is at capacity and db1 is checked out.
        let resolved = false;
        const pending = pool.acquire().then((db) => { resolved = true; return db; });

        // Give the microtask queue a tick; the waiter should still be parked.
        await Promise.resolve();
        expect(resolved).toBe(false);

        // Destroying the in-flight connection must open a replacement for the waiter.
        pool.destroy(db1);

        const db2 = (await pending) as FakeDb;
        expect(resolved).toBe(true);
        expect(db2).not.toBe(db1);
        expect(db2.alive).toBe(true);
    });

    test('monkey-patched db.detach() releases back to the pool', async () => {
        const pool = new ConnectionPool(config, 5, 60000);

        const db1 = (await pool.acquire()) as FakeDb;
        await new Promise<void>((resolve) => db1.detach(() => resolve()));

        const db2 = await pool.acquire();
        expect(db2).toBe(db1);          // detach() recycled it, didn't close it
        expect((db1 as FakeDb).detached).toBe(false);
    });
});
