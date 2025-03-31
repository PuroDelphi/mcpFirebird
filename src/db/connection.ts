// Base de datos y conexión
import Firebird from 'node-firebird';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('db:connection');

// Opciones predeterminadas para la conexión a la base de datos
export const DEFAULT_CONFIG = {
    host: process.env.FB_HOST || 'localhost',
    port: parseInt(process.env.FB_PORT || '3050', 10),
    database: process.env.FB_DATABASE || '',
    user: process.env.FB_USER || 'SYSDBA',
    password: process.env.FB_PASSWORD || 'masterkey',
    role: process.env.FB_ROLE || undefined,
    pageSize: 4096
};

/**
 * Establece una conexión a la base de datos Firebird
 * @param {object} config - Configuración de conexión
 * @returns {Promise<object>} Objeto de conexión a la base de datos
 */
export const connectToDatabase = (config = DEFAULT_CONFIG): Promise<any> => {
    return new Promise((resolve, reject) => {
        Firebird.attach(config, (err: Error | null, db: any) => {
            if (err) {
                logger.error(`Error conectando a la base de datos: ${err}`);
                reject(err);
                return;
            }
            resolve(db);
        });
    });
};

/**
 * Ejecuta una consulta en la base de datos
 * @param {object} db - Conexión a la base de datos
 * @param {string} sql - Consulta SQL a ejecutar
 * @param {Array} params - Parámetros para la consulta SQL
 * @returns {Promise<Array>} Resultados de la consulta
 */
export const queryDatabase = (db: any, sql: string, params: any[] = []): Promise<any[]> => {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err: Error | null, result: any) => {
            if (err) {
                logger.error(`Error ejecutando consulta: ${err}`);
                reject(err);
                return;
            }
            resolve(result);
        });
    });
};

/**
 * Ejecuta una consulta SQL y cierra automáticamente la conexión a la base de datos
 * @param {string} sql - Consulta SQL a ejecutar (Firebird usa FIRST/ROWS para paginación en lugar de LIMIT)
 * @param {Array} params - Parámetros para la consulta SQL (opcional)
 * @param {object} config - Configuración de conexión a la base de datos (opcional)
 * @returns {Array} Resultados de la ejecución de la consulta
 */
export const executeQuery = async (sql: string, params: any[] = [], config = DEFAULT_CONFIG) => {
    let db: any;
    try {
        db = await connectToDatabase(config);
        const result = await queryDatabase(db, sql, params);
        return result;
    } catch (error) {
        logger.error(`Error ejecutando consulta: ${error}`);
        throw error;
    } finally {
        if (db) {
            db.detach();
        }
    }
};
