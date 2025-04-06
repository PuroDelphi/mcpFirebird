// Consultas a la base de datos
import { existsSync, readdirSync } from 'fs';
import { join, extname } from 'path';
import { createLogger } from '../utils/logger.js';
import { validateSql } from '../utils/security.js';
import { 
    connectToDatabase, 
    queryDatabase, 
    DEFAULT_CONFIG,
    FirebirdError,
    FirebirdDatabase,
    ConfigOptions 
} from './connection.js';

const logger = createLogger('db:queries');

// Directorio de bases de datos
export const DATABASE_DIR = process.env.FIREBIRD_DB_DIR || './databases';

/**
 * Interfaces para resultados de consultas
 */
export interface DatabaseInfo {
    name: string;
    path: string;
    uri: string;
}

export interface TableInfo {
    name: string;
    uri: string;
}

export interface FieldInfo {
    name: string;
    description: string | null;
}

export interface ColumnInfo {
    field_name: string;
    field_type: string;
    field_length?: number;
    field_scale?: number;
    nullable: boolean;
    default_value?: string | null;
    primary_key: boolean;
    description?: string | null;
}

/**
 * Ejecuta una consulta SQL y cierra automáticamente la conexión a la base de datos
 * @param {string} sql - Consulta SQL a ejecutar (Firebird usa FIRST/ROWS para paginación en lugar de LIMIT)
 * @param {any[]} params - Parámetros para la consulta SQL (opcional)
 * @param {ConfigOptions} config - Configuración de conexión a la base de datos (opcional)
 * @returns {Promise<any[]>} Resultados de la ejecución de la consulta
 * @throws {FirebirdError} Si hay un error de conexión o de consulta
 */
export const executeQuery = async (sql: string, params: any[] = [], config = DEFAULT_CONFIG): Promise<any[]> => {
    let db: FirebirdDatabase | null = null;
    try {
        // Validar la consulta SQL para prevenir inyección
        if (!validateSql(sql)) {
            throw new FirebirdError(
                `Consulta SQL potencialmente insegura: ${sql.substring(0, 100)}${sql.length > 100 ? '...' : ''}`,
                'SECURITY_ERROR'
            );
        }

        db = await connectToDatabase(config);
        const result = await queryDatabase(db, sql, params);
        return result;
    } catch (error: any) {
        // Propagar el error original si ya es un FirebirdError
        if (error instanceof FirebirdError) {
            throw error;
        }
        
        // Categorizar el error
        const errorMessage = `Error ejecutando consulta: ${error.message || error}`;
        logger.error(errorMessage);
        throw new FirebirdError(errorMessage, 'QUERY_ERROR', error);
    } finally {
        // Cerrar la conexión en un bloque finally para asegurar que siempre se cierre
        if (db) {
            try {
                await new Promise<void>((resolve) => {
                    db?.detach((err) => {
                        if (err) {
                            logger.error(`Error al cerrar la conexión: ${err.message}`);
                        }
                        resolve();
                    });
                });
            } catch (detachError: any) {
                logger.error(`Error al cerrar la conexión: ${detachError.message}`);
            }
        }
    }
};

/**
 * Lista todas las bases de datos Firebird disponibles en el directorio de bases de datos
 * @returns {DatabaseInfo[]} Array de objetos de base de datos con nombre, ruta y URI
 */
export const getDatabases = (): DatabaseInfo[] => {
    try {
        logger.info(`Buscando bases de datos en: ${DATABASE_DIR}`);
        
        if (!existsSync(DATABASE_DIR)) {
            logger.warn(`El directorio de bases de datos no existe: ${DATABASE_DIR}`);
            return [];
        }
        
        const databases = readdirSync(DATABASE_DIR)
            .filter(file => ['.fdb', '.gdb'].includes(extname(file).toLowerCase()))
            .map(file => ({
                name: file,
                path: join(DATABASE_DIR, file),
                uri: `firebird://database/${file}`
            }));
            
        logger.info(`Se encontraron ${databases.length} bases de datos`);
        return databases;
    } catch (error: any) {
        const errorMessage = `Error al listar bases de datos: ${error.message || error}`;
        logger.error(errorMessage);
        return [];
    }
};

/**
 * Obtiene todas las tablas de usuario de la base de datos
 * @param {ConfigOptions} config - Configuración de conexión a la base de datos (opcional)
 * @returns {Promise<TableInfo[]>} Array de objetos de tabla con nombre y URI
 * @throws {FirebirdError} Si hay un error de conexión o de consulta
 */
export const getTables = async (config = DEFAULT_CONFIG): Promise<TableInfo[]> => {
    try {
        logger.info('Obteniendo lista de tablas');
        
        const sql = `
            SELECT TRIM(RDB$RELATION_NAME) AS NAME
            FROM RDB$RELATIONS
            WHERE RDB$SYSTEM_FLAG = 0
            AND RDB$VIEW_SOURCE IS NULL
            ORDER BY RDB$RELATION_NAME
        `;
        
        const tables = await executeQuery(sql, [], config);
        
        const tableInfos = tables.map((table: any) => ({
            name: table.NAME,
            uri: `firebird://table/${table.NAME}`
        }));
        
        logger.info(`Se encontraron ${tableInfos.length} tablas`);
        return tableInfos;
    } catch (error: any) {
        // Propagar el error si ya es un FirebirdError
        if (error instanceof FirebirdError) {
            throw error;
        }
        
        const errorMessage = `Error al listar tablas: ${error.message || error}`;
        logger.error(errorMessage);
        throw new FirebirdError(errorMessage, 'TABLE_LIST_ERROR', error);
    }
};

/**
 * Obtiene todas las vistas de usuario de la base de datos
 * @param {ConfigOptions} config - Configuración de conexión a la base de datos (opcional)
 * @returns {Promise<TableInfo[]>} Array de objetos de vista con nombre y URI
 * @throws {FirebirdError} Si hay un error de conexión o de consulta
 */
export const getViews = async (config = DEFAULT_CONFIG): Promise<TableInfo[]> => {
    try {
        logger.info('Obteniendo lista de vistas');
        
        const sql = `
            SELECT TRIM(RDB$RELATION_NAME) AS NAME
            FROM RDB$RELATIONS
            WHERE RDB$SYSTEM_FLAG = 0
            AND RDB$VIEW_SOURCE IS NOT NULL
            ORDER BY RDB$RELATION_NAME
        `;
        
        const views = await executeQuery(sql, [], config);
        
        const viewInfos = views.map((view: any) => ({
            name: view.NAME,
            uri: `firebird://view/${view.NAME}`
        }));
        
        logger.info(`Se encontraron ${viewInfos.length} vistas`);
        return viewInfos;
    } catch (error: any) {
        // Propagar el error si ya es un FirebirdError
        if (error instanceof FirebirdError) {
            throw error;
        }
        
        const errorMessage = `Error al listar vistas: ${error.message || error}`;
        logger.error(errorMessage);
        throw new FirebirdError(errorMessage, 'VIEW_LIST_ERROR', error);
    }
};

/**
 * Obtiene todos los procedimientos almacenados de usuario de la base de datos
 * @param {ConfigOptions} config - Configuración de conexión a la base de datos (opcional)
 * @returns {Promise<TableInfo[]>} Array de objetos de procedimiento con nombre y URI
 * @throws {FirebirdError} Si hay un error de conexión o de consulta
 */
export const getProcedures = async (config = DEFAULT_CONFIG): Promise<TableInfo[]> => {
    try {
        logger.info('Obteniendo lista de procedimientos almacenados');
        
        const sql = `
            SELECT TRIM(RDB$PROCEDURE_NAME) AS NAME
            FROM RDB$PROCEDURES
            WHERE RDB$SYSTEM_FLAG = 0
            ORDER BY RDB$PROCEDURE_NAME
        `;
        
        const procedures = await executeQuery(sql, [], config);
        
        const procedureInfos = procedures.map((proc: any) => ({
            name: proc.NAME,
            uri: `firebird://procedure/${proc.NAME}`
        }));
        
        logger.info(`Se encontraron ${procedureInfos.length} procedimientos almacenados`);
        return procedureInfos;
    } catch (error: any) {
        // Propagar el error si ya es un FirebirdError
        if (error instanceof FirebirdError) {
            throw error;
        }
        
        const errorMessage = `Error al listar procedimientos: ${error.message || error}`;
        logger.error(errorMessage);
        throw new FirebirdError(errorMessage, 'PROCEDURE_LIST_ERROR', error);
    }
};

/**
 * Obtiene descripciones de campos para una tabla específica
 * @param {string} tableName - Nombre de la tabla
 * @param {ConfigOptions} config - Configuración de conexión a la base de datos (opcional)
 * @returns {Promise<FieldInfo[]>} Array de objetos que contienen nombres y descripciones de campos
 * @throws {FirebirdError} Si hay un error de conexión, de consulta o el nombre de tabla es inválido
 */
export const getFieldDescriptions = async (tableName: string, config = DEFAULT_CONFIG): Promise<FieldInfo[]> => {
    try {
        logger.info(`Obteniendo descripciones de campos para la tabla: ${tableName}`);
        
        if (!validateSql(tableName)) {
            throw new FirebirdError(
                `Nombre de tabla inválido: ${tableName}`,
                'VALIDATION_ERROR'
            );
        }

        const sql = `
            SELECT TRIM(f.RDB$FIELD_NAME) AS FIELD_NAME,
                   TRIM(f.RDB$DESCRIPTION) AS DESCRIPTION
            FROM RDB$RELATION_FIELDS f
            JOIN RDB$RELATIONS r ON f.RDB$RELATION_NAME = r.RDB$RELATION_NAME
            WHERE f.RDB$RELATION_NAME = ?
            ORDER BY f.RDB$FIELD_POSITION
        `;

        const fields = await executeQuery(sql, [tableName], config);
        
        if (fields.length === 0) {
            logger.warn(`No se encontraron campos para la tabla: ${tableName}`);
        } else {
            logger.info(`Se encontraron ${fields.length} campos para la tabla: ${tableName}`);
        }
        
        return fields.map((field: any) => ({
            name: field.FIELD_NAME,
            description: field.DESCRIPTION || null
        }));
    } catch (error: any) {
        // Propagar el error si ya es un FirebirdError
        if (error instanceof FirebirdError) {
            throw error;
        }
        
        const errorMessage = `Error obteniendo descripciones de campos para ${tableName}: ${error.message || error}`;
        logger.error(errorMessage);
        throw new FirebirdError(errorMessage, 'FIELD_DESCRIPTION_ERROR', error);
    }
};

/**
 * Obtiene la estructura detallada de una tabla específica
 * @param {string} tableName - Nombre de la tabla
 * @param {ConfigOptions} config - Configuración de conexión a la base de datos (opcional)
 * @returns {Promise<ColumnInfo[]>} Array de objetos con información detallada de cada columna
 * @throws {FirebirdError} Si hay un error de conexión, de consulta o el nombre de tabla es inválido
 */
export const describeTable = async (tableName: string, config = DEFAULT_CONFIG): Promise<ColumnInfo[]> => {
    try {
        logger.info(`Obteniendo estructura de la tabla: ${tableName}`);
        
        if (!validateSql(tableName)) {
            throw new FirebirdError(
                `Nombre de tabla inválido: ${tableName}`,
                'VALIDATION_ERROR'
            );
        }

        // Consulta para obtener información de las columnas
        const sql = `
            SELECT
                TRIM(rf.RDB$FIELD_NAME) as FIELD_NAME,
                CASE f.RDB$FIELD_TYPE
                    WHEN 7 THEN 'SMALLINT'
                    WHEN 8 THEN 'INTEGER'
                    WHEN 10 THEN 'FLOAT'
                    WHEN 12 THEN 'DATE'
                    WHEN 13 THEN 'TIME'
                    WHEN 14 THEN 'CHAR'
                    WHEN 16 THEN 'BIGINT'
                    WHEN 27 THEN 'DOUBLE PRECISION'
                    WHEN 35 THEN 'TIMESTAMP'
                    WHEN 37 THEN 'VARCHAR'
                    WHEN 261 THEN 'BLOB'
                    ELSE 'UNKNOWN'
                END as FIELD_TYPE,
                f.RDB$FIELD_LENGTH as FIELD_LENGTH,
                f.RDB$FIELD_SCALE as FIELD_SCALE,
                CASE rf.RDB$NULL_FLAG
                    WHEN 1 THEN 0
                    ELSE 1
                END as NULLABLE,
                rf.RDB$DEFAULT_SOURCE as DEFAULT_VALUE,
                CASE 
                    WHEN EXISTS (
                        SELECT 1 FROM RDB$RELATION_CONSTRAINTS rc
                        JOIN RDB$INDEX_SEGMENTS isg ON rc.RDB$INDEX_NAME = isg.RDB$INDEX_NAME
                        WHERE rc.RDB$RELATION_NAME = rf.RDB$RELATION_NAME
                        AND rc.RDB$CONSTRAINT_TYPE = 'PRIMARY KEY'
                        AND isg.RDB$FIELD_NAME = rf.RDB$FIELD_NAME
                    ) THEN 1
                    ELSE 0
                END as PRIMARY_KEY,
                TRIM(rf.RDB$DESCRIPTION) as DESCRIPTION
            FROM RDB$RELATION_FIELDS rf
            JOIN RDB$FIELDS f ON rf.RDB$FIELD_SOURCE = f.RDB$FIELD_NAME
            WHERE rf.RDB$RELATION_NAME = ?
            ORDER BY rf.RDB$FIELD_POSITION
        `;

        const columns = await executeQuery(sql, [tableName], config);
        
        if (columns.length === 0) {
            logger.warn(`No se encontraron columnas para la tabla: ${tableName}`);
            throw new FirebirdError(
                `No se encontraron columnas para la tabla: ${tableName}. Es posible que la tabla no exista.`,
                'TABLE_NOT_FOUND'
            );
        }
        
        logger.info(`Se encontraron ${columns.length} columnas para la tabla: ${tableName}`);
        
        return columns.map((col: any) => ({
            field_name: col.FIELD_NAME,
            field_type: col.FIELD_TYPE,
            field_length: col.FIELD_LENGTH,
            field_scale: col.FIELD_SCALE !== null ? -1 * col.FIELD_SCALE : undefined,
            nullable: Boolean(col.NULLABLE),
            default_value: col.DEFAULT_VALUE,
            primary_key: Boolean(col.PRIMARY_KEY),
            description: col.DESCRIPTION || null
        }));
    } catch (error: any) {
        // Propagar el error si ya es un FirebirdError
        if (error instanceof FirebirdError) {
            throw error;
        }
        
        const errorMessage = `Error describiendo la tabla ${tableName}: ${error.message || error}`;
        logger.error(errorMessage);
        throw new FirebirdError(errorMessage, 'TABLE_DESCRIBE_ERROR', error);
    }
};

/**
 * Obtiene una lista de todas las tablas en la base de datos
 * @param {ConfigOptions} config - Configuración de conexión a la base de datos (opcional)
 * @returns {Promise<string[]>} Array de nombres de tablas
 * @throws {FirebirdError} Si hay un error de conexión o de consulta
 */
export const listTables = async (config = DEFAULT_CONFIG): Promise<string[]> => {
    try {
        logger.info('Obteniendo lista de tablas de usuario');
        
        const sql = `
            SELECT RDB$RELATION_NAME
            FROM RDB$RELATIONS
            WHERE RDB$SYSTEM_FLAG = 0
            AND RDB$VIEW_SOURCE IS NULL
            ORDER BY RDB$RELATION_NAME
        `;
        
        const tables = await executeQuery(sql, [], config);
        
        // Firebird puede devolver nombres con espacios al final, así que hacemos trim
        const tableNames = tables.map((table: any) => table.RDB$RELATION_NAME.trim());
        
        logger.info(`Se encontraron ${tableNames.length} tablas de usuario`);
        return tableNames;
    } catch (error: any) {
        // Propagar el error si ya es un FirebirdError
        if (error instanceof FirebirdError) {
            throw error;
        }
        
        const errorMessage = `Error al listar tablas: ${error.message || error}`;
        logger.error(errorMessage);
        throw new FirebirdError(errorMessage, 'TABLE_LIST_ERROR', error);
    }
};
