import { securityConfig } from './config.js';
import { FirebirdError } from '../utils/errors.js';

const counts = new Map<string, number>();
const rates = new Map<string, { tokens: number; timestamp: number }>();
const fail = (message: string): never => { throw new FirebirdError(message, 'RESOURCE_LIMIT_EXCEEDED'); };
// Bound memory without evicting live counters (eviction would reset enforcement).
const MAX_IDENTITIES = 10000;
export function checkRowLimit(rowCount: number): boolean {
    const limit = Math.min(securityConfig.maxRows || Infinity, securityConfig.resourceLimits?.maxRowsPerQuery || Infinity);
    if (rowCount > limit) fail(`Query result exceeds maximum allowed rows (${limit})`);
    return true;
}
export function checkResponseSizeLimit(result: unknown): boolean {
    const limit = securityConfig.resourceLimits?.maxResponseSize;
    if (limit && Buffer.byteLength(JSON.stringify(result), 'utf8') > limit) fail(`Response exceeds maximum allowed UTF-8 size (${limit} bytes)`);
    return true;
}
export function checkQueryCountLimit(sessionId = 'stdio'): boolean {
    const limit = securityConfig.resourceLimits?.maxQueriesPerSession;
    if (!limit) return true;
    if (!counts.has(sessionId) && counts.size >= MAX_IDENTITIES) fail('Security identity capacity reached');
    const count = counts.get(sessionId) || 0;
    if (count >= limit) fail('Maximum queries for this security session reached');
    counts.set(sessionId, count + 1);
    return true;
}
export function checkRateLimit(sessionId = 'stdio'): boolean {
    const limit = securityConfig.resourceLimits?.rateLimit;
    if (!limit) return true;
    if (!rates.has(sessionId) && rates.size >= MAX_IDENTITIES) fail('Security identity capacity reached');
    const now = Date.now();
    const state = rates.get(sessionId) || { tokens: limit.burstLimit, timestamp: now };
    state.tokens = Math.min(limit.burstLimit, state.tokens + Math.max(0, now - state.timestamp) * limit.queriesPerMinute / 60000);
    state.timestamp = now;
    rates.set(sessionId, state);
    if (state.tokens < 1) fail('Query rate limit exceeded');
    state.tokens--;
    return true;
}
export function resetQueryCount(sessionId = 'stdio'): void { counts.delete(sessionId); }
export function resetRateLimit(sessionId = 'stdio'): void { rates.delete(sessionId); }
