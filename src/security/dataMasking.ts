/**
 * Data masking functionality for the MCP Firebird server
 */

import { securityConfig } from './config.js';
import { createLogger } from '../utils/logger.js';
const logger = createLogger('security:dataMasking');

/**
 * Apply data masking to a result set
 * @param {any[]} results - Result set to mask
 * @param {string} tableName - Name of the table (for row filters)
 * @returns {any[]} Masked result set
 */
export function applyDataMasking(results: any[], tableName?: string): any[] {
    if (!results || results.length === 0) {
        return results;
    }

    try {
        // Apply column masking if configured
        if (securityConfig.dataMasking && securityConfig.dataMasking.length > 0) {
            results = maskSensitiveData(results);
        }

        return results;
    } catch (error: any) {
        logger.error(`Error applying data masking: ${error.message}`);
        return results;
    }
}
/**
 * Mask sensitive data in a result set
 * @param {any[]} results - Result set to mask
 * @returns {any[]} Masked result set
 */
function maskSensitiveData(results: any[]): any[] {
    if (!securityConfig.dataMasking || securityConfig.dataMasking.length === 0) {
        return results;
    }

    try {
        // Create a deep copy of the results to avoid modifying the original
        const maskedResults = JSON.parse(JSON.stringify(results));

        // Apply each masking rule
        for (const rule of securityConfig.dataMasking) {
            const { columns, pattern, replacement } = rule;

            // Convert string pattern to RegExp if needed
            const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;

            // Apply the rule to each row
            for (const row of maskedResults) {
                for (const column of columns) {
                    if (column in row && row[column] !== null && row[column] !== undefined) {
                        // Apply the masking
                        const originalValue = String(row[column]);
                        row[column] = originalValue.replace(regex, replacement);
                    }
                }
            }
        }

        return maskedResults;
    } catch (error: any) {
        logger.error(`Error masking sensitive data: ${error.message}`);
        return results;
    }
}
