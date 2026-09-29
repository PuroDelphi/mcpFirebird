import { appendFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { securityConfig } from './config.js';
import { currentSecurityContext } from './context.js';
import { executeAuditQuery } from '../db/queries.js';
import { quoteIdentifier } from '../utils/security.js';

export interface AuditLogEntry {
    timestamp: string; clientInfo: string; operationType: string; targetObject: string;
    queryText?: string; parameters?: string; affectedRows?: number; executionTime?: number;
    userIdentifier?: string; success: boolean; errorMessage?: string; response?: unknown; phase?: 'started' | 'completed';
}
export async function logAudit(entry: AuditLogEntry): Promise<void> {
    const audit = securityConfig.audit;
    if (!audit?.enabled) return;
    if (audit.destination !== 'database') {
        if (!audit.auditFile) throw new Error('Audit file not configured');
        await appendFile(audit.auditFile, JSON.stringify(entry) + '\n', 'utf8');
    }
    if (audit.destination !== 'file') {
        if (!audit.auditTable) throw new Error('Audit table not configured');
        await executeAuditQuery(`INSERT INTO ${quoteIdentifier(audit.auditTable)}
            (LOG_ID, "TIMESTAMP", CLIENT_INFO, OPERATION_TYPE, TARGET_OBJECT, QUERY_TEXT, PARAMETERS,
             AFFECTED_ROWS, EXECUTION_TIME, USER_IDENTIFIER, SUCCESS, ERROR_MESSAGE, RESPONSE_TEXT, PHASE)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [randomUUID(), new Date(entry.timestamp), entry.clientInfo, entry.operationType, entry.targetObject,
            entry.queryText || null, entry.parameters || null, entry.affectedRows || 0, entry.executionTime || 0,
            entry.userIdentifier || '', entry.success ? 1 : 0, entry.errorMessage || null,
            entry.response === undefined ? null : JSON.stringify(entry.response), entry.phase || 'completed']);
    }
}
export async function createAuditTable(): Promise<void> {
    const audit = securityConfig.audit;
    if (!audit?.enabled || audit.destination === 'file') return;
    if (!audit.auditTable) throw new Error('Audit table not configured');
    const table = quoteIdentifier(audit.auditTable);
    const result = await executeAuditQuery('SELECT 1 FROM RDB$RELATIONS WHERE RDB$RELATION_NAME = ?', [audit.auditTable]);
    if (!result.length) await executeAuditQuery(`CREATE TABLE ${table} (
        LOG_ID VARCHAR(36) NOT NULL PRIMARY KEY, "TIMESTAMP" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CLIENT_INFO VARCHAR(255), OPERATION_TYPE VARCHAR(50), TARGET_OBJECT VARCHAR(100),
        QUERY_TEXT BLOB SUB_TYPE TEXT, PARAMETERS BLOB SUB_TYPE TEXT, AFFECTED_ROWS INTEGER,
        EXECUTION_TIME INTEGER, USER_IDENTIFIER VARCHAR(100), SUCCESS SMALLINT,
        ERROR_MESSAGE BLOB SUB_TYPE TEXT, RESPONSE_TEXT BLOB SUB_TYPE TEXT, PHASE VARCHAR(12))`);
    // Do not silently accept an incompatible legacy audit table.
    await executeAuditQuery(`SELECT FIRST 0 LOG_ID, RESPONSE_TEXT, PHASE FROM ${table}`);
}
export async function logQueryExecution(sql: string, params: any[] = [], clientInfo = '', userIdentifier = '',
    success = true, errorMessage = '', executionTime = 0, affectedRows = 0, response?: unknown): Promise<void> {
    const audit = securityConfig.audit;
    if (!audit?.enabled) return;
    const context = currentSecurityContext();
    await logAudit({
        timestamp: new Date().toISOString(), clientInfo: clientInfo || context.sessionId,
        operationType: sql.trim().match(/^[a-z]+/i)?.[0].toUpperCase() || 'UNKNOWN', targetObject: '',
        phase: response === undefined && success ? 'started' : 'completed',
        userIdentifier: userIdentifier || context.user?.id, success, executionTime, affectedRows,
        queryText: audit.logQueries && audit.detailLevel !== 'basic' ? sql : undefined,
        parameters: audit.logParameters && audit.detailLevel === 'full' ? JSON.stringify(params) : undefined,
        errorMessage: success ? undefined : errorMessage,
        response: audit.logResponses && audit.detailLevel === 'full' ? response : undefined
    });
}
