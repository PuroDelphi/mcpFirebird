/**
 * JSON Helper Module
 * Utility functions for handling JSON in MCP responses
 */

import { MCPError, FirebirdError, ErrorTypes } from './errors.js';

/**
 * Convert an object to a compact JSON string without line breaks
 * This is useful to ensure that MCP responses are as compact as possible
 *
 * @param obj - The object to convert to a JSON string
 * @returns A JSON string without line breaks or carriage returns
 */
export const stringifyCompact = (obj: any): string => {
    try {
        // First, convert the object to standard JSON
        const jsonString = JSON.stringify(obj);

        // Then, remove all newline (\n) and carriage return (\r) characters
        // to ensure the output is a single compact line
        return jsonString.replace(/[\n\r]/g, '');
    } catch (error) {
        // Handle JSON.stringify errors
        console.error(`Error stringifying object: ${error instanceof Error ? error.message : String(error)}`);
        return JSON.stringify({ error: 'Error converting object to JSON' });
    }
};

/**
 * Response interface for MCP
 */
export interface MCPResponse<T> {
    success: boolean;
    result?: T;
    error?: string;
    errorType?: string;
    errorDetails?: Record<string, any>;
}

/**
 * Wrap a successful result in the expected MCP response format
 * @param result The successful result
 * @returns An MCP success response object
 */
export function wrapSuccess<T>(result: T): MCPResponse<T> {
    return { success: true, result };
}

/**
 * Wrap an error in the expected MCP response format
 * @param error The error object
 * @returns An MCP error response object
 */
export function wrapError(error: unknown): MCPResponse<never> {
    if (error instanceof MCPError) {
        return {
            success: false,
            error: error.message,
            errorType: error.type,
            errorDetails: error.context
        };
    } else if (error instanceof Error) {
        return {
            success: false,
            error: error.message,
            errorType: ErrorTypes.UNKNOWN,
            errorDetails: { stack: error.stack }
        };
    } else {
        return {
            success: false,
            error: String(error),
            errorType: ErrorTypes.UNKNOWN
        };
    }
}
