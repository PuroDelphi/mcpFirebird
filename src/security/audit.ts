/**
 * Audit logging functionality for the MCP Firebird server
 */

import * as fs from 'fs';
import { securityConfig } from './config.js';
import { createLogger } from '../utils/logger.js';
const logger = createLogger('security:audit');
import { executeQuery } from '../db/queries.js';
import { DEFAULT_CONFIG } from '../db/connection.js';

/**
 * Interface for audit log entry
 */
export interface AuditLogEntry {
    timestamp: string;
    clientInfo: string;
    operationType: string;
    targetObject: string;
    queryText?: string;
    parameters?: string;
    affectedRows?: number;
    executionTime?: number;
    userIdentifier?: string;
    success: boolean;
    errorMessage?: string;
}

/**
 * Log an audit entry
 * @param {AuditLogEntry} entry - Audit log entry
 */
export async function logAudit(entry: AuditLogEntry): Promise<void> {
    if (!securityConfig.audit?.enabled) {
        return;
    }

    try {
        // Add timestamp if not provided
        if (!entry.timestamp) {
            entry.timestamp = new Date().toISOString();
        }

        // Log to file if configured
        if (securityConfig.audit.destination === 'file' || securityConfig.audit.destination === 'both') {
            await logToFile(entry);
        }

        // Log to database if configured
        if (securityConfig.audit.destination === 'database' || securityConfig.audit.destination === 'both') {
            await logToDatabase(entry);
        }
    } catch (error: any) {
        logger.error(`Error logging audit entry: ${error.message}`);
    }
}

/**
 * Log an audit entry to a file
 * @param {AuditLogEntry} entry - Audit log entry
 */
async function logToFile(entry: AuditLogEntry): Promise<void> {
    if (!securityConfig.audit?.auditFile) {
        logger.error('Audit file not configured');
        return;
    }

    try {
        // Format the entry as a JSON string
        const logLine = JSON.stringify(entry) + '\\n';

        // Append to the audit file
        fs.appendFileSync(securityConfig.audit.auditFile, logLine);
    } catch (error: any) {
        logger.error(`Error writing to audit file: ${error.message}`);
    }
}

/**
 * Log an audit entry to the database
 * @param {AuditLogEntry} entry - Audit log entry
 */
async function logToDatabase(entry: AuditLogEntry): Promise<void> {
    if (!securityConfig.audit?.auditTable) {
        logger.error('Audit table not configured');
        return;
    }

    try {
        // Construct the SQL query
        const sql = `
            INSERT INTO ${securityConfig.audit.auditTable} (
                TIMESTAMP, CLIENT_INFO, OPERATION_TYPE, TARGET_OBJECT,
                QUERY_TEXT, PARAMETERS, AFFECTED_ROWS,
                EXECUTION_TIME, USER_IDENTIFIER, SUCCESS, ERROR_MESSAGE
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
        `;

        // Execute the query
        await executeQuery(sql, [
            entry.timestamp,
            entry.clientInfo || '',
            entry.operationType,
            entry.targetObject || '',
            entry.queryText || '',
            entry.parameters || '',
            entry.affectedRows || 0,
            entry.executionTime || 0,
            entry.userIdentifier || '',
            entry.success ? 1 : 0,
            entry.errorMessage || ''
        ], DEFAULT_CONFIG);
    } catch (error: any) {
        logger.error(`Error writing to audit table: ${error.message}`);
    }
}

/**
 * Create the audit table if it doesn't exist
 */
export async function createAuditTable(): Promise<void> {
    if (!securityConfig.audit?.enabled ||
        securityConfig.audit.destination !== 'database' &&
        securityConfig.audit.destination !== 'both') {
        return;
    }

    if (!securityConfig.audit.auditTable) {
        logger.error('Audit table not configured');
        return;
    }

    try {
        // Check if the table exists
        const checkSql = `
            SELECT 1 FROM RDB$RELATIONS
            WHERE RDB$RELATION_NAME = '${securityConfig.audit.auditTable.toUpperCase()}'
        `;

        const result = await executeQuery(checkSql, [], DEFAULT_CONFIG);

        if (result.length === 0) {
            // Create the audit table
            const createSql = `
                CREATE TABLE ${securityConfig.audit.auditTable} (
                    LOG_ID INTEGER NOT NULL PRIMARY KEY,
                    TIMESTAMP TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    CLIENT_INFO VARCHAR(255),
                    OPERATION_TYPE VARCHAR(50),
                    TARGET_OBJECT VARCHAR(100),
                    QUERY_TEXT BLOB SUB_TYPE TEXT,
                    PARAMETERS BLOB SUB_TYPE TEXT,
                    AFFECTED_ROWS INTEGER,
                    EXECUTION_TIME INTEGER,
                    USER_IDENTIFIER VARCHAR(100),
                    SUCCESS BOOLEAN,
                    ERROR_MESSAGE BLOB SUB_TYPE TEXT
                )
            `;

            await executeQuery(createSql, [], DEFAULT_CONFIG);

            // Create a sequence for the LOG_ID
            const sequenceSql = `
                CREATE SEQUENCE SEQ_${securityConfig.audit.auditTable}
            `;

            await executeQuery(sequenceSql, [], DEFAULT_CONFIG);

            logger.info(`Created audit table: ${securityConfig.audit.auditTable}`);
        } else {
            logger.info(`Audit table already exists: ${securityConfig.audit.auditTable}`);
        }
    } catch (error: any) {
        logger.error(`Error creating audit table: ${error.message}`);
    }
}

/**
 * Log a query execution to the audit log
 * @param {string} sql - SQL query
 * @param {any[]} params - Query parameters
 * @param {string} clientInfo - Client information
 * @param {string} userIdentifier - User identifier
 * @param {boolean} success - Whether the query was successful
 * @param {string} errorMessage - Error message if the query failed
 * @param {number} executionTime - Query execution time in milliseconds
 * @param {number} affectedRows - Number of rows affected by the query
 */
export async function logQueryExecution(
    sql: string,
    params: any[] = [],
    clientInfo: string = '',
    userIdentifier: string = '',
    success: boolean = true,
    errorMessage: string = '',
    executionTime: number = 0,
    affectedRows: number = 0
): Promise<void> {
    if (!securityConfig.audit?.enabled || !securityConfig.audit.logQueries) {
        return;
    }

    // Determine the operation type from the SQL
    const operationType = getOperationType(sql);

    // Determine the target object from the SQL
    const targetObject = getTargetObject(sql);

    // Create the audit log entry
    const entry: AuditLogEntry = {
        timestamp: new Date().toISOString(),
        clientInfo,
        operationType,
        targetObject,
        success,
        executionTime,
        affectedRows,
        userIdentifier
    };

    // Add query text if configured
    if (securityConfig.audit.detailLevel !== 'basic') {
        entry.queryText = sql;
    }

    // Add parameters if configured
    if (securityConfig.audit.logParameters && params.length > 0) {
        entry.parameters = JSON.stringify(params);
    }

    // Add error message if the query failed
    if (!success && errorMessage) {
        entry.errorMessage = errorMessage;
    }

    // Log the entry
    await logAudit(entry);
}

/**
 * Get the operation type from an SQL query
 * @param {string} sql - SQL query
 * @returns {string} Operation type
 */
function getOperationType(sql: string): string {
    const firstWord = sql.trim().split(/\\s+/)[0].toUpperCase();

    switch (firstWord) {
        case 'SELECT':
            return 'SELECT';
        case 'INSERT':
            return 'INSERT';
        case 'UPDATE':
            return 'UPDATE';
        case 'DELETE':
            return 'DELETE';
        case 'CREATE':
            return 'CREATE';
        case 'DROP':
            return 'DROP';
        case 'ALTER':
            return 'ALTER';
        case 'EXECUTE':
        case 'EXEC':
            return 'EXECUTE';
        default:
            return 'OTHER';
    }
}

/**
 * Get the target object from an SQL query
 * @param {string} sql - SQL query
 * @returns {string} Target object
 */
function getTargetObject(sql: string): string {
    const sqlLower = sql.toLowerCase();

    // Extract table name from SELECT, INSERT, UPDATE, DELETE
    if (sqlLower.startsWith('select')) {
        const fromMatch = sqlLower.match(/\\bfrom\\s+([\\w\\.]+)/i);
        return fromMatch ? fromMatch[1] : '';
    }

    if (sqlLower.startsWith('insert')) {
        const intoMatch = sqlLower.match(/\\binto\\s+([\\w\\.]+)/i);
        return intoMatch ? intoMatch[1] : '';
    }

    if (sqlLower.startsWith('update')) {
        const updateMatch = sqlLower.match(/\\bupdate\\s+([\\w\\.]+)/i);
        return updateMatch ? updateMatch[1] : '';
    }

    if (sqlLower.startsWith('delete')) {
        const fromMatch = sqlLower.match(/\\bfrom\\s+([\\w\\.]+)/i);
        return fromMatch ? fromMatch[1] : '';
    }

    // Extract object name from CREATE, DROP, ALTER
    if (sqlLower.startsWith('create') || sqlLower.startsWith('drop') || sqlLower.startsWith('alter')) {
        const objectMatch = sqlLower.match(/\\b(table|view|index|procedure|trigger|sequence)\\s+([\\w\\.]+)/i);
        return objectMatch ? objectMatch[2] : '';
    }

    // Extract procedure name from EXECUTE
    if (sqlLower.startsWith('execute') || sqlLower.startsWith('exec')) {
        const execMatch = sqlLower.match(/\\b(execute|exec)\\s+([\\w\\.]+)/i);
        return execMatch ? execMatch[2] : '';
    }

    return '';
}
