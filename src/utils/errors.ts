/**
 * Centralized error handling module for MCP Firebird
 * Provides standardized error classes and utilities for consistent error handling
 */

/**
 * Base error class for MCP Firebird errors
 * Extends the standard Error class with additional properties
 */
export class MCPError extends Error {
    /** Error type identifier */
    type: string;
    /** Original error that caused this error, if any */
    originalError?: any;
    /** Additional error context data */
    context?: Record<string, any>;

    /**
     * Creates a new MCPError
     * @param message - Error message
     * @param type - Error type identifier
     * @param originalError - Original error that caused this error, if any
     * @param context - Additional error context data
     */
    constructor(
        message: string, 
        type: string = 'UNKNOWN_ERROR', 
        originalError?: any,
        context?: Record<string, any>
    ) {
        super(message);
        this.name = 'MCPError';
        this.type = type;
        this.originalError = originalError;
        this.context = context;
    }

    /**
     * Converts the error to a JSON-serializable object
     * @returns A JSON-serializable representation of the error
     */
    toJSON(): Record<string, any> {
        return {
            name: this.name,
            message: this.message,
            type: this.type,
            ...(this.context ? { context: this.context } : {}),
            ...(this.originalError ? { 
                originalError: this.originalError instanceof Error 
                    ? {
                        message: this.originalError.message,
                        name: this.originalError.name,
                        stack: this.originalError.stack
                      }
                    : this.originalError
            } : {})
        };
    }
}

/**
 * Firebird-specific error class
 * Used for errors related to Firebird database operations
 */
export class FirebirdError extends MCPError {
    /**
     * Creates a new FirebirdError
     * @param message - Error message
     * @param type - Error type identifier
     * @param originalError - Original error that caused this error, if any
     * @param context - Additional error context data
     */
    constructor(
        message: string, 
        type: string = 'FIREBIRD_ERROR', 
        originalError?: any,
        context?: Record<string, any>
    ) {
        super(message, type, originalError, context);
        this.name = 'FirebirdError';
    }
}

/**
 * Configuration error class
 * Used for errors related to configuration issues
 */
export class ConfigError extends MCPError {
    constructor(
        message: string, 
        originalError?: any,
        context?: Record<string, any>
    ) {
        super(message, 'CONFIGURATION_ERROR', originalError, context);
        this.name = 'ConfigError';
    }
}

/**
 * Security error class
 * Used for errors related to security issues
 */
export class SecurityError extends MCPError {
    constructor(
        message: string, 
        originalError?: any,
        context?: Record<string, any>
    ) {
        super(message, 'SECURITY_ERROR', originalError, context);
        this.name = 'SecurityError';
    }
}

/**
 * Transport error class
 * Used for errors related to MCP transport issues
 */
export class TransportError extends MCPError {
    constructor(
        message: string, 
        originalError?: any,
        context?: Record<string, any>
    ) {
        super(message, 'TRANSPORT_ERROR', originalError, context);
        this.name = 'TransportError';
    }
}

/**
 * Error type constants
 */
export const ErrorTypes = {
    // Database errors
    DATABASE_CONNECTION: 'DATABASE_CONNECTION_ERROR',
    DATABASE_QUERY: 'DATABASE_QUERY_ERROR',
    DATABASE_TRANSACTION: 'DATABASE_TRANSACTION_ERROR',
    DATABASE_SCHEMA: 'DATABASE_SCHEMA_ERROR',
    
    // Security errors
    SECURITY_VALIDATION: 'SECURITY_VALIDATION_ERROR',
    SECURITY_AUTHORIZATION: 'SECURITY_AUTHORIZATION_ERROR',
    SECURITY_AUTHENTICATION: 'SECURITY_AUTHENTICATION_ERROR',
    
    // Configuration errors
    CONFIG_INVALID: 'CONFIG_INVALID_ERROR',
    CONFIG_MISSING: 'CONFIG_MISSING_ERROR',
    
    // Transport errors
    TRANSPORT_CONNECTION: 'TRANSPORT_CONNECTION_ERROR',
    TRANSPORT_PROTOCOL: 'TRANSPORT_PROTOCOL_ERROR',
    
    // General errors
    INVALID_ARGUMENT: 'INVALID_ARGUMENT_ERROR',
    NOT_IMPLEMENTED: 'NOT_IMPLEMENTED_ERROR',
    INTERNAL: 'INTERNAL_ERROR',
    UNKNOWN: 'UNKNOWN_ERROR'
};
