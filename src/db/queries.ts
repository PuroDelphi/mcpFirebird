// Consultas a la base de datos
import { existsSync, readdirSync } from 'fs';
import { join, extname } from 'path';
import { createLogger } from '../utils/logger.js';
import { validateSql } from '../utils/security.js';
import { connectToDatabase, queryDatabase, DEFAULT_CONFIG } from './connection.js';

const logger = createLogger('db:queries');

// Directorio de bases de datos
export const DATABASE_DIR = process.env.FIREBIRD_DB_DIR || './databases';

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

/**
 * Lista todas las bases de datos Firebird disponibles en el directorio de bases de datos
 * @returns {Array} Array de objetos de base de datos con nombre, ruta y URI
 */
export const getDatabases = () => {
    try {
        if (!existsSync(DATABASE_DIR)) {
            return [];
        }
        return readdirSync(DATABASE_DIR)
            .filter(file => ['.fdb', '.gdb'].includes(extname(file).toLowerCase()))
            .map(file => ({
                name: file,
                path: join(DATABASE_DIR, file),
                uri: `firebird://database/${file}`
            }));
    } catch (error) {
        logger.error(`Error al listar bases de datos: ${error}`);
        return [];
    }
};

/**
 * Obtiene todas las tablas de usuario de la base de datos
 * @param {object} config - Configuración de conexión a la base de datos (opcional)
 * @returns {Array} Array de objetos de tabla con nombre y URI
 */
export const getTables = async (config = DEFAULT_CONFIG) => {
    try {
        const sql = `
            SELECT TRIM(RDB$RELATION_NAME) AS name
            FROM RDB$RELATIONS
            WHERE RDB$SYSTEM_FLAG = 0
            AND RDB$VIEW_SOURCE IS NULL
            ORDER BY RDB$RELATION_NAME
        `;
        const tables = await executeQuery(sql, [], config);
        return tables.map((table: any) => ({
            name: table.NAME,
            uri: `firebird://table/${table.NAME}`
        }));
    } catch (error) {
        logger.error(`Error al listar tablas: ${error}`);
        throw error;
    }
};

/**
 * Obtiene todas las vistas de usuario de la base de datos
 * @param {object} config - Configuración de conexión a la base de datos (opcional)
 * @returns {Array} Array de objetos de vista con nombre y URI
 */
export const getViews = async (config = DEFAULT_CONFIG) => {
    try {
        const sql = `
            SELECT TRIM(RDB$RELATION_NAME) AS name
            FROM RDB$RELATIONS
            WHERE RDB$SYSTEM_FLAG = 0
            AND RDB$VIEW_SOURCE IS NOT NULL
            ORDER BY RDB$RELATION_NAME
        `;
        const views = await executeQuery(sql, [], config);
        return views.map((view: any) => ({
            name: view.NAME,
            uri: `firebird://view/${view.NAME}`
        }));
    } catch (error) {
        logger.error(`Error al listar vistas: ${error}`);
        throw error;
    }
};

/**
 * Obtiene todos los procedimientos almacenados de usuario de la base de datos
 * @param {object} config - Configuración de conexión a la base de datos (opcional)
 * @returns {Array} Array de objetos de procedimiento con nombre y URI
 */
export const getProcedures = async (config = DEFAULT_CONFIG) => {
    try {
        const sql = `
            SELECT TRIM(RDB$PROCEDURE_NAME) AS name
            FROM RDB$PROCEDURES
            WHERE RDB$SYSTEM_FLAG = 0
            ORDER BY RDB$PROCEDURE_NAME
        `;
        const procedures = await executeQuery(sql, [], config);
        return procedures.map((proc: any) => ({
            name: proc.NAME,
            uri: `firebird://procedure/${proc.NAME}`
        }));
    } catch (error) {
        logger.error(`Error al listar procedimientos: ${error}`);
        throw error;
    }
};

/**
 * Obtiene descripciones de campos para una tabla específica
 * @param {string} tableName - Nombre de la tabla
 * @param {object} config - Configuración de conexión a la base de datos (opcional)
 * @returns {Array} Array de objetos que contienen nombres y descripciones de campos
 */
export const getFieldDescriptions = async (tableName: string, config = DEFAULT_CONFIG) => {
    try {
        if (!validateSql(tableName)) {
            throw new Error(`Nombre de tabla inválido: ${tableName}`);
        }

        const sql = `
            SELECT TRIM(f.RDB$FIELD_NAME) AS field_name,
                   TRIM(f.RDB$DESCRIPTION) AS description
            FROM RDB$RELATION_FIELDS f
            JOIN RDB$RELATIONS r ON f.RDB$RELATION_NAME = r.RDB$RELATION_NAME
            WHERE f.RDB$RELATION_NAME = ?
            ORDER BY f.RDB$FIELD_POSITION
        `;

        const fields = await executeQuery(sql, [tableName], config);
        return fields.map((field: any) => ({
            name: field.FIELD_NAME,
            description: field.DESCRIPTION || null
        }));
    } catch (error) {
        logger.error(`Error obteniendo descripciones de campos para ${tableName}: ${error}`);
        throw error;
    }
};
