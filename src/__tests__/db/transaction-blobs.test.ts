jest.mock('../../db/driver-factory.js', () => ({ DriverFactory: {} }));
jest.mock('../../security/audit.js', () => ({ logQueryExecution: jest.fn().mockResolvedValue(undefined) }));
import Firebird from 'node-firebird';
import { EventEmitter } from 'events';
import * as connection from '../../db/connection.js';
import { executeQuery, executeAuditQuery } from '../../db/queries.js';
import { DEFAULT_SECURITY_CONFIG, securityConfig } from '../../security/config.js';

const tick = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
const fixture = () => {
    const tx = {
        query: jest.fn((_sql: string, _params: any[], cb: any): any => cb(null, [{ ID: 1 }])),
        commit: jest.fn((cb: any): any => cb(null)),
        rollback: jest.fn((cb: any): any => cb(null))
    };
    const db = { query: jest.fn(), detach: jest.fn(), transaction: jest.fn((_isolation: any, cb: any) => cb(null, tx)) };
    return { db, tx };
};

describe('transaction-owned pure-JS BLOB queries (#43)', () => {
    const raw = process.env.ALLOW_RAW_SQL;
    const originalDateFormat = process.env.FIREBIRD_DATE_FORMAT;
    const original = structuredClone(securityConfig);
    beforeEach(() => {
        jest.useFakeTimers();
        Object.keys(securityConfig).forEach(key => delete (securityConfig as any)[key]);
        Object.assign(securityConfig, structuredClone(DEFAULT_SECURITY_CONFIG));
        delete process.env.ALLOW_RAW_SQL;
        delete process.env.FIREBIRD_DATE_FORMAT;
    });
    afterEach(() => {
        jest.restoreAllMocks(); jest.useRealTimers();
        if (originalDateFormat === undefined) delete process.env.FIREBIRD_DATE_FORMAT;
        else process.env.FIREBIRD_DATE_FORMAT = originalDateFormat;
    });
    afterAll(() => {
        Object.keys(securityConfig).forEach(key => delete (securityConfig as any)[key]);
        Object.assign(securityConfig, original);
        if (raw === undefined) delete process.env.ALLOW_RAW_SQL; else process.env.ALLOW_RAW_SQL = raw;
    });

    function boundary(db: any) {
        const pool = { release: jest.fn(), destroy: jest.fn() };
        jest.spyOn(connection, 'getGlobalConfig').mockReturnValue(undefined as any);
        jest.spyOn(connection, 'connectToDatabase').mockResolvedValue(db);
        jest.spyOn(connection, 'getPool').mockReturnValue(pool as any);
        return pool;
    }

    it.each([undefined, '', '  ', 'iso', ' iso '])('preserves Date objects and legacy ISO output with format %p', async format => {
        if (format !== undefined) process.env.FIREBIRD_DATE_FORMAT = format;
        const { db, tx } = fixture();
        const stamp = new Date(2026, 8, 4, 23, 12, 26, 985), binary = Buffer.from([255, 0]);
        const source = [{ STAMP: stamp, NULL_DATE: null, binary }];
        tx.query.mockImplementation((_sql, _params, cb) => cb(null, source));
        const rows = await connection.queryDatabase(db, 'SELECT STAMP FROM T');
        expect(rows[0].STAMP).toBe(stamp);
        // Preserve the existing pure-JS BLOB decoder separately from date output.
        expect(JSON.parse(JSON.stringify(rows))[0]).toEqual({ STAMP: stamp.toISOString(), NULL_DATE: null, binary: binary.toString('utf8') });
        expect(tx.query).toHaveBeenCalledTimes(1); expect(tx.commit).toHaveBeenCalledTimes(1);
    });

    it('enables wall-clock output explicitly and snapshots the mode before SQL', async () => {
        process.env.FIREBIRD_DATE_FORMAT = 'wall-clock';
        const { db, tx } = fixture();
        tx.query.mockImplementation((_sql, _params, cb) => {
            process.env.FIREBIRD_DATE_FORMAT = 'iso';
            cb(null, [{ STAMP: new Date(2026, 8, 4, 23, 12, 26, 985), EMPTY: null }]);
        });
        await expect(connection.queryDatabase(db, 'SELECT STAMP FROM T')).resolves.toEqual([{ STAMP: '2026-09-04 23:12:26.985', EMPTY: null }]);
        expect(tx.query).toHaveBeenCalledTimes(1); expect(tx.commit).toHaveBeenCalledTimes(1);
    });

    it.each(['local', 'true', 'ISO', 'wallclock'])('rejects invalid date format %s before starting a transaction or write', async format => {
        process.env.FIREBIRD_DATE_FORMAT = format;
        const { db, tx } = fixture();
        await expect(connection.queryDatabase(db, 'UPDATE T SET V = 1')).rejects.toMatchObject({ type: 'CONFIG_INVALID_ERROR' });
        expect(db.transaction).not.toHaveBeenCalled(); expect(tx.query).not.toHaveBeenCalled();
        expect(tx.commit).not.toHaveBeenCalled(); expect(tx.rollback).not.toHaveBeenCalled();
    });

    it('preserves legacy invalid-Date JSON null behavior without opting in', () => {
        const rows = [{ STAMP: new Date(NaN) }];
        expect(connection.normalizePureJsDates(rows)).toBe(rows);
        expect(JSON.parse(JSON.stringify(rows))).toEqual([{ STAMP: null }]);
    });

    it('executes once, resolves later-row BLOBs inside their transaction, then commits', async () => {
        const { db, tx } = fixture();
        const blob = jest.fn((owner, cb) => {
            expect(owner).toBe(tx); expect(tx.commit).not.toHaveBeenCalled();
            const stream = new EventEmitter(); cb(null, 'NOTE', stream);
            stream.emit('data', Buffer.from('Türkçe İŞ ığüşöç')); stream.emit('end');
        });
        tx.query.mockImplementation((_sql, _params, cb) => cb(null, [{ NOTE: null }, { NOTE: blob }]));
        await expect(connection.queryDatabase(db, 'SELECT NOTE FROM T WHERE ID > ?', [0])).resolves.toEqual([{ NOTE: null }, { NOTE: 'Türkçe İŞ ığüşöç' }]);
        expect(tx.query).toHaveBeenCalledTimes(1); expect(db.query).not.toHaveBeenCalled();
        expect(db.transaction).toHaveBeenCalledWith(Firebird.ISOLATION_REPEATABLE_READ, expect.any(Function));
        expect(tx.commit).toHaveBeenCalledTimes(1);
    });

    it('preserves authorized writes and internal audit inserts without a new flag', async () => {
        const { db, tx } = fixture(); boundary(db);
        await expect(executeQuery('UPDATE T SET V = ?', [2])).rejects.toThrow('ALLOW_RAW_SQL');
        expect(tx.query).not.toHaveBeenCalled();
        process.env.ALLOW_RAW_SQL = 'true';
        await executeQuery('UPDATE T SET V = ?', [2]);
        delete process.env.ALLOW_RAW_SQL;
        await executeAuditQuery('INSERT INTO AUDIT_LOG (ID) VALUES (?)', [3]);
        expect(tx.query.mock.calls.map(call => call.slice(0, 2))).toEqual([
            ['UPDATE T SET V = ?', [2]], ['INSERT INTO AUDIT_LOG (ID) VALUES (?)', [3]]
        ]);
        expect(db.transaction.mock.calls.every(([mode]) => mode === Firebird.ISOLATION_REPEATABLE_READ)).toBe(true);
    });

    it.each(['callback', 'throw', 'promise'])('propagates %s commit failure and discards the attachment', async mode => {
        const { db, tx } = fixture(); const pool = boundary(db);
        tx.commit.mockImplementation(cb => {
            if (mode === 'callback') return cb(new Error('commit failed'));
            if (mode === 'promise') return Promise.reject(new Error('commit failed'));
            throw new Error('commit failed');
        });
        await expect(executeQuery('SELECT ID FROM T')).rejects.toThrow('commit failed');
        expect(tx.rollback).toHaveBeenCalledTimes(1);
        expect(pool.release).not.toHaveBeenCalled(); expect(pool.destroy).toHaveBeenCalledWith(db);
    });

    it('does not declare a silent commit complete after three seconds', async () => {
        const { db, tx } = fixture(); const pool = boundary(db); let commit!: any;
        tx.commit.mockImplementation(cb => { commit = cb; });
        let settled = false;
        const pending = executeQuery('SELECT ID FROM T').then(rows => { settled = true; return rows; });
        await tick(); jest.advanceTimersByTime(4000); await tick();
        expect(settled).toBe(false); expect(pool.release).not.toHaveBeenCalled();
        commit(null); await pending; expect(pool.release).toHaveBeenCalledWith(db);
    });

    it('keeps a timed-out query checked out until rollback, without starting late BLOB reads', async () => {
        const { db, tx } = fixture(); const pool = boundary(db);
        securityConfig.queryTimeout = 20;
        let query!: any, rollback!: any;
        tx.query.mockImplementation((_sql, _params, cb) => { query = cb; });
        tx.rollback.mockImplementation(cb => { rollback = cb; });
        const pending = expect(executeQuery('SELECT NOTE FROM T')).rejects.toMatchObject({ type: 'QUERY_TIMEOUT' });
        await tick(); jest.advanceTimersByTime(20); await pending;
        expect(pool.destroy).not.toHaveBeenCalled();
        const blob = jest.fn(); query(null, [{ NOTE: blob }]); await tick();
        expect(blob).not.toHaveBeenCalled(); expect(tx.commit).not.toHaveBeenCalled();
        expect(pool.destroy).not.toHaveBeenCalled(); rollback(null); await tick();
        expect(pool.destroy).toHaveBeenCalledTimes(1); expect(pool.release).not.toHaveBeenCalled();
    });

    it('drains an in-flight BLOB after deadline and only then rolls back/discards', async () => {
        const { db, tx } = fixture(); const pool = boundary(db); const stream = new EventEmitter();
        tx.query.mockImplementation((_sql, _params, cb) => cb(null, [{ NOTE: (_tx: any, cb: any) => cb(null, 'NOTE', stream) }]));
        securityConfig.queryTimeout = 20;
        const pending = expect(executeQuery('SELECT NOTE FROM T')).rejects.toMatchObject({ type: 'QUERY_TIMEOUT' });
        await tick(); jest.advanceTimersByTime(20); await pending;
        expect(tx.rollback).not.toHaveBeenCalled(); expect(pool.destroy).not.toHaveBeenCalled();
        stream.emit('end'); await tick();
        expect(tx.rollback).toHaveBeenCalledTimes(1); expect(tx.commit).not.toHaveBeenCalled();
        expect(pool.destroy).toHaveBeenCalledTimes(1);
    });

    it('waits for adapter promise cleanup after commit callback', async () => {
        const { db, tx } = fixture(); let finish!: () => void; let done = false;
        tx.commit.mockImplementation(async cb => { cb(null); await new Promise<void>(resolve => { finish = resolve; }); });
        const pending = connection.queryDatabase(db, 'SELECT ID FROM T').then(() => { done = true; });
        await tick(); expect(done).toBe(false); finish(); await pending;
    });

    it('preserves the query error after rollback error and never releases the attachment', async () => {
        const { db, tx } = fixture(); const pool = boundary(db);
        tx.query.mockImplementation((_sql, _params, cb) => cb(new Error('query failed')));
        tx.rollback.mockImplementation(cb => cb(new Error('rollback failed')));
        await expect(executeQuery('SELECT ID FROM T')).rejects.toThrow('query failed');
        expect(pool.release).not.toHaveBeenCalled(); expect(pool.destroy).toHaveBeenCalledTimes(1);
    });

    it('drains a delayed rollback after BLOB failure before discarding', async () => {
        const { db, tx } = fixture(); const pool = boundary(db); let rollback!: any;
        tx.query.mockImplementation((_sql, _params, cb) => cb(null, [{ NOTE: (_tx: any, cb: any) => cb(new Error('BLOB failed')) }]));
        tx.rollback.mockImplementation(cb => { rollback = cb; });
        const pending = expect(executeQuery('SELECT NOTE FROM T')).rejects.toThrow('BLOB failed');
        await tick(); jest.advanceTimersByTime(4000); await tick();
        expect(tx.commit).not.toHaveBeenCalled(); expect(pool.destroy).not.toHaveBeenCalled();
        rollback(null); await pending; expect(pool.destroy).toHaveBeenCalledTimes(1);
    });

    it('does not execute SQL when transaction acquisition completes after the deadline', async () => {
        const { db, tx } = fixture(); const pool = boundary(db); let start!: any;
        db.transaction.mockImplementation((_mode, cb) => { start = cb; });
        securityConfig.queryTimeout = 20;
        const pending = expect(executeQuery('SELECT ID FROM T')).rejects.toMatchObject({ type: 'QUERY_TIMEOUT' });
        await tick(); jest.advanceTimersByTime(20); await pending;
        expect(pool.destroy).not.toHaveBeenCalled(); start(null, tx); await tick();
        expect(tx.query).not.toHaveBeenCalled(); expect(tx.rollback).toHaveBeenCalledTimes(1);
        expect(pool.destroy).toHaveBeenCalledTimes(1);
    });

    it('retains ownership during a commit deadline until the callback arrives', async () => {
        const { db, tx } = fixture(); const pool = boundary(db); let commit!: any;
        tx.commit.mockImplementation(cb => { commit = cb; }); securityConfig.queryTimeout = 20;
        const pending = expect(executeQuery('SELECT ID FROM T')).rejects.toMatchObject({ type: 'QUERY_TIMEOUT' });
        await tick(); jest.advanceTimersByTime(20); await pending;
        expect(pool.destroy).not.toHaveBeenCalled(); commit(null); await tick();
        expect(pool.release).not.toHaveBeenCalled(); expect(pool.destroy).toHaveBeenCalledTimes(1);
    });
});
