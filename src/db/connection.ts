/**
 * Database connection module for MCP Firebird
 * Provides functionality for connecting to Firebird databases
 */

import Firebird from 'node-firebird';
import { createLogger } from '../utils/logger.js';
import { FirebirdError, ErrorTypes } from '../utils/errors.js';

const logger = createLogger('db:connection');

/**
 * Tipo para el objeto de conexión de Firebird
 */
export interface FirebirdDatabase {
    query: (sql: string, params: any[], callback: (err: Error | null, results?: any[]) => void) => any;
    detach: (callback: (err: Error | null) => void) => void;
    [key: string]: any;
}

/**
 * Interfaz que define las opciones de configuración para la conexión a Firebird
 */
export interface ConfigOptions {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    lowercase_keys?: boolean;
    role?: string;
    pageSize?: number;
}

import * as path from 'path';

// Normalize database path for Windows
export function normalizeDatabasePath(dbPath: string | undefined): string {
    if (!dbPath) return '';
    return path.normalize(dbPath);
}

// Get configuration from global variable
export const getGlobalConfig = (): ConfigOptions | null => {
    try {
        if ((global as any).MCP_FIREBIRD_CONFIG) {
            const config = (global as any).MCP_FIREBIRD_CONFIG;
            console.error('Using global database configuration');
            console.error(`Global config: database=${config.database}, host=${config.host}, port=${config.port}, user=${config.user}`);
            return config;
        } else {
            console.error('No global database configuration found');
        }
    } catch (error) {
        console.error(`Error getting global configuration: ${error instanceof Error ? error.message : String(error)}`);
    }
    return null;
};

// Default configuration for the connection
export const getDefaultConfig = (): ConfigOptions => {
    // First try to load from global configuration
    const globalConfig = getGlobalConfig();
    if (globalConfig && globalConfig.database) {
        console.error('Using global configuration');
        return globalConfig;
    }

    // Debug: Log all environment variables related to database connection
    console.error('Environment variables for database connection:');
    console.error(`FIREBIRD_DATABASE: ${process.env.FIREBIRD_DATABASE || 'not set'}`);
    console.error(`FB_DATABASE: ${process.env.FB_DATABASE || 'not set'}`);
    console.error(`FIREBIRD_HOST: ${process.env.FIREBIRD_HOST || 'not set'}`);
    console.error(`FB_HOST: ${process.env.FB_HOST || 'not set'}`);
    console.error(`FIREBIRD_PORT: ${process.env.FIREBIRD_PORT || 'not set'}`);
    console.error(`FB_PORT: ${process.env.FB_PORT || 'not set'}`);
    console.error(`FIREBIRD_USER: ${process.env.FIREBIRD_USER || 'not set'}`);
    console.error(`FB_USER: ${process.env.FB_USER || 'not set'}`);
    // Don't log passwords
    console.error(`FIREBIRD_ROLE: ${process.env.FIREBIRD_ROLE || 'not set'}`);
    console.error(`FB_ROLE: ${process.env.FB_ROLE || 'not set'}`);

    const config = {
        host: process.env.FIREBIRD_HOST || process.env.FB_HOST || 'localhost', // FB_HOST is deprecated
        port: parseInt(process.env.FIREBIRD_PORT || process.env.FB_PORT || '3050', 10), // FB_PORT is deprecated
        database: normalizeDatabasePath(process.env.FIREBIRD_DATABASE || process.env.FB_DATABASE), // FB_DATABASE is deprecated
        user: process.env.FIREBIRD_USER || process.env.FB_USER || 'SYSDBA', // FB_USER is deprecated
        password: process.env.FIREBIRD_PASSWORD || process.env.FB_PASSWORD || 'masterkey', // FB_PASSWORD is deprecated
        role: process.env.FIREBIRD_ROLE || process.env.FB_ROLE || undefined, // FB_ROLE is deprecated
        pageSize: 4096
    };

    // Debug: Log the final configuration (without password)
    console.error('Final database configuration:');
    console.error(`host: ${config.host}`);
    console.error(`port: ${config.port}`);
    console.error(`database: ${config.database}`);
    console.error(`user: ${config.user}`);
    // Don't log password
    console.error(`role: ${config.role || 'not set'}`);
    console.error(`pageSize: ${config.pageSize}`);

    return config;
};

// For backward compatibility
export const DEFAULT_CONFIG: ConfigOptions = {
    host: 'localhost',
    port: 3050,
    database: '',
    user: 'SYSDBA',
    password: 'masterkey',
    role: undefined,
    pageSize: 4096
};


// FirebirdError is now imported from '../utils/errors.js'

/**
 * Establece conexión con la base de datos
 * @param config - Configuración de conexión a la base de datos
 * @returns Objeto de conexión a la base de datos
 * @throws {FirebirdError} Error categorizado si la conexión falla
 */
export const connectToDatabase = (config = getDefaultConfig()): Promise<FirebirdDatabase> => {
    return new Promise((resolve, reject) => {
        logger.info(`Connecting to ${config.host}:${config.port}/${config.database}`);

        // Verify minimum parameters
        if (!config.database) {
            reject(new FirebirdError(
                'No database specified. Configure FIREBIRD_DATABASE environment variable with the path to your database file.',
                ErrorTypes.CONFIG_MISSING
            ));
            return;
        }

        Firebird.attach(config, (err: Error | null, db: any) => {
            if (err) {
                // Categorize the error for better handling
                let errorType = ErrorTypes.DATABASE_CONNECTION;
                let errorMsg = `Error connecting to database: ${err.message}`;

                if (err.message.includes('service is not defined')) {
                    errorType = ErrorTypes.DATABASE_CONNECTION;
                    errorMsg = 'Firebird service is not available. Verify that the Firebird server is running.';
                } else if (err.message.includes('ECONNREFUSED')) {
                    errorType = ErrorTypes.DATABASE_CONNECTION;
                    errorMsg = `Connection refused at ${config.host}:${config.port}. Verify that the Firebird server is running and accessible.`;
                } else if (err.message.includes('ENOENT')) {
                    errorType = ErrorTypes.DATABASE_CONNECTION;
                    errorMsg = `Database not found: ${config.database}. Verify the path and permissions.`;
                } else if (err.message.includes('password') || err.message.includes('user')) {
                    errorType = ErrorTypes.SECURITY_AUTHENTICATION;
                    errorMsg = 'Authentication error. Verify username and password.';
                }

                logger.error(errorMsg, { originalError: err });
                reject(new FirebirdError(errorMsg, errorType, err));
                return;
            }

            logger.info('Connection established successfully');
            resolve(db);
        });
    });
};

/**
 * Ejecuta una consulta en la base de datos
 * @param {FirebirdDatabase} db - Objeto de conexión a la base de datos
 * @param {string} sql - Consulta SQL a ejecutar
 * @param {Array} params - Parámetros para la consulta
 * @returns {Promise<any[]>} Resultado de la consulta
 * @throws {FirebirdError} Error categorizado si la consulta falla
 */
export const queryDatabase = (db: FirebirdDatabase, sql: string, params: any[] = []): Promise<any[]> => {
    return new Promise((resolve, reject) => {
        logger.info(`Ejecutando consulta: ${sql.substring(0, 100)}${sql.length > 100 ? '...' : ''}`);

        db.query(sql, params, (err: Error | null, result: any) => {
            if (err) {
                // Categorizar el error para mejor manejo
                let errorType = 'QUERY_ERROR';

                // Intentar categorizar el error según su contenido
                if (err.message.includes('syntax error')) {
                    errorType = 'SYNTAX_ERROR';
                } else if (err.message.includes('not defined')) {
                    errorType = 'OBJECT_NOT_FOUND';
                } else if (err.message.includes('permission')) {
                    errorType = 'PERMISSION_ERROR';
                } else if (err.message.includes('deadlock')) {
                    errorType = 'DEADLOCK_ERROR';
                } else if (err.message.includes('timeout')) {
                    errorType = 'TIMEOUT_ERROR';
                }

                // Crear un error más informativo
                const error = new FirebirdError(
                    `Error al ejecutar consulta: ${err.message}`,
                    errorType,
                    err
                );

                logger.error(`${error.message} [${errorType}]`);
                reject(error);
                return;
            }

            // Si no hay resultados, devolver un array vacío
            if (!result) {
                result = [];
            }

            logger.info(`Consulta ejecutada exitosamente, ${result.length} filas obtenidas`);
            resolve(result);
        });
    });
};

/**
 * Prueba la conexión a la base de datos usando la configuración proporcionada.
 * Intenta conectar y desconectar inmediatamente.
 * @param {ConfigOptions} [config=DEFAULT_CONFIG] - Configuración a usar para la prueba.
 * @returns {Promise<void>} Resuelve si la conexión es exitosa, rechaza si falla.
 * @throws {FirebirdError} Error categorizado si la conexión falla.
 */
export const testConnection = async (config = getDefaultConfig()): Promise<void> => {
    logger.info('Probando conexión a la base de datos...');
    let db: FirebirdDatabase | null = null;
    try {
        db = await connectToDatabase(config);
        logger.info('Prueba de conexión exitosa.');
    } catch (error) {
        logger.error('Prueba de conexión fallida.');
        // El error ya debería ser un FirebirdError de connectToDatabase
        throw error;
    } finally {
        if (db) {
            await new Promise<void>((resolve, reject) => {
                db?.detach((detachErr: Error | null) => {
                    if (detachErr) {
                        logger.warn(`Error al cerrar conexión de prueba: ${detachErr.message}`);
                        // No rechazamos la promesa principal por un error de detach,
                        // pero sí lo registramos.
                    }
                    resolve();
                });
            });
        }
    }
};

// Se ha eliminado la función executeQuery ya que está duplicada
// La implementación mejorada se mantiene en queries.ts con validación de SQL
// y manejo de errores más robusto
