/**
 * Authorization functionality for the MCP Firebird server
 */

import { securityConfig } from './config.js';
import { currentSecurityContext } from './context.js';
import { FirebirdError } from '../utils/errors.js';

/**
 * Interface for user information
 */
export interface UserInfo {
    id: string;
    username: string;
    role: string;
}

/** Safe public OAuth failure category; never includes tokens or introspection data. */
export class OAuthTokenError extends FirebirdError {
    constructor(public readonly oauthError: 'invalid_token' | 'insufficient_scope' = 'invalid_token') {
        super(oauthError === 'insufficient_scope' ? 'Missing required scope' : 'Token verification failed', 'AUTHORIZATION_ERROR');
    }
}

/**
 * Check if a user is authorized to access a table
 * @param {string} tableName - Name of the table
 * @param {UserInfo} user - User information
 * @returns {boolean} Whether the user is authorized
 * @throws {FirebirdError} If the user is not authorized
 */
export function checkTableAccess(tableName: string, user: UserInfo | undefined = currentSecurityContext().user): boolean {
    // If no authorization is configured, allow access
    if (!securityConfig.authorization || securityConfig.authorization.type === 'none') {
        return true;
    }

    // If no user is provided, deny access
    if (!user) {
        throw new FirebirdError('User information required for authorization', 'AUTHORIZATION_ERROR');
    }

    // Check if the user has a role
    if (!user.role) {
        throw new FirebirdError('User role required for authorization', 'AUTHORIZATION_ERROR');
    }

    // Check if the role has permissions
    const rolePermissions = securityConfig.authorization.rolePermissions?.[user.role];
    if (!rolePermissions) {
        throw new FirebirdError(`No permissions defined for role: ${user.role}`, 'AUTHORIZATION_ERROR');
    }

    // Check if the role has access to all tables
    if (rolePermissions.allTablesAllowed) {
        return true;
    }

    // Check if the role has access to the specific table
    if (rolePermissions.tables && rolePermissions.tables.includes(tableName)) {
        return true;
    }

    // Deny access
    throw new FirebirdError(`Access to table ${tableName} denied for role ${user.role}`, 'AUTHORIZATION_ERROR');
}

/**
 * Check if a user is authorized to perform an operation
 * @param {string} operation - Operation to perform (SELECT, INSERT, UPDATE, DELETE, etc.)
 * @param {UserInfo} user - User information
 * @returns {boolean} Whether the user is authorized
 * @throws {FirebirdError} If the user is not authorized
 */
export function checkOperationAccess(operation: string, user: UserInfo | undefined = currentSecurityContext().user): boolean {
    // If no authorization is configured, check the allowed operations
    if (!securityConfig.authorization || securityConfig.authorization.type === 'none') {
        return true;
    }

    // If no user is provided, deny access
    if (!user) {
        throw new FirebirdError('User information required for authorization', 'AUTHORIZATION_ERROR');
    }

    // Check if the user has a role
    if (!user.role) {
        throw new FirebirdError('User role required for authorization', 'AUTHORIZATION_ERROR');
    }

    // Check if the role has permissions
    const rolePermissions = securityConfig.authorization.rolePermissions?.[user.role];
    if (!rolePermissions) {
        throw new FirebirdError(`No permissions defined for role: ${user.role}`, 'AUTHORIZATION_ERROR');
    }

    // Check if the role has access to the operation
    if (rolePermissions.operations && rolePermissions.operations.includes(operation as any)) {
        return true;
    }

    // Deny access
    throw new FirebirdError(`Operation ${operation} denied for role ${user.role}`, 'AUTHORIZATION_ERROR');
}

/**
 * Check if an operation is allowed based on the security configuration
 * @param {string} operation - Operation to check
 * @returns {boolean} Whether the operation is allowed
 * @throws {FirebirdError} If the operation is not allowed
 */
export function checkAllowedOperation(operation: string): boolean {
    operation = operation.toUpperCase();
    // Check if the operation is explicitly forbidden
    if (securityConfig.forbiddenOperations && securityConfig.forbiddenOperations.includes(operation)) {
        throw new FirebirdError(`Operation ${operation} is forbidden`, 'AUTHORIZATION_ERROR');
    }

    // Check if allowed operations are defined and the operation is not in the list
    if (securityConfig.allowedOperations && !securityConfig.allowedOperations.includes(operation)) {
        throw new FirebirdError(`Operation ${operation} is not allowed`, 'AUTHORIZATION_ERROR');
    }

    return checkOperationAccess(operation);
}

/**
 * Check if a table is allowed based on the security configuration
 * @param {string} tableName - Name of the table
 * @returns {boolean} Whether the table is allowed
 * @throws {FirebirdError} If the table is not allowed
 */
export function checkAllowedTable(tableName: string): boolean {
    // Check if the table is explicitly forbidden
    if (securityConfig.forbiddenTables && securityConfig.forbiddenTables.includes(tableName)) {
        throw new FirebirdError(`Access to table ${tableName} is forbidden`, 'AUTHORIZATION_ERROR');
    }

    // Check if allowed tables are defined and the table is not in the list
    if (securityConfig.allowedTables && !securityConfig.allowedTables.includes(tableName)) {
        throw new FirebirdError(`Access to table ${tableName} is not allowed`, 'AUTHORIZATION_ERROR');
    }

    // Check if the table matches the table name pattern
    if (securityConfig.tableNamePattern) {
        const pattern = new RegExp(securityConfig.tableNamePattern);
        if (!pattern.test(tableName)) {
            throw new FirebirdError(`Table ${tableName} does not match the allowed pattern`, 'AUTHORIZATION_ERROR');
        }
    }

    return checkTableAccess(tableName);
}

/**
 * Verify an OAuth2 token
 * @param {string} token - OAuth2 token
 * @returns {Promise<UserInfo>} User information
 * @throws {FirebirdError} If the token is invalid
 */
export async function verifyOAuth2Token(token: string): Promise<UserInfo> {
    if (!securityConfig.authorization || securityConfig.authorization.type !== 'oauth2') {
        throw new FirebirdError('OAuth2 authorization not configured', 'AUTHORIZATION_ERROR');
    }

    if (!securityConfig.authorization.oauth2) {
        throw new FirebirdError('OAuth2 configuration missing', 'AUTHORIZATION_ERROR');
    }

    const { tokenVerifyUrl, clientId, clientSecret, scope, resourceUrl } = securityConfig.authorization.oauth2;

    try {
        // Call the token verification endpoint
        const response = await fetch(tokenVerifyUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                // OAuth client password authentication form-encodes each value first.
                'Authorization': `Basic ${Buffer.from(`${formEncode(clientId)}:${formEncode(clientSecret)}`).toString('base64')}`
            },
            body: new URLSearchParams({ token }).toString(),
            signal: AbortSignal.timeout(5000),
            redirect: 'error'
        });

        if (!response.ok) {
            throw new FirebirdError(`Token verification failed: ${response.statusText}`, 'AUTHORIZATION_ERROR');
        }

        // Extract user information from the response
        const data = await response.json() as Record<string, unknown>;
        const now = Date.now() / 1000;
        if (!data || typeof data !== 'object' || Array.isArray(data) || data.active !== true ||
            (data.exp !== undefined && (typeof data.exp !== 'number' || !Number.isFinite(data.exp) || data.exp <= now)) ||
            (data.nbf !== undefined && (typeof data.nbf !== 'number' || !Number.isFinite(data.nbf) || data.nbf > now))) {
            throw new Error('Inactive or expired token');
        }
        // Introspection "active" alone is not an audience check. Reject absent,
        // malformed and foreign audiences; never fall back to the OAuth client ID.
        const audiences = typeof data.aud === 'string' ? [data.aud] : data.aud;
        if (!resourceUrl || !Array.isArray(audiences) || !audiences.every(audience => typeof audience === 'string') ||
            !audiences.includes(resourceUrl)) throw new Error('Invalid token audience');
        const scopes = typeof data.scope === 'string' ? data.scope.split(/\s+/) : [];
        const subject = data.sub || data.user_id;
        const role = data.role || (Array.isArray(data.roles) ? data.roles[0] : undefined);
        if (typeof subject !== 'string' || !subject.trim() || typeof role !== 'string' || !role.trim()) throw new Error('Missing identity or role');
        if (scope && scope.split(' ').some(required => !scopes.includes(required))) throw new OAuthTokenError('insufficient_scope');
        const username = data.username || data.preferred_username || data.email;

        const userInfo: UserInfo = {
            id: subject,
            username: typeof username === 'string' ? username : '',
            role
        };

        return userInfo;
    } catch (error) {
        if (error instanceof OAuthTokenError) throw error;
        throw new OAuthTokenError();
    }
}

function formEncode(value: string): string {
    return new URLSearchParams({ value }).toString().slice('value='.length);
}
