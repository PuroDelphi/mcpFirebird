/**
 * Driver Factory for MCP Firebird
 * Provides abstraction layer to support both node-firebird and node-firebird-driver-native
 */

import { createLogger } from '../utils/logger.js';
import { FirebirdError, ErrorTypes } from '../utils/errors.js';
import type { ConfigOptions, FirebirdDatabase } from './connection.js';
import { createRequire } from 'module';

const logger = createLogger('db:driver-factory');

// Create require function for ES modules to load CommonJS modules
const require = createRequire(import.meta.url);


/**
 * Driver types available
 */
export enum DriverType {
    PURE_JS = 'node-firebird',
    NATIVE = 'node-firebird-driver-native'
}

/**
 * Interface for database driver abstraction
 */
export interface IFirebirdDriver {
    /**
     * Initialize driver (load dependencies)
     */
    initialize?(): Promise<void>;

    /**
     * Connect to database
     */
    attach(config: ConfigOptions): Promise<FirebirdDatabase>;

    /**
     * Get driver type
     */
    getType(): DriverType;

    /**
     * Check if driver supports wire encryption
     */
    supportsWireEncryption(): boolean;
}

/**
 * Pure JavaScript driver implementation (node-firebird)
 */
class PureJSDriver implements IFirebirdDriver {
    private Firebird: any;
    
    constructor() {
        // Dynamic import to avoid issues if not installed
        try {
            // Use dynamic import for ES modules
            this.Firebird = null;
        } catch (error) {
            throw new FirebirdError(
                'node-firebird no está instalado',
                ErrorTypes.DATABASE_CONNECTION,
                { originalError: error }
            );
        }
    }
    
    async initialize(): Promise<void> {
        if (!this.Firebird) {
            const module = await import('node-firebird');
            this.Firebird = module.default;
        }
    }
    
    async attach(config: ConfigOptions): Promise<FirebirdDatabase> {
        await this.initialize();
        
        return new Promise((resolve, reject) => {
            const options = {
                host: config.host,
                port: config.port,
                database: config.database,
                user: config.user,
                password: config.password,
                lowercase_keys: config.lowercase_keys ?? false,
                role: config.role,
                pageSize: config.pageSize
            };
            
            logger.info('Conectando con node-firebird (Pure JavaScript)...', {
                host: options.host,
                port: options.port,
                database: options.database,
                user: options.user
            });
            
            this.Firebird.attach(options, (err: Error | null, db: FirebirdDatabase) => {
                if (err) {
                    logger.error('Error al conectar con node-firebird', { error: err });
                    reject(new FirebirdError(
                        `Error al conectar a la base de datos: ${err.message}`,
                        ErrorTypes.DATABASE_CONNECTION,
                        { originalError: err }
                    ));
                } else {
                    logger.info('Conexión exitosa con node-firebird');
                    resolve(db);
                }
            });
        });
    }
    
    getType(): DriverType {
        return DriverType.PURE_JS;
    }
    
    supportsWireEncryption(): boolean {
        return false;
    }
}

/**
 * Native driver implementation (node-firebird-driver-native)
 */
class NativeDriver implements IFirebirdDriver {
    private client: any = null;
    private attachment: any = null;
    
    async initialize(): Promise<void> {
        if (!this.client) {
            let nativeModule;
            let loadMethod = 'unknown';

            try {
                // Try to load the native driver using require (works with global modules)
                // We use createRequire from 'module' to enable require() in ES modules
                try {
                    logger.info('Attempting to load native driver via require...');
                    nativeModule = require('node-firebird-driver-native');
                    loadMethod = 'require';
                    logger.info('✅ Native driver loaded via require (local or global)');
                } catch (requireError) {
                    const reqErrMsg = requireError instanceof Error ? requireError.message : String(requireError);
                    logger.warn('Failed to load via require, trying dynamic import...', { error: reqErrMsg });

                    // Second try: dynamic import (for ESM compatibility)
                    const importModule = new Function('moduleName', 'return import(moduleName)');
                    nativeModule = await importModule('node-firebird-driver-native');
                    loadMethod = 'dynamic import';
                    logger.info('✅ Native driver loaded via dynamic import');
                }

                logger.info('Creating native client...', { loadMethod });
                this.client = nativeModule.createNativeClient(nativeModule.getDefaultLibraryFilename());
                logger.info('✅ Cliente nativo de Firebird inicializado correctamente', { loadMethod });
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                const errorStack = error instanceof Error ? error.stack : undefined;
                logger.error('❌ Failed to load native driver', {
                    error: errorMessage,
                    stack: errorStack,
                    loadMethod
                });
                throw new FirebirdError(
                    'node-firebird-driver-native no está instalado o no se pudo cargar. ' +
                    'Instálalo globalmente con: npm install -g node-firebird-driver-native\n' +
                    `Error: ${errorMessage}`,
                    ErrorTypes.DATABASE_CONNECTION,
                    { originalError: error }
                );
            }
        }
    }
    
    async attach(config: ConfigOptions): Promise<FirebirdDatabase> {
        await this.initialize();

        try {
            logger.info('Conectando con node-firebird-driver-native (Native Client)...', {
                host: config.host,
                port: config.port,
                database: config.database,
                user: config.user,
                wireCrypt: config.wireCrypt || 'Enabled'
            });

            // Build connection string for native driver
            // IMPORTANT: Always use TCP/IP format (host:path) even for localhost
            // to enable wire encryption. Direct path uses embedded mode which doesn't support wire encryption.
            let connectionString: string;

            // Always use TCP/IP format when wire encryption is enabled
            if (config.port && config.port !== 3050) {
                connectionString = `${config.host}/${config.port}:${config.database}`;
            } else {
                connectionString = `${config.host}:${config.database}`;
            }
            logger.info('Connection details', {
                connectionString,
                host: config.host,
                port: config.port,
                database: config.database,
                wireCrypt: config.wireCrypt
            });

            // IMPORTANT: WireCrypt CANNOT be configured via DPB (Database Parameter Buffer)
            // According to Firebird documentation, WireCrypt must be configured in:
            // - firebird.conf (server-side)
            // - databases.conf (per-database override)
            //
            // The DPB only supports: username, password, role, forcedWrite
            // See: https://firebirdsql.org/file/documentation/release_notes/html/en/3_0/rlsnotes30.html
            //
            // If you need wire encryption, configure it in the Firebird server's firebird.conf:
            // WireCrypt = Required | Enabled | Disabled

            if (config.wireCrypt) {
                logger.warn('WireCrypt parameter ignored - must be configured in firebird.conf on the server');
                logger.warn('See: https://firebirdsql.org/file/documentation/release_notes/html/en/3_0/rlsnotes30.html#conf-wirecrypt');
            }

            // Use the standard connect method with connection options
            const connectionOptions: any = {
                username: config.user,
                password: config.password
            };

            // Add optional parameters
            if (config.role) {
                connectionOptions.role = config.role;
            }

            logger.info('Connecting with standard connection options', connectionOptions);

            // Use the standard connect method
            this.attachment = await (this.client as any).connect(
                connectionString,
                connectionOptions
            );
            
            logger.info('Conexión exitosa con node-firebird-driver-native');
            
            // Create adapter to match node-firebird interface
            return this.createAdapter(this.attachment);
        } catch (error) {
            logger.error('Error al conectar con node-firebird-driver-native', { error });
            throw new FirebirdError(
                `Error al conectar a la base de datos: ${error instanceof Error ? error.message : String(error)}`,
                ErrorTypes.DATABASE_CONNECTION,
                { originalError: error }
            );
        }
    }
    
    /**
     * Create adapter to match node-firebird interface
     */
    private createAdapter(attachment: any): FirebirdDatabase {
        return {
            query: async (sql: string, params: any[], callback: (err: Error | null, results?: any[]) => void) => {
                let transaction;
                try {
                    // Start a transaction for the query
                    transaction = await attachment.startTransaction();

                    // Execute query with transaction
                    const resultSet = await attachment.executeQuery(transaction, sql, params);

                    // Fetch all results
                    const rows = await resultSet.fetchAsObject();

                    // Close result set
                    await resultSet.close();

                    // Commit transaction
                    await transaction.commit();

                    // Return results
                    callback(null, rows);
                } catch (err) {
                    // Rollback on error
                    if (transaction) {
                        try {
                            await transaction.rollback();
                        } catch (rollbackErr) {
                            logger.error('Error rolling back transaction', { error: rollbackErr });
                        }
                    }
                    callback(err as Error);
                }
            },
            detach: (callback: (err: Error | null) => void) => {
                attachment.disconnect()
                    .then(() => callback(null))
                    .catch((err: Error) => callback(err));
            },
            // Store original attachment for advanced usage
            _nativeAttachment: attachment
        };
    }
    
    getType(): DriverType {
        return DriverType.NATIVE;
    }
    
    supportsWireEncryption(): boolean {
        return true;
    }
}

/**
 * Driver factory to create appropriate driver instance
 */
export class DriverFactory {
    private static instance: IFirebirdDriver | null = null;
    private static useNativeDriver: boolean = false;
    
    /**
     * Set whether to use native driver
     */
    static setUseNativeDriver(useNative: boolean): void {
        DriverFactory.useNativeDriver = useNative;
        DriverFactory.instance = null; // Reset instance to force recreation
        
        if (useNative) {
            logger.info('Configurado para usar node-firebird-driver-native (soporta wire encryption)');
        } else {
            logger.info('Configurado para usar node-firebird (Pure JavaScript, sin wire encryption)');
        }
    }
    
    /**
     * Get driver instance (singleton)
     */
    static async getDriver(): Promise<IFirebirdDriver> {
        if (!DriverFactory.instance) {
            if (DriverFactory.useNativeDriver) {
                try {
                    DriverFactory.instance = new NativeDriver();
                    if (DriverFactory.instance.initialize) {
                        await DriverFactory.instance.initialize();
                    }
                    logger.info('Usando node-firebird-driver-native');
                } catch (error) {
                    logger.warn('No se pudo cargar node-firebird-driver-native, usando node-firebird', { error });
                    DriverFactory.instance = new PureJSDriver();
                }
            } else {
                DriverFactory.instance = new PureJSDriver();
                logger.info('Usando node-firebird (Pure JavaScript)');
            }
        }

        return DriverFactory.instance;
    }
    
    /**
     * Check if native driver is available
     */
    static async isNativeDriverAvailable(): Promise<boolean> {
        try {
            // Try require first (works with global modules)
            require('node-firebird-driver-native');
            return true;
        } catch {
            try {
                // Fallback to dynamic import
                const importModule = new Function('moduleName', 'return import(moduleName)');
                await importModule('node-firebird-driver-native');
                return true;
            } catch {
                return false;
            }
        }
    }
    
    /**
     * Get information about available drivers
     */
    static async getDriverInfo(): Promise<{
        current: DriverType;
        nativeAvailable: boolean;
        supportsWireEncryption: boolean;
    }> {
        const driver = await DriverFactory.getDriver();
        const nativeAvailable = await DriverFactory.isNativeDriverAvailable();
        
        return {
            current: driver.getType(),
            nativeAvailable,
            supportsWireEncryption: driver.supportsWireEncryption()
        };
    }
}

