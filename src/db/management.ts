/**
 * Database management functions for Firebird
 * Provides functionality for backup, restore, and validation of databases
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../utils/logger.js';
const logger = createLogger('db:management');

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
import { ConfigOptions, DEFAULT_CONFIG } from './connection.js';

/**
 * Interface for backup options
 */
export interface BackupOptions {
    format?: 'gbak' | 'nbackup';
    compress?: boolean;
    metadata_only?: boolean;
    verbose?: boolean;
}

/**
 * Interface for restore options
 */
export interface RestoreOptions {
    replace?: boolean;
    pageSize?: number;
    verbose?: boolean;
}

/**
 * Interface for validation options
 */
export interface ValidateOptions {
    checkData?: boolean;
    checkIndexes?: boolean;
    fixErrors?: boolean;
    verbose?: boolean;
}

/**
 * Interface for backup result
 */
export interface BackupResult {
    success: boolean;
    backupPath: string;
    size: number;
    duration: number;
    error?: string;
    details?: string;
}

/**
 * Interface for restore result
 */
export interface RestoreResult {
    success: boolean;
    targetPath: string;
    duration: number;
    error?: string;
    details?: string;
}

/**
 * Interface for validation result
 */
export interface ValidationResult {
    success: boolean;
    valid: boolean;
    issues: string[];
    details: string;
    error?: string;
}

/**
 * Creates a backup of a Firebird database
 * @param {string} backupPath - Path where the backup file will be saved
 * @param {BackupOptions} options - Backup options
 * @param {ConfigOptions} config - Database connection configuration
 * @returns {Promise<BackupResult>} Result of the backup operation
 */
export const backupDatabase = async (
    backupPath: string,
    options: BackupOptions = {},
    config = DEFAULT_CONFIG
): Promise<BackupResult> => {
    const startTime = Date.now();

    try {
        // Ensure the backup directory exists
        const backupDir = path.dirname(backupPath);
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        // Determine which backup tool to use
        const format = options.format || 'gbak';
        let command: string;
        let args: string[] = [];

        if (format === 'gbak') {
            command = 'gbak';
            args = [
                '-b',  // Backup
                '-v',  // Verbose output
                '-user', config.user || 'SYSDBA',
                '-password', config.password || 'masterkey'
            ];

            if (options.metadata_only) {
                args.push('-m');  // Metadata only
            }

            if (options.compress) {
                args.push('-z');  // Compress
            }

            // Add connection string and backup path
            const connectionString = `${config.host}/${config.port}:${config.database}`;
            args.push(connectionString, backupPath);
        } else if (format === 'nbackup') {
            command = 'nbackup';
            args = [
                '-B', '0',  // Level 0 backup (full)
                '-user', config.user || 'SYSDBA',
                '-password', config.password || 'masterkey'
            ];

            // Add database path and backup path
            args.push(config.database, backupPath);
        } else {
            throw new FirebirdError(
                `Invalid backup format: ${format}`,
                'CONFIGURATION_ERROR'
            );
        }

        logger.info(`Starting database backup to ${backupPath} using ${format}`);
        if (options.verbose) {
            logger.debug(`Backup command: ${command} ${args.join(' ')}`);
        }

        // Execute the backup command
        const result = await executeCommand(command, args, options.verbose);

        // Get the size of the backup file
        const stats = fs.statSync(backupPath);
        const duration = Date.now() - startTime;

        logger.info(`Backup completed successfully in ${duration}ms, size: ${stats.size} bytes`);

        return {
            success: true,
            backupPath,
            size: stats.size,
            duration,
            details: result
        };
    } catch (error: any) {
        const duration = Date.now() - startTime;
        const errorMessage = `Error creating database backup: ${error.message || error}`;
        logger.error(errorMessage);

        return {
            success: false,
            backupPath,
            size: 0,
            duration,
            error: errorMessage,
            details: error.details || ''
        };
    }
};

/**
 * Restores a Firebird database from a backup
 * @param {string} backupPath - Path to the backup file
 * @param {string} targetPath - Path where the database will be restored
 * @param {RestoreOptions} options - Restore options
 * @param {ConfigOptions} config - Database connection configuration
 * @returns {Promise<RestoreResult>} Result of the restore operation
 */
export const restoreDatabase = async (
    backupPath: string,
    targetPath: string,
    options: RestoreOptions = {},
    config = DEFAULT_CONFIG
): Promise<RestoreResult> => {
    const startTime = Date.now();

    try {
        // Check if the backup file exists
        if (!fs.existsSync(backupPath)) {
            throw new FirebirdError(
                `Backup file not found: ${backupPath}`,
                'FILE_NOT_FOUND'
            );
        }

        // Check if the target database already exists
        if (fs.existsSync(targetPath) && !options.replace) {
            throw new FirebirdError(
                `Target database already exists: ${targetPath}. Use 'replace: true' to overwrite.`,
                'FILE_EXISTS'
            );
        }

        // Ensure the target directory exists
        const targetDir = path.dirname(targetPath);
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        // Determine which restore tool to use based on the backup file extension
        const ext = path.extname(backupPath).toLowerCase();
        let command: string;
        let args: string[] = [];

        if (ext === '.fbk' || ext === '.gbk') {
            // GBAK restore
            command = 'gbak';
            args = [
                '-c',  // Create (restore)
                '-v',  // Verbose output
                '-user', config.user || 'SYSDBA',
                '-password', config.password || 'masterkey'
            ];

            // Set page size if specified
            if (options.pageSize) {
                args.push('-page_size', options.pageSize.toString());
            }

            // Add backup path and target database path
            args.push(backupPath, targetPath);
        } else if (ext === '.nbk') {
            // NBACKUP restore
            command = 'nbackup';
            args = [
                '-R',  // Restore
                '-user', config.user || 'SYSDBA',
                '-password', config.password || 'masterkey'
            ];

            // Add target database path and backup path
            args.push(targetPath, backupPath);
        } else {
            throw new FirebirdError(
                `Unknown backup file format: ${ext}`,
                'CONFIGURATION_ERROR'
            );
        }

        logger.info(`Starting database restore from ${backupPath} to ${targetPath}`);
        if (options.verbose) {
            logger.debug(`Restore command: ${command} ${args.join(' ')}`);
        }

        // Execute the restore command
        const result = await executeCommand(command, args, options.verbose);

        const duration = Date.now() - startTime;
        logger.info(`Restore completed successfully in ${duration}ms`);

        return {
            success: true,
            targetPath,
            duration,
            details: result
        };
    } catch (error: any) {
        const duration = Date.now() - startTime;
        const errorMessage = `Error restoring database: ${error.message || error}`;
        logger.error(errorMessage);

        return {
            success: false,
            targetPath,
            duration,
            error: errorMessage,
            details: error.details || ''
        };
    }
};

/**
 * Validates a Firebird database
 * @param {ValidateOptions} options - Validation options
 * @param {ConfigOptions} config - Database connection configuration
 * @returns {Promise<ValidationResult>} Result of the validation
 */
export const validateDatabase = async (
    options: ValidateOptions = {},
    config = DEFAULT_CONFIG
): Promise<ValidationResult> => {
    const startTime = Date.now();

    try {
        // Use GFIX for validation
        const command = 'gfix';
        let args: string[] = [
            '-user', config.user || 'SYSDBA',
            '-password', config.password || 'masterkey'
        ];

        // Add validation options
        if (options.checkData) {
            args.push('-v');  // Validate database
        }

        if (options.checkIndexes) {
            args.push('-i');  // Validate indexes
        }

        if (options.fixErrors) {
            args.push('-mend');  // Fix errors
        }

        // Add database path
        args.push(config.database);

        logger.info(`Starting database validation for ${config.database}`);
        if (options.verbose) {
            logger.debug(`Validation command: ${command} ${args.join(' ')}`);
        }

        // Execute the validation command
        const result = await executeCommand(command, args, options.verbose);

        // Parse the result to determine if the database is valid
        const issues: string[] = [];
        const lines = result.split('\n');

        for (const line of lines) {
            if (line.includes('error') || line.includes('corrupt') || line.includes('invalid')) {
                issues.push(line.trim());
            }
        }

        const valid = issues.length === 0;
        const duration = Date.now() - startTime;

        logger.info(`Validation completed in ${duration}ms, valid: ${valid}, issues: ${issues.length}`);

        return {
            success: true,
            valid,
            issues,
            details: result
        };
    } catch (error: any) {
        const duration = Date.now() - startTime;
        const errorMessage = `Error validating database: ${error.message || error}`;
        logger.error(errorMessage);

        return {
            success: false,
            valid: false,
            issues: [errorMessage],
            details: error.details || '',
            error: errorMessage
        };
    }
};

/**
 * Helper function to execute a command and return its output
 * @param {string} command - Command to execute
 * @param {string[]} args - Command arguments
 * @param {boolean} verbose - Whether to log verbose output
 * @returns {Promise<string>} Command output
 */
async function executeCommand(command: string, args: string[], verbose: boolean = false): Promise<string> {
    return new Promise((resolve, reject) => {
        const process = spawn(command, args);
        let stdout = '';
        let stderr = '';

        process.stdout.on('data', (data) => {
            const output = data.toString();
            stdout += output;
            if (verbose) {
                logger.debug(`[${command}] ${output.trim()}`);
            }
        });

        process.stderr.on('data', (data) => {
            const output = data.toString();
            stderr += output;
            if (verbose) {
                logger.error(`[${command}] ${output.trim()}`);
            }
        });

        process.on('close', (code) => {
            if (code === 0) {
                resolve(stdout);
            } else {
                const error = new FirebirdError(
                    `Command failed with code ${code}: ${stderr || 'No error message'}`,
                    'COMMAND_EXECUTION_ERROR'
                );
                (error as any).details = stderr;
                reject(error);
            }
        });

        process.on('error', (error) => {
            const fbError = new FirebirdError(
                `Failed to execute command: ${error.message}`,
                'COMMAND_EXECUTION_ERROR'
            );
            (fbError as any).details = error.message;
            reject(fbError);
        });
    });
}
