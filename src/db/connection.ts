/**
 * Database connection module for MCP Firebird
 * Provides functionality for connecting to Firebird databases
 */

import Firebird from 'node-firebird';
import { createLogger } from '../utils/logger.js';
import { FirebirdError, ErrorTypes } from '../utils/errors.js';
import { DriverFactory } from './driver-factory.js';

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
    /**
     * Wire encryption setting for Firebird 3.0+
     * - 'Disabled': No wire encryption (compatible with all versions)
     * - 'Enabled': Wire encryption enabled if supported
     * - 'Required': Wire encryption required
     * Default: 'Disabled' for maximum compatibility
     */
    wireCrypt?: 'Disabled' | 'Enabled' | 'Required';
}

import * as path from 'path';

/**
 * Normalize database path - preserve remote and Unix paths
 * Only normalizes local Windows paths to avoid breaking remote connections
 * and Unix/Linux absolute paths
 *
 * @param dbPath - Database path to normalize
 * @returns Normalized database path
 */
export function normalizeDatabasePath(dbPath: string | undefined): string {
    if (!dbPath) return '';

    // Don't normalize if:
    // 1. Starts with / (Unix/Linux absolute path)
    // 2. Contains :/ (remote connection string like 'hostname:/path/to/db.fdb')
    // 3. Running on non-Windows platform
    if (dbPath.startsWith('/') ||
        dbPath.includes(':/') ||
        process.platform !== 'win32') {
        return dbPath;
    }

    // Only normalize local Windows paths
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
    console.error(`FIREBIRD_WIRECRYPT: ${process.env.FIREBIRD_WIRECRYPT || 'not set'}`);
    console.error(`FB_WIRECRYPT: ${process.env.FB_WIRECRYPT || 'not set'}`);

    // Check for global configuration first (set by CLI)
    const globalConfigFromEnv = (global as any).MCP_FIREBIRD_CONFIG;

    // Get WireCrypt setting with proper validation
    const wireCryptValue = globalConfigFromEnv?.wireCrypt ||
                          process.env.FIREBIRD_WIRECRYPT ||
                          process.env.FB_WIRECRYPT ||
                          'Disabled';

    // Validate WireCrypt value
    const validWireCryptValues: Array<'Disabled' | 'Enabled' | 'Required'> = ['Disabled', 'Enabled', 'Required'];
    const wireCrypt = validWireCryptValues.includes(wireCryptValue as any)
        ? (wireCryptValue as 'Disabled' | 'Enabled' | 'Required')
        : 'Disabled';

    const config = {
        host: globalConfigFromEnv?.host || process.env.FIREBIRD_HOST || process.env.FB_HOST || '127.0.0.1', // Use 127.0.0.1 instead of 'localhost'
        port: parseInt(String(globalConfigFromEnv?.port || process.env.FIREBIRD_PORT || process.env.FB_PORT || '3050'), 10),
        database: normalizeDatabasePath(globalConfigFromEnv?.database || process.env.FIREBIRD_DATABASE || process.env.FB_DATABASE),
        user: globalConfigFromEnv?.user || process.env.FIREBIRD_USER || process.env.FB_USER || 'SYSDBA',
        password: globalConfigFromEnv?.password || process.env.FIREBIRD_PASSWORD || process.env.FB_PASSWORD || 'masterkey',
        role: globalConfigFromEnv?.role || process.env.FIREBIRD_ROLE || process.env.FB_ROLE || undefined,
        pageSize: globalConfigFromEnv?.pageSize || 4096,
        wireCrypt: wireCrypt
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
    console.error(`wireCrypt: ${config.wireCrypt}`);

    return config;
};

// For backward compatibility
export const DEFAULT_CONFIG: ConfigOptions = {
    host: '127.0.0.1', // Use 127.0.0.1 instead of 'localhost'
    port: 3050,
    database: '',
    user: 'SYSDBA',
    password: 'masterkey',
    role: undefined,
    pageSize: 4096
};


// FirebirdError is now imported from '../utils/errors.js'

// Store pool instance globally to persist across requests
let globalPool: ConnectionPool | null = null;

export class ConnectionPool {
    private pool: FirebirdDatabase[] = [];
    private activeCount: number = 0;
    private waiting: Array<{resolve: (db: FirebirdDatabase) => void, reject: (err: Error) => void}> = [];
    private maxConnections: number;
    private isDestroying: boolean = false;

    constructor(private config: ConfigOptions, maxConnections: number = 5) {
        this.maxConnections = maxConnections;
    }

    async acquire(): Promise<FirebirdDatabase> {
        if (this.isDestroying) {
            throw new FirebirdError('El pool de conexiones se está cerrando', ErrorTypes.DATABASE_CONNECTION);
        }

        if (this.pool.length > 0) {
            logger.debug(`Reusando conexión del pool. Activas: ${this.activeCount}, En pool: ${this.pool.length - 1}`);
            return this.pool.pop()!;
        }

        if (this.activeCount < this.maxConnections) {
            this.activeCount++;
            try {
                logger.debug(`Creando nueva conexión. Activas: ${this.activeCount}/${this.maxConnections}`);
                const driver = await DriverFactory.getDriver();
                const db = await driver.attach(this.config);
                
                // Override detach to return to pool instead of closing
                const originalDetach = db.detach;
                
                // Store a reference to real detach for destruction
                (db as any)._realDetach = originalDetach;

                db.detach = (callback) => {
                    this.release(db, originalDetach, callback);
                };
                
                return db;
            } catch (error) {
                this.activeCount--;
                throw error;
            }
        }

        // Wait for an available connection
        logger.debug(`Esperando por conexión disponible. En cola: ${this.waiting.length + 1}`);
        return new Promise((resolve, reject) => {
            this.waiting.push({ resolve, reject });
        });
    }

    private release(db: FirebirdDatabase, originalDetach: Function, callback?: (err: Error | null) => void): void {
        if (this.isDestroying) {
            this.activeCount--;
            originalDetach.call(db, callback);
            return;
        }

        if (this.waiting.length > 0) {
            const next = this.waiting.shift()!;
            next.resolve(db);
            if (callback) callback(null);
        } else if (this.pool.length < this.maxConnections) {
            this.pool.push(db);
            if (callback) callback(null);
        } else {
            // Pool is full, really detach
            this.activeCount--;
            originalDetach.call(db, callback);
        }
    }

    async destroyAll(): Promise<void> {
        this.isDestroying = true;
        const currentPool = [...this.pool];
        this.pool = [];
        
        // Reject all waiting queries
        for (const waiting of this.waiting) {
            waiting.reject(new FirebirdError('El servidor se está apagando', ErrorTypes.DATABASE_CONNECTION));
        }
        this.waiting = [];
        
        const promises = currentPool.map(db => {
            return new Promise<void>((resolve) => {
                const realDetach = (db as any)._realDetach || db.detach;
                this.activeCount--;
                realDetach.call(db, () => resolve());
            });
        });
        
        await Promise.all(promises);
        this.activeCount = 0;
        logger.info('Todas las conexiones del pool han sido cerradas');
    }
}

/**
 * Obtiene o crea el pool global de conexiones
 */
export const getPool = (config: ConfigOptions = getDefaultConfig()): ConnectionPool => {
    if (!globalPool) {
        logger.info('Inicializando Global Connection Pool', { maxConnections: 5 });
        globalPool = new ConnectionPool(config, 5);
    }
    return globalPool;
};

/**
 * Cierra todas las conexiones del pool global
 */
export const closePool = async (): Promise<void> => {
    if (globalPool) {
        await globalPool.destroyAll();
        globalPool = null;
    }
};

/**
 * Establece conexión con la base de datos usando el driver apropiado y el pool
 * @param config - Configuración de conexión a la base de datos
 * @returns Objeto de conexión a la base de datos
 * @throws {FirebirdError} Error categorizado si la conexión falla
 */
export const connectToDatabase = async (config = getDefaultConfig()): Promise<FirebirdDatabase> => {
    // Verify minimum parameters
    if (!config.database) {
        console.error('No database specified in config, using hardcoded default path');
        config.database = 'F:/Proyectos/SAI/EMPLOYEE.FDB';
    }


    try {
        const pool = getPool(config);
        return await pool.acquire();
    } catch (error) {
        // Categorize the error for better handling
        let errorType = ErrorTypes.DATABASE_CONNECTION;
        let errorMsg = `Error connecting to database: ${error instanceof Error ? error.message : String(error)}`;

        if (error instanceof Error) {
            if (error.message.includes('service is not defined')) {
                errorType = ErrorTypes.DATABASE_CONNECTION;
                errorMsg = 'Firebird service is not available. Verify that the Firebird server is running.';
            } else if (error.message.includes('ECONNREFUSED')) {
                errorType = ErrorTypes.DATABASE_CONNECTION;
                errorMsg = `Connection refused at ${config.host}:${config.port}. Verify that the Firebird server is running and accessible at this address.`;
            } else if (error.message.includes('ENOENT')) {
                errorType = ErrorTypes.DATABASE_CONNECTION;
                errorMsg = `Database not found: ${config.database}. Verify the path and permissions.`;
            } else if (error.message.includes('password') || error.message.includes('user')) {
                errorType = ErrorTypes.SECURITY_AUTHENTICATION;
                errorMsg = 'Authentication error. Verify username and password.';
            } else if (error.message.includes('ETIMEDOUT')) {
                errorType = ErrorTypes.DATABASE_CONNECTION;
                errorMsg = `Connection timed out at ${config.host}:${config.port}. Verify that the Firebird server is accessible and not blocked by a firewall.`;
            } else if (error.message.includes('EHOSTUNREACH')) {
                errorType = ErrorTypes.DATABASE_CONNECTION;
                errorMsg = `Host unreachable at ${config.host}:${config.port}. Verify network connectivity and that the host exists.`;
            }
        }

        logger.error(errorMsg, { originalError: error });
        throw new FirebirdError(errorMsg, errorType, error);
    }
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
