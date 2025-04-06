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
        // Apply row filters if configured
        if (tableName && securityConfig.rowFilters && securityConfig.rowFilters[tableName]) {
            results = applyRowFilter(results, tableName);
        }

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
 * Apply row filters to a result set
 * @param {any[]} results - Result set to filter
 * @param {string} tableName - Name of the table
 * @returns {any[]} Filtered result set
 */
function applyRowFilter(results: any[], tableName: string): any[] {
    if (!securityConfig.rowFilters || !securityConfig.rowFilters[tableName]) {
        return results;
    }

    try {
        const filterCondition = securityConfig.rowFilters[tableName];

        // Convert the filter condition to a JavaScript function
        const filterFunction = createFilterFunction(filterCondition);

        // Apply the filter
        return results.filter(row => {
            try {
                return filterFunction(row);
            } catch (error) {
                logger.error(`Error evaluating row filter for ${tableName}: ${error}`);
                return true; // Include the row if there's an error
            }
        });
    } catch (error: any) {
        logger.error(`Error applying row filter for ${tableName}: ${error.message}`);
        return results;
    }
}

/**
 * Create a filter function from a SQL-like condition
 * @param {string} condition - SQL-like condition
 * @returns {Function} Filter function
 */
function createFilterFunction(condition: string): (row: any) => boolean {
    // This is a simplified implementation that handles basic conditions
    // A real implementation would need to parse and evaluate SQL conditions

    // Replace SQL operators with JavaScript operators
    const jsCondition = condition
        .replace(/\bAND\b/gi, '&&')
        .replace(/\bOR\b/gi, '||')
        .replace(/\bNOT\b/gi, '!')
        .replace(/\bIS NULL\b/gi, '=== null')
        .replace(/\bIS NOT NULL\b/gi, '!== null')
        .replace(/\bLIKE\b/gi, '.includes')
        .replace(/\bIN\b/gi, '.includes');

    // Create a function that evaluates the condition
    return new Function('row', `
        try {
            with (row) {
                return ${jsCondition};
            }
        } catch (e) {
            return true;
        }
    `) as (row: any) => boolean;
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
