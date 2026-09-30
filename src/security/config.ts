import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { isIP } from 'node:net';
import { createLogger } from '../utils/logger.js';
import { ConfigError } from '../utils/errors.js';

const logger = createLogger('security:config');
const regexPattern = z.string().refine(value => {
    try { new RegExp(value); return true; } catch { return false; }
}, 'Invalid regular expression');
const identifier = z.string().regex(/^[A-Za-z_][A-Za-z0-9_$]{0,62}$/);

export function isLoopbackHost(host: string): boolean {
    const value = host.toLowerCase().replace(/^\[|\]$/g, '');
    return value === 'localhost' || (isIP(value) === 6 && new URL(`http://[${value}]`).hostname === '[::1]') ||
        (isIP(value) === 4 && value.startsWith('127.'));
}

// Do not use forwarded headers or DNS resolution to decide which hosts are trusted.
export function parseHttpAuthority(authority: string): { hostname: string; authority: string } | undefined {
    if (!/^(?:\[[0-9a-fA-F:.]+\]|[a-zA-Z0-9.-]+)(?::[0-9]{1,5})?$/.test(authority)) return undefined;
    try {
        const url = new URL(`http://${authority}`);
        if (url.port && Number(url.port) === 0) return undefined;
        // IPv4 abbreviations/integers/hex must not silently alias an exact allowlist entry.
        if (!authority.startsWith('[') && authority.split(':')[0].toLowerCase() !== url.hostname) return undefined;
        return { hostname: url.hostname.toLowerCase(), authority: url.host.toLowerCase() };
    } catch { return undefined; }
}

export function parseHttpOrigin(origin: string): string | undefined {
    if (!/^https?:\/\/[^/?#\\\s]+$/i.test(origin)) return undefined;
    try {
        const url = new URL(origin);
        if (url.username || url.password || !parseHttpAuthority(url.host)) return undefined;
        return url.origin;
    } catch { return undefined; }
}

export interface HttpSecurityConfig {
    mode: 'compat' | 'strict';
    host: string;
    allowedHosts: string[];
    /** Additional browser origins; the request's own origin is always permitted. */
    allowedOrigins: string[];
}

export function parseAllowedOrigins(value?: string, mode: HttpSecurityConfig['mode'] = 'strict'): string[] {
    if (!value?.trim()) return mode === 'compat' ? ['*'] : [];
    if (value.trim() === '*' && mode === 'compat') return ['*'];
    return [...new Set(value.split(',').map(item => {
        const origin = parseHttpOrigin(item.trim());
        if (!origin) throw new ConfigError('MCP_ALLOWED_ORIGIN must contain exact http(s) origins, without paths or wildcards.');
        return origin;
    }))];
}

/** HTTP-only settings: STDIO and database policy loading do not depend on these. */
export function loadHttpSecurityConfig(env: NodeJS.ProcessEnv = process.env): HttpSecurityConfig {
    const mode = env.MCP_HTTP_SECURITY_MODE || 'compat';
    if (mode !== 'compat' && mode !== 'strict') throw new ConfigError('MCP_HTTP_SECURITY_MODE must be compat or strict.');
    let host = env.HTTP_HOST?.trim() || (mode === 'strict' ? '127.0.0.1' : '0.0.0.0');
    if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
    if (!isIP(host) && !/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/.test(host)) {
        throw new ConfigError('HTTP_HOST must be an IP address or hostname, without a scheme, port or path.');
    }
    const remote = !isLoopbackHost(host);
    if (remote && (mode === 'strict' ? env.MCP_ALLOW_REMOTE !== 'true' : env.MCP_ALLOW_REMOTE === 'false')) {
        throw new ConfigError('Non-loopback HTTP_HOST requires MCP_ALLOW_REMOTE=true and MCP_ALLOWED_HOSTS.');
    }
    const configuredHosts = env.MCP_ALLOWED_HOSTS?.trim();
    if (mode === 'strict' && remote && !configuredHosts) throw new ConfigError('Remote HTTP exposure requires an explicit MCP_ALLOWED_HOSTS list.');
    const allowedHosts = configuredHosts ? configuredHosts.split(',').map(item => {
        const value = item.trim();
        const parsed = parseHttpAuthority(value);
        // Entries are hostnames/IPs, never URLs, wildcard patterns or port-specific authorities.
        if (!parsed || (value.startsWith('[') ? !value.endsWith(']') : value.includes(':'))) {
            throw new ConfigError('MCP_ALLOWED_HOSTS must contain exact hostnames or IP addresses without ports or wildcards; bracket IPv6 addresses.');
        }
        return parsed.hostname;
    }) : mode === 'strict' ? ['localhost', '127.0.0.1', '[::1]', isIP(host) === 6 ? `[${host}]` : host.toLowerCase()] : [];
    return { mode, host, allowedHosts: [...new Set(allowedHosts)], allowedOrigins: parseAllowedOrigins(env.MCP_ALLOWED_ORIGIN, mode) };
}

const httpsEndpoint = z.string().url().refine(value => {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password && !url.hash;
    } catch { return false; }
}, 'An HTTPS URL without credentials or fragment is required');
const resourceIdentifier = z.string().url().refine(value => {
    try {
        const url = new URL(value);
        return (url.protocol === 'https:' || (url.protocol === 'http:' && isLoopbackHost(url.hostname))) &&
            !url.username && !url.password && !url.hash && !url.search;
    } catch { return false; }
}, 'resourceUrl must be an HTTPS MCP endpoint (HTTP is allowed only on loopback), without credentials, query or fragment');
const authorizationServerIdentifier = httpsEndpoint.refine(value => {
    try { return !new URL(value).search; } catch { return false; }
}, 'Authorization server identifiers cannot contain a query');
const oauthScope = z.string().regex(/^[\x21\x23-\x5B\x5D-\x7E]+(?: [\x21\x23-\x5B\x5D-\x7E]+)*$/, 'Scopes must be space-separated OAuth scope tokens');
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
        tokenVerifyUrl: httpsEndpoint,
        clientId: z.string().min(1),
        clientSecret: z.string().min(1),
        resourceUrl: resourceIdentifier.optional(),
        authorizationServers: z.array(authorizationServerIdentifier).min(1).optional(),
        scope: oauthScope.optional()
    }).strict().refine(value => Boolean(value.resourceUrl) === Boolean(value.authorizationServers),
        'Configure resourceUrl and authorizationServers together').optional(),
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
    if (!result.success) {
        if (result.error.issues.some(issue => issue.path.includes('authorization'))) {
            throw new ConfigError('Invalid authorization configuration. OAuth2 requires an HTTPS tokenVerifyUrl, clientId and clientSecret. Configure a canonical resourceUrl and HTTPS authorizationServers together to enable audience validation and discovery; scope must contain valid OAuth scope tokens.');
        }
        throw new ConfigError('Security configuration must contain valid security/sql objects with supported policy fields.');
    }
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
        } catch (error) {
            if (error instanceof ConfigError) throw error;
            throw new ConfigError('Unable to load a valid security configuration file.');
        }
    }
    return structuredClone(DEFAULT_SECURITY_CONFIG);
}
export const securityConfig: SecurityConfig = structuredClone(DEFAULT_SECURITY_CONFIG);
export function initSecurityConfig(configPath?: string): void {
    const config = loadSecurityConfig(configPath);
    if (config.authorization?.type === 'oauth2' && !config.authorization.oauth2?.resourceUrl) {
        logger.warn('Legacy OAuth introspection has no local audience validation or discovery. Configure oauth2.resourceUrl and authorizationServers to enable both.');
    }
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
