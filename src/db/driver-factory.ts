/**
 * Driver Factory for MCP Firebird
 * Provides abstraction layer to support both node-firebird and node-firebird-driver-native
 */

import { createLogger } from '../utils/logger.js';
import { FirebirdError, ErrorTypes } from '../utils/errors.js';
import type { ConfigOptions, FirebirdDatabase } from './connection.js';

const logger = createLogger('db:driver-factory');

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
            try {
                // Dynamic import using Function constructor to avoid TypeScript checking
                // This allows the module to be optional without compilation errors
                const importModule = new Function('moduleName', 'return import(moduleName)');
                const nativeModule = await importModule('node-firebird-driver-native');
                this.client = nativeModule.createNativeClient(nativeModule.getDefaultLibraryFilename());
                logger.info('Cliente nativo de Firebird inicializado correctamente');
            } catch (error) {
                throw new FirebirdError(
                    'node-firebird-driver-native no está instalado o no se pudo cargar. ' +
                    'Instálalo con: npm install node-firebird-driver-native',
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
            // For local connections (localhost/127.0.0.1), use direct path
            // For remote connections, use host:path or host/port:path format
            let connectionString: string;
            const isLocalConnection = config.host === 'localhost' || config.host === '127.0.0.1';

            if (isLocalConnection) {
                // Local connection - use direct path
                connectionString = config.database;
                logger.info(`Using local connection string: ${connectionString}`);
            } else {
                // Remote connection - use host/port:path format if port is specified
                if (config.port && config.port !== 3050) {
                    connectionString = `${config.host}/${config.port}:${config.database}`;
                } else {
                    connectionString = `${config.host}:${config.database}`;
                }
                logger.info(`Using remote connection string: ${connectionString}`);
            }
            
            // Build connection options
            const connectionOptions: any = {
                username: config.user,
                password: config.password
            };

            // Add optional parameters
            if (config.role) {
                connectionOptions.role = config.role;
            }

            // Add port if not default
            if (config.port && config.port !== 3050) {
                connectionOptions.port = config.port;
            }

            // Add wire encryption configuration using DPB (Database Parameter Buffer)
            if (config.wireCrypt) {
                // The native driver uses DPB parameters
                // WireCrypt values: Disabled, Enabled, Required
                connectionOptions.config = `WireCrypt=${config.wireCrypt}`;
                logger.info(`Wire encryption configured in DPB: WireCrypt=${config.wireCrypt}`);
            }

            logger.info('Connection options:', connectionOptions);

            // Connect using native driver
            this.attachment = await this.client.connect(connectionString, connectionOptions);
            
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
            query: (sql: string, params: any[], callback: (err: Error | null, results?: any[]) => void) => {
                attachment.executeQuery(sql, params)
                    .then((resultSet: any) => resultSet.fetchAll())
                    .then((rows: any[]) => callback(null, rows))
                    .catch((err: Error) => callback(err));
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
            // Dynamic import using Function constructor to avoid TypeScript checking
            const importModule = new Function('moduleName', 'return import(moduleName)');
            await importModule('node-firebird-driver-native');
            return true;
        } catch {
            return false;
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

