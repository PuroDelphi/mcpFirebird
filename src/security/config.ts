import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { createLogger } from '../utils/logger.js';
import { ConfigError } from '../utils/errors.js';

const logger = createLogger('security:config');
const regexPattern = z.string().refine(value => {
    try { new RegExp(value); return true; } catch { return false; }
}, 'Invalid regular expression');
const identifier = z.string().regex(/^[A-Za-z_][A-Za-z0-9_$]{0,62}$/);
export const SqlSecuritySchema = z.object({
    allowSystemTables: z.boolean().optional(),
    allowedSystemTables: z.array(identifier).optional(),
    allowDDL: z.boolean().optional(),
    allowUnsafeQueries: z.boolean().optional()
}).strict();
export const DataMaskingSchema = z.array(z.object({
    columns: z.array(z.string()).min(1),
    pattern: regexPattern.or(z.instanceof(RegExp)),
    replacement: z.string()
}).strict());
export const RowFiltersSchema = z.record(z.string(), z.string().min(1));
export const AuditConfigSchema = z.object({
    enabled: z.boolean().default(false),
    destination: z.enum(['file', 'database', 'both']).default('file'),
    auditFile: z.string().optional(),
    auditTable: identifier.max(27).optional(),
    detailLevel: z.enum(['basic', 'medium', 'full']).default('medium'),
    logQueries: z.boolean().default(true),
    logResponses: z.boolean().default(false),
    logParameters: z.boolean().default(true)
}).strict();
export const ResourceLimitsSchema = z.object({
    maxRowsPerQuery: z.number().int().positive().optional(),
    maxResponseSize: z.number().int().positive().optional(),
    // Historical name: wall-clock deadline, not server CPU accounting.
    maxQueryCpuTime: z.number().int().positive().optional(),
    maxQueriesPerSession: z.number().int().positive().optional(),
    rateLimit: z.object({
        queriesPerMinute: z.number().int().positive(),
        burstLimit: z.number().int().positive()
    }).strict().optional()
}).strict();
export const AuthorizationSchema = z.object({
    type: z.enum(['none', 'basic', 'oauth2']).default('none'),
    oauth2: z.object({
        tokenVerifyUrl: z.string().url().refine(value => new URL(value).protocol === 'https:', 'HTTPS required'),
        clientId: z.string().min(1),
        clientSecret: z.string().min(1),
        scope: z.string().optional()
    }).strict().optional(),
    rolePermissions: z.record(z.string(), z.object({
        tables: z.array(z.string()).optional(),
        allTablesAllowed: z.boolean().optional(),
        operations: z.array(z.string()).optional()
    }).strict()).optional()
}).strict().refine(value => value.type !== 'oauth2' || !!value.oauth2, 'OAuth2 configuration required');
export const SecurityConfigSchema = z.object({
    allowedTables: z.array(z.string()).optional(),
    forbiddenTables: z.array(z.string()).optional(),
    tableNamePattern: regexPattern.optional(),
    allowedOperations: z.array(z.string()).optional(),
    forbiddenOperations: z.array(z.string()).optional(),
    maxRows: z.number().int().positive().optional(),
    queryTimeout: z.number().int().positive().optional(),
    dataMasking: DataMaskingSchema.optional(),
    rowFilters: RowFiltersSchema.optional(),
    audit: AuditConfigSchema.optional(),
    resourceLimits: ResourceLimitsSchema.optional(),
    authorization: AuthorizationSchema.optional(),
    sql: SqlSecuritySchema.optional()
}).strict();
const PolicySchema = z.object({
    security: SecurityConfigSchema.optional(),
    sql: SqlSecuritySchema.optional()
}).strict().refine(value => value.security !== undefined || value.sql !== undefined)
    .refine(value => !(value.sql && value.security?.sql), 'Specify sql only once');
export type SecurityConfig = z.infer<typeof SecurityConfigSchema>;
export const MAX_SECURITY_JSON_BYTES = 64 * 1024;
export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
    sql: SqlSecuritySchema.parse({}),
    // No implicit advanced restrictions. The historical raw-write gate and
    // SQL validation remain enforced by prepareUserQuery. Explicit policies
    // are always enforced, including when ALLOW_RAW_SQL=true.
    audit: AuditConfigSchema.parse({ auditFile: './logs/audit.log' }),
    resourceLimits: ResourceLimitsSchema.parse({})
};

function parsePolicy(value: unknown): SecurityConfig {
    const result = PolicySchema.safeParse(value);
    if (!result.success) throw new ConfigError('Security configuration must contain valid security/sql objects with supported policy fields.');
    const policy = result.data.security || {};
    return {
        ...structuredClone(DEFAULT_SECURITY_CONFIG), ...policy,
        sql: result.data.sql || policy.sql || SqlSecuritySchema.parse({}),
        audit: { ...DEFAULT_SECURITY_CONFIG.audit!, ...policy.audit },
        resourceLimits: { ...DEFAULT_SECURITY_CONFIG.resourceLimits!, ...policy.resourceLimits }
    };
}

export function loadSecurityConfig(configPath?: string): SecurityConfig {
    configPath = configPath || process.env.FIREBIRD_SECURITY_CONFIG || process.env.SECURITY_CONFIG || process.env.SECURITY_CONFIG_PATH;
    if (!configPath && process.env.FIREBIRD_SECURITY_JSON !== undefined) {
        const json = process.env.FIREBIRD_SECURITY_JSON;
        if (Buffer.byteLength(json, 'utf8') > MAX_SECURITY_JSON_BYTES) throw new ConfigError('FIREBIRD_SECURITY_JSON exceeds the 64 KiB limit.');
        let value: unknown;
        try { value = JSON.parse(json); } catch { throw new ConfigError('FIREBIRD_SECURITY_JSON must contain valid JSON.'); }
        const config = parsePolicy(value);
        logger.info('Loaded security configuration from FIREBIRD_SECURITY_JSON');
        return config;
    }
    if (configPath) {
        try {
            const absolutePath = path.resolve(configPath);
            const value = path.extname(absolutePath).toLowerCase() === '.json'
                ? JSON.parse(fs.readFileSync(absolutePath, 'utf8').replace(/^\uFEFF/, ''))
                : createRequire(absolutePath)(absolutePath);
            // General CJS files may contain connection properties too.
            const config = parsePolicy(path.extname(absolutePath).toLowerCase() === '.json' ? value : { security: value?.security, sql: value?.sql });
            logger.info(`Loaded security configuration from ${configPath}`);
            return config;
        } catch {
            throw new ConfigError('Unable to load a valid security configuration file.');
        }
    }
    return structuredClone(DEFAULT_SECURITY_CONFIG);
}
export const securityConfig: SecurityConfig = structuredClone(DEFAULT_SECURITY_CONFIG);
export function initSecurityConfig(configPath?: string): void {
    const config = loadSecurityConfig(configPath);
    if (config.authorization?.type === 'basic' && !process.env.FIREBIRD_API_KEY) {
        throw new ConfigError('Basic authorization requires FIREBIRD_API_KEY.');
    }
    if (config.audit?.enabled) {
        config.audit.auditFile ||= './logs/audit.log';
        config.audit.auditTable ||= 'MCP_AUDIT_LOG';
        if (config.audit.destination !== 'database') fs.mkdirSync(path.dirname(config.audit.auditFile), { recursive: true });
    }
    for (const key of Object.keys(securityConfig)) delete (securityConfig as any)[key];
    Object.assign(securityConfig, config);
    logger.info('Security configuration initialized');
}
