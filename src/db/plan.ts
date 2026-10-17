import Firebird from 'node-firebird';
import type { FirebirdDatabase } from './connection.js';
import { FirebirdError } from '../utils/errors.js';

const unavailable = () => new FirebirdError('Execution plan not available', 'PLAN_UNAVAILABLE');

/** Await callback AND any returned adapter promise; never certify cleanup with a timer. */
async function callbackResult<T>(invoke: (cb: (err: any, value?: T) => void) => unknown): Promise<T> {
    let complete!: (value: { err: any; value?: T }) => void;
    const response = new Promise<{ err: any; value?: T }>(resolve => { complete = resolve; });
    await invoke((err, value) => complete({ err, value }));
    const result = await response;
    if (result.err) throw result.err;
    return result.value as T;
}

async function prepareWirePlan(connection: any, transaction: any, sql: string): Promise<any> {
    const queueEvent = connection._queueEvent;
    // node-firebird's descriptor parser runs inside its queued callback and can
    // throw for unsupported types/truncated descriptors. Catch at that boundary,
    // not with a process-wide uncaughtException handler. This attachment is owned
    // exclusively until prepare/cleanup settle. Older protocols queue in stages.
    let fail: (error: unknown) => void = () => undefined;
    const guardedQueue = function (this: any, callback: any) {
        if (typeof callback !== 'function') return queueEvent.call(this, callback);
        const guarded = Object.assign(function (this: any, ...args: any[]) {
            try { return callback.apply(this, args); } catch (error) { fail(error); }
        }, callback); // Preserve response/lazy_count used by the wire decoder.
        return queueEvent.call(this, guarded);
    };
    if (typeof queueEvent === 'function') connection._queueEvent = guardedQueue;
    try {
        return await callbackResult<any>(cb => {
            fail = error => cb(error);
            return connection.prepare(transaction, sql, true, cb);
        });
    } finally {
        if (connection._queueEvent === guardedQueue) connection._queueEvent = queueEvent;
    }
}

/** Prepare and inspect only. No execute/fetch API or monitoring-table fallback is used. */
export async function prepareDatabasePlan(db: FirebirdDatabase, sql: string, isExpired: () => boolean): Promise<string> {
    const check = () => { if (isExpired()) throw new FirebirdError('Query deadline exceeded', 'QUERY_TIMEOUT'); };
    const native = db._nativeAttachment;
    const connection = db.connection;
    let transaction: any, statement: any, priorCache: any, plan: unknown, failure: unknown;
    if (native) {
        if (typeof native.startTransaction !== 'function' || typeof native.prepare !== 'function' ||
            typeof native.client?.statusAction !== 'function') throw unavailable();
    } else if (typeof db.transaction !== 'function' || typeof connection?.prepare !== 'function' ||
        typeof connection?.dropStatement !== 'function') throw unavailable();

    try {
        check();
        if (native) {
            transaction = await native.startTransaction({ accessMode: 'READ_ONLY' });
            check();
            statement = await native.prepare(transaction, sql);
            check();
            if (typeof statement.statementHandle?.getPlanAsync !== 'function') throw unavailable();
            plan = await native.client.statusAction((status: any) => statement.statementHandle.getPlanAsync(status, false));
        } else {
            transaction = await callbackResult<any>(cb => db.transaction(Firebird.ISOLATION_READ_COMMITTED_READ_ONLY, cb));
            check();
            priorCache = connection.getCachedQuery?.(sql);
            // Let the driver batch allocation + preparation for lazy-send wire protocols.
            // A standalone allocation can wait forever for the server's deferred reply.
            // If preparation fails before returning a handle, the owner discards the attachment.
            statement = await prepareWirePlan(connection, transaction, sql);
            plan = statement.plan;
        }
        check();
        if (typeof plan !== 'string' || !plan.trim()) throw unavailable();
        // The legacy wire info buffer is 64 KiB; never report a near-limit prefix as a full plan.
        if (Buffer.byteLength(plan, 'utf8') >= 60000) throw new FirebirdError('Execution plan exceeds the supported metadata size', 'RESOURCE_LIMIT_EXCEEDED');
    } catch (error) { failure = error; }
    // Always attempt both cleanup stages, including prepare/info/timeout failures.
    if (native) {
        if (statement) try { await statement.dispose(); } catch (error) { failure ||= error; }
        if (transaction) try { await transaction.rollback(); } catch (error) { failure ||= error; }
    } else {
        // Lazy-send also defers the DROP reply until another synchronous operation.
        // Queue DROP then ROLLBACK in wire order before awaiting BOTH acknowledgments.
        // Neither the attachment nor its pool slot may be reused in between.
        const cleanup: Promise<unknown>[] = [];
        if (statement) cleanup.push(callbackResult(cb => connection.dropStatement(statement, cb)));
        if (transaction) cleanup.push(callbackResult(cb => transaction.rollback(cb)));
        for (const result of await Promise.allSettled(cleanup)) if (result.status === 'rejected') failure ||= result.reason;
        if (statement && connection._cache_query?.[sql] === statement) {
            if (priorCache) connection._cache_query[sql] = priorCache;
            else delete connection._cache_query[sql];
        }
    }
    if (failure) throw failure;
    return (plan as string).trim();
}
