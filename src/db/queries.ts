// Consultas a la base de datos
import { existsSync, readdirSync } from 'fs';
import { join, extname } from 'path';
import { createLogger } from '../utils/logger.js';
import {
    connectToDatabase,
    queryDatabase,
    DEFAULT_CONFIG,
    FirebirdDatabase,
    ConfigOptions,
    loadConfigFromTempFile
} from './connection.js';
import { FirebirdError } from '../utils/errors.js';
import { validateSql } from '../utils/security.js';

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

export interface QueryPerformanceResult {
    query: string;
    executionTimes: number[];
    averageTime: number;
    minTime: number;
    maxTime: number;
    rowCount: number;
    success: boolean;
    error?: string;
    analysis: string;
}

export interface ExecutionPlanResult {
    query: string;
    plan: string;
    planDetails: any[];
    success: boolean;
    error?: string;
    analysis: string;
}

/**
 * Executes a SQL query and automatically closes the database connection
 * @param {string} sql - SQL query to execute (Firebird uses FIRST/ROWS for pagination instead of LIMIT)
 * @param {any[]} params - Parameters for the SQL query (optional)
 * @param {ConfigOptions} config - Database connection configuration (optional)
 * @returns {Promise<any[]>} Results of the query execution
 * @throws {FirebirdError} If there is a connection or query error
 */
export const executeQuery = async (sql: string, params: any[] = [], config = DEFAULT_CONFIG): Promise<any[]> => {
    // Try to load config from temp file first
    const tempConfig = loadConfigFromTempFile();
    if (tempConfig && tempConfig.database) {
        logger.info(`Using configuration from temporary file for executeQuery: ${tempConfig.database}`);
        config = tempConfig;
    }
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
    // Try to load config from temp file first
    const tempConfig = loadConfigFromTempFile();
    if (tempConfig && tempConfig.database) {
        logger.info(`Using configuration from temporary file for getTables: ${tempConfig.database}`);
        config = tempConfig;
    }
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
    // Try to load config from temp file first
    const tempConfig = loadConfigFromTempFile();
    if (tempConfig && tempConfig.database) {
        logger.info(`Using configuration from temporary file for getViews: ${tempConfig.database}`);
        config = tempConfig;
    }
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
    // Try to load config from temp file first
    const tempConfig = loadConfigFromTempFile();
    if (tempConfig && tempConfig.database) {
        logger.info(`Using configuration from temporary file for getFieldDescriptions: ${tempConfig.database}`);
        config = tempConfig;
    }
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
    // Try to load config from temp file first
    const tempConfig = loadConfigFromTempFile();
    if (tempConfig && tempConfig.database) {
        logger.info(`Using configuration from temporary file for describeTable: ${tempConfig.database}`);
        config = tempConfig;
    }
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

/**
 * Analyzes the performance of a SQL query by executing it multiple times and measuring execution time
 * @param {string} sql - SQL query to analyze
 * @param {any[]} params - Parameters for the SQL query (optional)
 * @param {number} iterations - Number of times to run the query for averaging performance (default: 3)
 * @param {ConfigOptions} config - Database connection configuration (optional)
 * @returns {Promise<QueryPerformanceResult>} Performance analysis results
 * @throws {FirebirdError} If there is a connection or query error
 */
export const analyzeQueryPerformance = async (
    sql: string,
    params: any[] = [],
    iterations: number = 3,
    config = DEFAULT_CONFIG
): Promise<QueryPerformanceResult> => {
    try {
        // Validate the SQL query to prevent injection
        if (!validateSql(sql)) {
            throw new FirebirdError(
                `Invalid SQL query: ${sql}`,
                'VALIDATION_ERROR'
            );
        }

        logger.info(`Analyzing query performance with ${iterations} iterations`);
        logger.debug(`Query: ${sql}`);

        const executionTimes: number[] = [];
        let rowCount = 0;
        let results: any[] = [];

        // Execute the query multiple times and measure performance
        for (let i = 0; i < iterations; i++) {
            const startTime = performance.now();
            results = await executeQuery(sql, params, config);
            const endTime = performance.now();

            const executionTime = endTime - startTime;
            executionTimes.push(executionTime);

            // Only set rowCount on the first iteration
            if (i === 0) {
                rowCount = results.length;
            }

            logger.debug(`Iteration ${i+1}: ${executionTime.toFixed(2)}ms`);
        }

        // Calculate statistics
        const averageTime = executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length;
        const minTime = Math.min(...executionTimes);
        const maxTime = Math.max(...executionTimes);

        // Basic query analysis
        let analysis = "";

        // Check if the query has a WHERE clause
        if (!sql.toLowerCase().includes('where') && rowCount > 100) {
            analysis += "Query doesn't have a WHERE clause and returns many rows. Consider adding filters. ";
        }

        // Check for potential full table scans
        if (sql.toLowerCase().includes('select') && !sql.toLowerCase().includes('index') && rowCount > 1000) {
            analysis += "Query might be performing a full table scan. Consider using indexed columns in the WHERE clause. ";
        }

        // Check for ORDER BY on non-indexed columns (simplified check)
        if (sql.toLowerCase().includes('order by') && rowCount > 500) {
            analysis += "Query includes ORDER BY which might be slow on large datasets if columns aren't indexed. ";
        }

        // Performance assessment
        if (averageTime < 100) {
            analysis += "Performance is good. ";
        } else if (averageTime < 500) {
            analysis += "Performance is acceptable. ";
        } else if (averageTime < 1000) {
            analysis += "Performance could be improved. ";
        } else {
            analysis += "Performance is poor, query optimization is recommended. ";
        }

        const result: QueryPerformanceResult = {
            query: sql,
            executionTimes,
            averageTime,
            minTime,
            maxTime,
            rowCount,
            success: true,
            analysis: analysis.trim()
        };

        logger.info(`Query analysis complete: Avg=${averageTime.toFixed(2)}ms, Rows=${rowCount}`);
        return result;

    } catch (error: any) {
        const errorMessage = `Error analyzing query performance: ${error.message || error}`;
        logger.error(errorMessage);

        return {
            query: sql,
            executionTimes: [],
            averageTime: 0,
            minTime: 0,
            maxTime: 0,
            rowCount: 0,
            success: false,
            error: errorMessage,
            analysis: "Query execution failed."
        };
    }
};

/**
 * Gets the execution plan for a SQL query
 * @param {string} sql - SQL query to analyze
 * @param {any[]} params - Parameters for the SQL query (optional)
 * @param {ConfigOptions} config - Database connection configuration (optional)
 * @returns {Promise<ExecutionPlanResult>} Execution plan analysis results
 * @throws {FirebirdError} If there is a connection or query error
 */
export const getExecutionPlan = async (
    sql: string,
    params: any[] = [],
    config = DEFAULT_CONFIG
): Promise<ExecutionPlanResult> => {
    try {
        // Validate the SQL query to prevent injection
        if (!validateSql(sql)) {
            throw new FirebirdError(
                `Invalid SQL query: ${sql}`,
                'VALIDATION_ERROR'
            );
        }

        logger.info(`Getting execution plan for query: ${sql.substring(0, 100)}${sql.length > 100 ? '...' : ''}`);

        // Prepare the EXPLAIN PLAN query
        const planQuery = `EXPLAIN PLAN ${sql}`;

        // Execute the EXPLAIN PLAN query
        const planResults = await executeQuery(planQuery, params, config);

        // Extract the plan information
        const plan = planResults.map(row => {
            // Convert the row to a string representation
            return Object.entries(row)
                .map(([key, value]) => `${key}: ${value}`)
                .join(', ');
        }).join('\n');

        // Basic analysis of the execution plan
        let analysis = "";

        // Check for full table scans
        const hasFullTableScan = plan.toLowerCase().includes('natural') ||
                               plan.toLowerCase().includes('full scan');
        if (hasFullTableScan) {
            analysis += "The query performs a full table scan which can be slow for large tables. Consider adding appropriate indexes. ";
        }

        // Check for index usage
        const usesIndex = plan.toLowerCase().includes('index');
        if (usesIndex) {
            analysis += "The query uses indexes which is good for performance. ";
        } else {
            analysis += "The query doesn't appear to use any indexes. Consider adding indexes on columns used in WHERE, JOIN, and ORDER BY clauses. ";
        }

        // Check for sorting operations
        const hasSort = plan.toLowerCase().includes('sort');
        if (hasSort) {
            analysis += "The query includes sorting operations which can be expensive. Consider adding indexes that match your ORDER BY clause. ";
        }

        // Check for nested loops
        const hasNestedLoops = plan.toLowerCase().includes('nested') &&
                             plan.toLowerCase().includes('loop');
        if (hasNestedLoops) {
            analysis += "The query uses nested loops which can be inefficient for large datasets. Consider restructuring the query or adding appropriate indexes. ";
        }

        const result: ExecutionPlanResult = {
            query: sql,
            plan: plan,
            planDetails: planResults,
            success: true,
            analysis: analysis.trim() || "No specific recommendations based on the execution plan."
        };

        logger.info(`Execution plan analysis complete for query`);
        return result;

    } catch (error: any) {
        const errorMessage = `Error getting execution plan: ${error.message || error}`;
        logger.error(errorMessage);

        return {
            query: sql,
            plan: "",
            planDetails: [],
            success: false,
            error: errorMessage,
            analysis: "Failed to get execution plan."
        };
    }
};

/**
 * Analyzes a query to identify missing indexes that could improve performance
 * @param {string} sql - SQL query to analyze
 * @param {ConfigOptions} config - Database connection configuration (optional)
 * @returns {Promise<{missingIndexes: string[], recommendations: string[], success: boolean, error?: string}>}
 * Analysis results with recommendations for missing indexes
 * @throws {FirebirdError} If there is a connection or query error
 */
export const analyzeMissingIndexes = async (
    sql: string,
    config = DEFAULT_CONFIG
): Promise<{missingIndexes: string[], recommendations: string[], success: boolean, error?: string}> => {
    try {
        // Validate the SQL query to prevent injection
        if (!validateSql(sql)) {
            throw new FirebirdError(
                `Invalid SQL query: ${sql}`,
                'VALIDATION_ERROR'
            );
        }

        logger.info(`Analyzing missing indexes for query: ${sql.substring(0, 100)}${sql.length > 100 ? '...' : ''}`);

        // Parse the SQL query to extract table and column information
        const tablePattern = /\bFROM\s+([\w\.]+)\b/i;
        const wherePattern = /\bWHERE\s+(.+?)(?:\bGROUP BY\b|\bORDER BY\b|\bHAVING\b|$)/is;
        const joinPattern = /\bJOIN\s+([\w\.]+)\s+(?:\w+\s+)?ON\s+(.+?)(?:\bJOIN\b|\bWHERE\b|\bGROUP BY\b|\bORDER BY\b|\bHAVING\b|$)/gis;
        const orderByPattern = /\bORDER BY\s+(.+?)(?:$|;)/i;

        // Extract the main table
        const tableMatch = sql.match(tablePattern);
        const mainTable = tableMatch ? tableMatch[1].trim() : null;

        // Extract WHERE conditions
        const whereMatch = sql.match(wherePattern);
        const whereConditions = whereMatch ? whereMatch[1].trim() : null;

        // Extract JOIN conditions
        const joinMatches = Array.from(sql.matchAll(joinPattern));
        const joinTables: {table: string, condition: string}[] = joinMatches.map(match => ({
            table: match[1].trim(),
            condition: match[2].trim()
        }));

        // Extract ORDER BY columns
        const orderByMatch = sql.match(orderByPattern);
        const orderByColumns = orderByMatch ? orderByMatch[1].trim() : null;

        // Analyze and generate recommendations
        const missingIndexes: string[] = [];
        const recommendations: string[] = [];

        // Check WHERE conditions for potential indexes
        if (whereConditions && mainTable) {
            const whereColumns = extractColumnsFromCondition(whereConditions);
            if (whereColumns.length > 0) {
                const indexName = `IDX_${mainTable}_${whereColumns.join('_')}`;
                missingIndexes.push(`CREATE INDEX ${indexName} ON ${mainTable} (${whereColumns.join(', ')});`);
                recommendations.push(`Consider creating an index on ${mainTable}(${whereColumns.join(', ')}) to improve WHERE clause filtering.`);
            }
        }

        // Check JOIN conditions for potential indexes
        for (const join of joinTables) {
            const joinColumns = extractColumnsFromCondition(join.condition);
            if (joinColumns.length > 0) {
                const tableColumns = joinColumns.filter(col => col.includes(join.table + '.'));
                if (tableColumns.length > 0) {
                    // Extract just the column names without table prefix
                    const columns = tableColumns.map(col => col.split('.')[1]);
                    const indexName = `IDX_${join.table}_${columns.join('_')}`;
                    missingIndexes.push(`CREATE INDEX ${indexName} ON ${join.table} (${columns.join(', ')});`);
                    recommendations.push(`Consider creating an index on ${join.table}(${columns.join(', ')}) to improve JOIN performance.`);
                }
            }
        }

        // Check ORDER BY for potential indexes
        if (orderByColumns && mainTable) {
            const orderCols = orderByColumns.split(',').map(col => col.trim().split(' ')[0]); // Remove ASC/DESC
            const indexName = `IDX_${mainTable}_ORDER_${orderCols.join('_')}`;
            missingIndexes.push(`CREATE INDEX ${indexName} ON ${mainTable} (${orderCols.join(', ')});`);
            recommendations.push(`Consider creating an index on ${mainTable}(${orderCols.join(', ')}) to improve ORDER BY performance.`);
        }

        logger.info(`Missing index analysis complete, found ${missingIndexes.length} potential missing indexes`);

        return {
            missingIndexes,
            recommendations,
            success: true
        };

    } catch (error: any) {
        const errorMessage = `Error analyzing missing indexes: ${error.message || error}`;
        logger.error(errorMessage);

        return {
            missingIndexes: [],
            recommendations: [],
            success: false,
            error: errorMessage
        };
    }
};

/**
 * Helper function to extract column names from SQL conditions
 * @param {string} condition - SQL condition to parse
 * @returns {string[]} Array of column names
 */
function extractColumnsFromCondition(condition: string): string[] {
    const columns: string[] = [];

    // Match patterns like: column = value, column IN (...), column BETWEEN ... AND ...
    const columnPattern = /([\w\.]+)\s*(?:=|>|<|>=|<=|<>|!=|LIKE|IN|BETWEEN|IS)/gi;
    let match;

    while ((match = columnPattern.exec(condition)) !== null) {
        const column = match[1].trim();
        if (!columns.includes(column)) {
            columns.push(column);
        }
    }

    return columns;
}