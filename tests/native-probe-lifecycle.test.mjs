import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let nativeDriverAvailable = true;
try {
    const nativeRequire = createRequire(require.resolve('node-firebird-driver-native'));
    nativeRequire.resolve('node-firebird-driver/dist/lib/impl');
} catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    nativeDriverAvailable = false;
}

// Use production JavaScript and the real driver's ownership/cleanup classes.
// Only native I/O is substituted: no Firebird installation or database is used.
// Fatal unhandled rejections ensure a late cleanup failure cannot silently pass.
for (const scenario of ['failure', 'timeout']) {
    test(`native pool probe ${scenario} drains handles before disconnecting`, {
        skip: nativeDriverAvailable ? false : 'optional native driver is not installed'
    }, () => {
        const source = `
            import assert from 'node:assert/strict';
            import Module, { createRequire } from 'node:module';
            import { DriverFactory } from './dist/db/driver-factory.js';
            import { ConnectionPool, queryDatabase } from './dist/db/connection.js';
            const require = createRequire(import.meta.url);
            const nativeRequire = createRequire(require.resolve('node-firebird-driver-native'));
            const { AbstractAttachment, AbstractStatement, AbstractResultSet, AbstractTransaction } =
                nativeRequire('node-firebird-driver/dist/lib/impl');
            const scenario = ${JSON.stringify(scenario)};
            const deferred = () => {
                let resolve;
                const promise = new Promise(done => { resolve = done; });
                return { promise, resolve };
            };
            const fetchStarted = deferred();
            const finishFetch = deferred();
            const closeStarted = deferred();
            const finishClose = deferred();
            const drain = () => new Promise(resolve => setImmediate(resolve));
            let attached = 0, detached = 0, closes = 0, activeCloses = 0;
            let maxConcurrentCloses = 0, fetchPending = false, detachedWhileBusy = false;

            class Transaction extends AbstractTransaction {
                async internalRollback() {}
                async internalCommit() {}
            }
            class ResultSet extends AbstractResultSet {
                async internalFetch() {
                    if (this.statement.attachment.id === 1) {
                        fetchStarted.resolve();
                        if (scenario === 'failure') throw new Error('controlled native probe failure');
                        fetchPending = true;
                        await finishFetch.promise;
                        fetchPending = false;
                    }
                    return { finished: true, rows: [[1]] };
                }
                async internalClose() {
                    if (this.statement.attachment.id !== 1) return;
                    closes++;
                    activeCloses++;
                    maxConcurrentCloses = Math.max(maxConcurrentCloses, activeCloses);
                    closeStarted.resolve();
                    await finishClose.promise;
                    activeCloses--;
                }
            }
            class Statement extends AbstractStatement {
                hasResultSet = true;
                get columnLabels() { return Promise.resolve(['VALUE']); }
                async internalExecuteQuery(transaction) { return new ResultSet(this, transaction); }
                async internalDispose() {}
            }
            class Attachment extends AbstractAttachment {
                constructor(client) { super(client); this.id = ++attached; }
                async internalStartTransaction() { return new Transaction(this); }
                async internalPrepare() { return new Statement(this); }
                async internalDisconnect() {
                    if (this.id === 1 && (fetchPending || activeCloses > 0)) detachedWhileBusy = true;
                    detached++;
                }
            }
            const client = {
                attachments: new Set(),
                async connect() {
                    const attachment = new Attachment(this);
                    this.attachments.add(attachment);
                    return attachment;
                }
            };
            const native = {
                createNativeClient: () => client,
                getDefaultLibraryFilename: () => 'mocked-native-I/O'
            };
            const originalLoad = Module._load;
            try {
                Module._load = function(request, parent, isMain) {
                    if (request === 'node-firebird-driver-native') return native;
                    return originalLoad.call(this, request, parent, isMain);
                };
                DriverFactory.setUseNativeDriver(true);
                await DriverFactory.getDriver();
            } finally {
                Module._load = originalLoad;
            }
            assert.equal(Module._load, originalLoad);
            assert.equal((await DriverFactory.getDriver()).getType(), 'node-firebird-driver-native');

            const config = { host: 'mock-only', port: 3050, database: 'mock-only', user: 'test', password: 'test' };
            const pool = new ConnectionPool(config, 1, 0);
            const first = await pool.acquire();
            assert.ok(first._nativeAttachment instanceof Attachment, 'production native adapter must be used');
            pool.release(first);

            // Manually fire the production probe's 5-second deadline. The real
            // timer is cleared by production code, and the override is restored
            // immediately after acquire starts, so the test needs no long sleep.
            const originalSetTimeout = globalThis.setTimeout;
            let expireProbe;
            let pending;
            let replacementReady = false;
            try {
                if (scenario === 'timeout') {
                    globalThis.setTimeout = (callback, delay, ...args) => {
                        if (delay !== 5000) return originalSetTimeout(callback, delay, ...args);
                        expireProbe = () => callback(...args);
                        return originalSetTimeout(callback, 60000, ...args).unref();
                    };
                }
                pending = pool.acquire().then(db => { replacementReady = true; return db; });
            } finally {
                globalThis.setTimeout = originalSetTimeout;
            }
            await fetchStarted.promise;
            if (scenario === 'timeout') {
                assert.equal(typeof expireProbe, 'function', 'production probe deadline must be installed');
                expireProbe();
                await drain();
                assert.equal(closes, 0, 'probe expiry must not close a result set during fetch');
                assert.equal(detached, 0, 'probe expiry must not disconnect pending native I/O');
                assert.equal(attached, 1, 'expired probe must retain its pool slot while I/O is pending');
                assert.equal(replacementReady, false);
                finishFetch.resolve();
            }
            await closeStarted.promise;
            await drain();
            assert.equal(closes, 1, 'adapter cleanup must be the only result-set close');
            assert.equal(maxConcurrentCloses, 1, 'disconnect must not race native result-set cleanup');
            assert.equal(detached, 0, 'native attachment must stay connected through cleanup');
            assert.equal(attached, 1, 'no replacement may bypass the reserved pool slot');
            assert.equal(replacementReady, false, 'acquire must wait for native cleanup');

            finishClose.resolve();
            const replacement = await pending;
            await drain();
            assert.notEqual(replacement, first);
            assert.equal(attached, 2);
            assert.equal(detached, 1);
            assert.equal(detachedWhileBusy, false);
            assert.equal(closes, 1);
            assert.equal(maxConcurrentCloses, 1);
            assert.deepEqual(await queryDatabase(replacement, 'SELECT 1 FROM RDB$DATABASE'), [{ VALUE: 1 }]);
            pool.release(replacement);
            await pool.destroyAll();
            assert.equal(detached, 2);
            await drain();
            console.log('native probe ' + scenario + ': single close; replacement query succeeded');
        `;
        const child = spawnSync(process.execPath, ['--unhandled-rejections=strict', '--input-type=module', '-e', source], {
            cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 10000,
            env: { ...process.env, LOG_LEVEL: 'error', USE_NATIVE_DRIVER: 'false' }
        });
        assert.equal(child.status, 0, child.stderr || child.error?.message);
        assert.doesNotMatch(child.stderr, /Error closing result set|Error disposing statement|Cannot set properties of undefined/);
        assert.match(child.stdout, /single close; replacement query succeeded/);
    });
}
