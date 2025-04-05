// Módulo de conexión a la base de datos
import Firebird from 'node-firebird';
import { createLogger } from '../utils/logger.js';

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

// Configuración por defecto para la conexión
export const DEFAULT_CONFIG: ConfigOptions = {
    host: process.env.FB_HOST || 'localhost',
    port: parseInt(process.env.FB_PORT || '3050', 10),
    database: process.env.FB_DATABASE || '',
    user: process.env.FB_USER || 'SYSDBA',
    password: process.env.FB_PASSWORD || 'masterkey',
    role: process.env.FB_ROLE || undefined,
    pageSize: 4096
};

/**
 * Clase personalizada para los errores de la base de datos Firebird
 */
export class FirebirdError extends Error {
    type: string;
    originalError?: any;

    constructor(message: string, type: string, originalError?: any) {
        super(message);
        this.name = 'FirebirdError';
        this.type = type;
        this.originalError = originalError;
    }
}

/**
 * Establece conexión con la base de datos
 * @param {ConfigOptions} config - Configuración de conexión a la base de datos
 * @returns {Promise<FirebirdDatabase>} Objeto de conexión a la base de datos
 * @throws {FirebirdError} Error categorizado si la conexión falla
 */
export const connectToDatabase = (config = DEFAULT_CONFIG): Promise<FirebirdDatabase> => {
    return new Promise((resolve, reject) => {
        logger.info(`Conectando a ${config.host}:${config.port}/${config.database}`);
        
        // Verificar parámetros mínimos
        if (!config.database) {
            reject(new FirebirdError(
                'No se ha especificado una base de datos. Configura FB_DATABASE o FIREBIRD_DATABASE.',
                'CONFIGURATION_ERROR'
            ));
            return;
        }

        Firebird.attach(config, (err: Error | null, db: any) => {
            if (err) {
                // Categorizar el error para mejor manejo
                let errorType = 'CONNECTION_ERROR';
                let errorMsg = `Error conectando a la base de datos: ${err.message}`;
                
                if (err.message.includes('service is not defined')) {
                    errorType = 'SERVICE_UNDEFINED';
                    errorMsg = 'El servicio Firebird no está disponible. Verifica que el servidor Firebird esté en ejecución.';
                } else if (err.message.includes('ECONNREFUSED')) {
                    errorType = 'CONNECTION_REFUSED';
                    errorMsg = `Conexión rechazada en ${config.host}:${config.port}. Verifica que el servidor Firebird esté en ejecución y accesible.`;
                } else if (err.message.includes('ENOENT')) {
                    errorType = 'DATABASE_NOT_FOUND';
                    errorMsg = `No se encuentra la base de datos: ${config.database}. Verifica la ruta y los permisos.`;
                } else if (err.message.includes('password') || err.message.includes('user')) {
                    errorType = 'AUTHENTICATION_ERROR';
                    errorMsg = 'Error de autenticación. Verifica usuario y contraseña.';
                }
                
                logger.error(errorMsg);
                reject(new FirebirdError(errorMsg, errorType, err));
                return;
            }

            logger.info('Conexión establecida correctamente');
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
export const testConnection = async (config = DEFAULT_CONFIG): Promise<void> => {
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
