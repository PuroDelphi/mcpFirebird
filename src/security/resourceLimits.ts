/**
 * Resource limits functionality for the MCP Firebird server
 */

import { securityConfig } from './config.js';
import { createLogger } from '../utils/logger.js';
const logger = createLogger('security:resourceLimits');

// Define FirebirdError class if it doesn't exist
class FirebirdError extends Error {
    type: string;
    originalError?: any;

    constructor(message: string, type: string = 'UNKNOWN_ERROR', cause?: any) {
        super(message);
        this.name = 'FirebirdError';
        this.type = type;
        if (cause) {
            this.originalError = cause;
        }
    }
}

// Store query counts per session
const sessionQueryCounts: Map<string, number> = new Map();

// Store rate limiting data
const rateLimitData: Map<string, { count: number, timestamp: number }> = new Map();

/**
 * Check if a query exceeds the maximum allowed rows
 * @param {number} rowCount - Number of rows in the result
 * @param {string} sessionId - Session identifier
 * @returns {boolean} Whether the query exceeds the maximum allowed rows
 * @throws {FirebirdError} If the query exceeds the maximum allowed rows
 */
export function checkRowLimit(rowCount: number, sessionId: string = 'default'): boolean {
    if (!securityConfig.resourceLimits?.maxRowsPerQuery) {
        return true;
    }

    if (rowCount > securityConfig.resourceLimits.maxRowsPerQuery) {
        const errorMessage = `Query result exceeds maximum allowed rows (${rowCount} > ${securityConfig.resourceLimits.maxRowsPerQuery})`;
        logger.warn(`${errorMessage} for session ${sessionId}`);
        throw new FirebirdError(errorMessage, 'RESOURCE_LIMIT_EXCEEDED');
    }

    return true;
}

/**
 * Check if a query exceeds the maximum allowed response size
 * @param {any} result - Query result
 * @param {string} sessionId - Session identifier
 * @returns {boolean} Whether the query exceeds the maximum allowed response size
 * @throws {FirebirdError} If the query exceeds the maximum allowed response size
 */
export function checkResponseSizeLimit(result: any, sessionId: string = 'default'): boolean {
    if (!securityConfig.resourceLimits?.maxResponseSize) {
        return true;
    }

    // Estimate the size of the result
    const resultSize = estimateObjectSize(result);

    if (resultSize > securityConfig.resourceLimits.maxResponseSize) {
        const errorMessage = `Query result exceeds maximum allowed size (${resultSize} bytes > ${securityConfig.resourceLimits.maxResponseSize} bytes)`;
        logger.warn(`${errorMessage} for session ${sessionId}`);
        throw new FirebirdError(errorMessage, 'RESOURCE_LIMIT_EXCEEDED');
    }

    return true;
}

/**
 * Check if a session exceeds the maximum allowed queries
 * @param {string} sessionId - Session identifier
 * @returns {boolean} Whether the session exceeds the maximum allowed queries
 * @throws {FirebirdError} If the session exceeds the maximum allowed queries
 */
export function checkQueryCountLimit(sessionId: string = 'default'): boolean {
    if (!securityConfig.resourceLimits?.maxQueriesPerSession) {
        return true;
    }

    // Get the current query count for the session
    const queryCount = sessionQueryCounts.get(sessionId) || 0;

    // Increment the query count
    sessionQueryCounts.set(sessionId, queryCount + 1);

    if (queryCount >= securityConfig.resourceLimits.maxQueriesPerSession) {
        const errorMessage = `Session exceeds maximum allowed queries (${queryCount} >= ${securityConfig.resourceLimits.maxQueriesPerSession})`;
        logger.warn(`${errorMessage} for session ${sessionId}`);
        throw new FirebirdError(errorMessage, 'RESOURCE_LIMIT_EXCEEDED');
    }

    return true;
}

/**
 * Check if a session exceeds the rate limit
 * @param {string} sessionId - Session identifier
 * @returns {boolean} Whether the session exceeds the rate limit
 * @throws {FirebirdError} If the session exceeds the rate limit
 */
export function checkRateLimit(sessionId: string = 'default'): boolean {
    if (!securityConfig.resourceLimits?.rateLimit) {
        return true;
    }

    const { queriesPerMinute, burstLimit } = securityConfig.resourceLimits.rateLimit;

    // Get the current rate limit data for the session
    const data = rateLimitData.get(sessionId) || { count: 0, timestamp: Date.now() };

    // Check if a minute has passed since the last reset
    const now = Date.now();
    const elapsed = now - data.timestamp;

    if (elapsed >= 60000) {
        // Reset the count if a minute has passed
        data.count = 1;
        data.timestamp = now;
    } else {
        // Increment the count
        data.count++;

        // Check if the count exceeds the burst limit
        if (data.count > burstLimit) {
            const errorMessage = `Session exceeds burst limit (${data.count} > ${burstLimit})`;
            logger.warn(`${errorMessage} for session ${sessionId}`);
            throw new FirebirdError(errorMessage, 'RATE_LIMIT_EXCEEDED');
        }

        // Check if the rate exceeds the queries per minute limit
        const rate = data.count / (elapsed / 60000);
        if (rate > queriesPerMinute) {
            const errorMessage = `Session exceeds queries per minute limit (${rate.toFixed(2)} > ${queriesPerMinute})`;
            logger.warn(`${errorMessage} for session ${sessionId}`);
            throw new FirebirdError(errorMessage, 'RATE_LIMIT_EXCEEDED');
        }
    }

    // Update the rate limit data
    rateLimitData.set(sessionId, data);

    return true;
}

/**
 * Reset the query count for a session
 * @param {string} sessionId - Session identifier
 */
export function resetQueryCount(sessionId: string = 'default'): void {
    sessionQueryCounts.delete(sessionId);
}

/**
 * Reset the rate limit data for a session
 * @param {string} sessionId - Session identifier
 */
export function resetRateLimit(sessionId: string = 'default'): void {
    rateLimitData.delete(sessionId);
}

/**
 * Estimate the size of an object in bytes
 * @param {any} obj - Object to estimate the size of
 * @returns {number} Estimated size in bytes
 */
function estimateObjectSize(obj: any): number {
    const objectList = new Set();
    return calculateSize(obj, objectList);
}

/**
 * Calculate the size of an object in bytes
 * @param {any} object - Object to calculate the size of
 * @param {Set<any>} objectList - Set of objects already processed
 * @returns {number} Size in bytes
 */
function calculateSize(object: any, objectList: Set<any>): number {
    if (object === null || object === undefined) {
        return 0;
    }

    if (typeof object !== 'object') {
        // Handle primitive types
        if (typeof object === 'string') {
            return object.length * 2; // UTF-16 characters are 2 bytes each
        }
        if (typeof object === 'number') {
            return 8; // Numbers are 8 bytes
        }
        if (typeof object === 'boolean') {
            return 4; // Booleans are 4 bytes
        }
        return 0;
    }

    // Check for circular references
    if (objectList.has(object)) {
        return 0;
    }

    objectList.add(object);

    let size = 0;

    if (Array.isArray(object)) {
        // Calculate size of array elements
        for (const item of object) {
            size += calculateSize(item, objectList);
        }
    } else {
        // Calculate size of object properties
        for (const key in object) {
            if (Object.prototype.hasOwnProperty.call(object, key)) {
                size += key.length * 2; // Key name
                size += calculateSize(object[key], objectList); // Value
            }
        }
    }

    return size;
}
