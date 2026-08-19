// src/resources/database.ts
import { createLogger } from '../utils/logger.js';
import { listTables, describeTable, executeQuery } from '../db/queries.js';
import { getTableSchema } from '../db/schema.js';

const logger = createLogger('database'); // Provide string argument

/**
 * Interfaz para definir un Recurso MCP.
 */
export interface ResourceDefinition {
    title?: string; // Título del recurso
    description: string; // Descripción del recurso
    mimeType?: string; // Tipo MIME del contenido
    handler: (params: Record<string, string>) => Promise<object>; // Handler recibe parámetros de la URI
}

/**
 * Configura los recursos relacionados con la base de datos y devuelve un mapa de definiciones.
 * @returns {Map<string, ResourceDefinition>} Mapa con las definiciones de recursos (clave puede ser nombre o URI template).
 */
export const setupDatabaseResources = (): Map<string, ResourceDefinition> => {
    const resources = new Map<string, ResourceDefinition>();

    // --- Definición del Recurso: Lista de Tablas --- (URI: /tables)
    const listTablesResource: ResourceDefinition = {
        description: "Resource representing the list of all tables in the database.",
        handler: async () => {
            logger.info("Accessing the /tables resource");
            try {
                const tables = await listTables();
                return { tables };
            } catch (error: any) {
                logger.error(`Error getting the table list for the /tables resource: ${error.message || error}`);
                return { contents: [], error: "Internal error listing tables", details: error.message || String(error) };
            }
        }
    };
    resources.set("/tables", listTablesResource); // Usar URI como clave

    // --- Definición del Recurso: Esquema de Tabla --- (URI: /tables/{tableName}/schema)
    const tableSchemaResource: ResourceDefinition = {
        description: "Resource representing the schema of a specific table.",
        handler: async (params) => {
            const tableName = params.tableName;
            if (!tableName) {
                logger.warn("Attempted to access /tables/{tableName}/schema without tableName");
                return { contents: [], error: "The table name is missing from the URI" };
            }
            logger.info(`Accessing the /tables/${tableName}/schema resource`);
            try {
                const schema = await getTableSchema(tableName);
                return schema;
            } catch (error: any) {
                logger.error(`Error getting the schema for the /tables/${tableName}/schema resource: ${error.message || error}`);
                return { contents: [], error: `Internal error getting schema for ${tableName}`, details: error.message || String(error) };
            }
        }
    };
    // La clave podría ser la plantilla URI para que el handler en index.ts pueda hacer matching
    resources.set("/tables/{tableName}/schema", tableSchemaResource);

    // --- Definición del Recurso: Descripción de Tabla (describeTable) --- (URI: /tables/{tableName}/description)
    const tableDescriptionResource: ResourceDefinition = {
        description: "Resource representing the detailed description (columns, types, etc.) of a specific table.",
        handler: async (params) => {
            const tableName = params.tableName;
            if (!tableName) {
                logger.warn("Attempted to access /tables/{tableName}/description without tableName");
                return { contents: [], error: "The table name is missing from the URI" };
            }
            logger.info(`Accessing the /tables/${tableName}/description resource`);
            try {
                // Asumiendo que describeTable devuelve un objeto adecuado
                const description = await describeTable(tableName);
                return description;
            } catch (error: any) {
                logger.error(`Error getting the description for the /tables/${tableName}/description resource: ${error.message || error}`);
                return { contents: [], error: `Internal error getting description for ${tableName}`, details: error.message || String(error) };
            }
        }
    };
    resources.set("/tables/{tableName}/description", tableDescriptionResource);

    // --- Recurso: Esquema Completo de la Base de Datos --- (URI: /schema)
    const databaseSchemaResource: ResourceDefinition = {
        title: "Database Schema",
        description: "Resource representing the complete database schema with all tables and their relationships.",
        mimeType: "application/json",
        handler: async () => {
            logger.info("Accessing the /schema resource");
            try {
                const tables = await listTables();
                const schemas = await Promise.all(
                    tables.map(async (tableName: string) => {
                        try {
                            const schema = await getTableSchema(tableName);
                            return { tableName, schema };
                        } catch (error: any) {
                            logger.warn(`Error getting schema for ${tableName}: ${error.message}`);
                            return { tableName, error: error.message };
                        }
                    })
                );
                return {
                    database: "firebird",
                    tables: schemas,
                    totalTables: tables.length
                };
            } catch (error: any) {
                logger.error(`Error getting the complete schema: ${error.message || error}`);
                return { error: "Internal error getting the complete schema", details: error.message || String(error) };
            }
        }
    };
    resources.set("/schema", databaseSchemaResource);

    // --- Recurso: Índices de una Tabla --- (URI: /tables/{tableName}/indexes)
    const tableIndexesResource: ResourceDefinition = {
        title: "Table Indexes",
        description: "Resource representing the indexes of a specific table.",
        mimeType: "application/json",
        handler: async (params) => {
            const tableName = params.tableName;
            if (!tableName) {
                logger.warn("Attempted to access /tables/{tableName}/indexes without tableName");
                return { error: "The table name is missing from the URI" };
            }
            logger.info(`Accessing the /tables/${tableName}/indexes resource`);
            try {
                const sql = `
                    SELECT
                        RDB$INDEX_NAME AS INDEX_NAME,
                        RDB$RELATION_NAME AS TABLE_NAME,
                        RDB$UNIQUE_FLAG AS IS_UNIQUE,
                        RDB$INDEX_TYPE AS INDEX_TYPE,
                        RDB$SEGMENT_COUNT AS SEGMENT_COUNT
                    FROM RDB$INDICES
                    WHERE RDB$RELATION_NAME = '${tableName.toUpperCase()}'
                    AND RDB$SYSTEM_FLAG = 0
                    ORDER BY RDB$INDEX_NAME
                `;
                const indexes = await executeQuery(sql);
                return {
                    tableName,
                    indexes: indexes.map((idx: any) => ({
                        name: idx.INDEX_NAME?.trim(),
                        isUnique: idx.IS_UNIQUE === 1,
                        type: idx.INDEX_TYPE === 0 ? 'ASCENDING' : 'DESCENDING',
                        segmentCount: idx.SEGMENT_COUNT
                    }))
                };
            } catch (error: any) {
                logger.error(`Error getting indexes for ${tableName}: ${error.message || error}`);
                return { error: `Internal error getting indexes for ${tableName}`, details: error.message || String(error) };
            }
        }
    };
    resources.set("/tables/{tableName}/indexes", tableIndexesResource);

    // --- Recurso: Constraints de una Tabla --- (URI: /tables/{tableName}/constraints)
    const tableConstraintsResource: ResourceDefinition = {
        title: "Table Constraints",
        description: "Resource representing the constraints of a specific table.",
        mimeType: "application/json",
        handler: async (params) => {
            const tableName = params.tableName;
            if (!tableName) {
                logger.warn("Attempted to access /tables/{tableName}/constraints without tableName");
                return { error: "The table name is missing from the URI" };
            }
            logger.info(`Accessing the /tables/${tableName}/constraints resource`);
            try {
                const sql = `
                    SELECT
                        RC.RDB$CONSTRAINT_NAME AS CONSTRAINT_NAME,
                        RC.RDB$CONSTRAINT_TYPE AS CONSTRAINT_TYPE,
                        RC.RDB$RELATION_NAME AS TABLE_NAME,
                        I.RDB$INDEX_NAME AS INDEX_NAME
                    FROM RDB$RELATION_CONSTRAINTS RC
                    LEFT JOIN RDB$INDICES I ON RC.RDB$INDEX_NAME = I.RDB$INDEX_NAME
                    WHERE RC.RDB$RELATION_NAME = '${tableName.toUpperCase()}'
                    ORDER BY RC.RDB$CONSTRAINT_NAME
                `;
                const constraints = await executeQuery(sql);
                return {
                    tableName,
                    constraints: constraints.map((c: any) => ({
                        name: c.CONSTRAINT_NAME?.trim(),
                        type: c.CONSTRAINT_TYPE?.trim(),
                        indexName: c.INDEX_NAME?.trim()
                    }))
                };
            } catch (error: any) {
                logger.error(`Error getting constraints for ${tableName}: ${error.message || error}`);
                return { error: `Internal error getting constraints for ${tableName}`, details: error.message || String(error) };
            }
        }
    };
    resources.set("/tables/{tableName}/constraints", tableConstraintsResource);

    // --- Recurso: Triggers de una Tabla --- (URI: /tables/{tableName}/triggers)
    const tableTriggersResource: ResourceDefinition = {
        title: "Table Triggers",
        description: "Resource representing the triggers of a specific table.",
        mimeType: "application/json",
        handler: async (params) => {
            const tableName = params.tableName;
            if (!tableName) {
                logger.warn("Attempted to access /tables/{tableName}/triggers without tableName");
                return { error: "The table name is missing from the URI" };
            }
            logger.info(`Accessing the /tables/${tableName}/triggers resource`);
            try {
                const sql = `
                    SELECT
                        RDB$TRIGGER_NAME AS TRIGGER_NAME,
                        RDB$RELATION_NAME AS TABLE_NAME,
                        RDB$TRIGGER_TYPE AS TRIGGER_TYPE,
                        RDB$TRIGGER_SEQUENCE AS SEQUENCE,
                        RDB$TRIGGER_INACTIVE AS IS_INACTIVE,
                        RDB$TRIGGER_SOURCE AS SOURCE
                    FROM RDB$TRIGGERS
                    WHERE RDB$RELATION_NAME = '${tableName.toUpperCase()}'
                    AND RDB$SYSTEM_FLAG = 0
                    ORDER BY RDB$TRIGGER_NAME
                `;
                const triggers = await executeQuery(sql);
                return {
                    tableName,
                    triggers: triggers.map((t: any) => ({
                        name: t.TRIGGER_NAME?.trim(),
                        type: t.TRIGGER_TYPE,
                        sequence: t.SEQUENCE,
                        isActive: t.IS_INACTIVE === 0,
                        source: (t.SOURCE || '').trim()
                    }))
                };
            } catch (error: any) {
                logger.error(`Error getting triggers for ${tableName}: ${error.message || error}`);
                return { error: `Internal error getting triggers for ${tableName}`, details: error.message || String(error) };
            }
        }
    };
    resources.set("/tables/{tableName}/triggers", tableTriggersResource);

    // --- Recurso: Estadísticas de la Base de Datos --- (URI: /statistics)
    const databaseStatisticsResource: ResourceDefinition = {
        title: "Database Statistics",
        description: "Resource representing general database statistics.",
        mimeType: "application/json",
        handler: async () => {
            logger.info("Accessing the /statistics resource");
            try {
                const tables = await listTables();
                const tableStats = await Promise.all(
                    tables.map(async (tableName: string) => {
                        try {
                            const countSql = `SELECT COUNT(*) as ROW_COUNT FROM "${tableName}"`;
                            const result = await executeQuery(countSql);
                            return {
                                tableName,
                                rowCount: result[0]?.ROW_COUNT || 0
                            };
                        } catch (error: any) {
                            logger.warn(`Error counting rows in ${tableName}: ${error.message}`);
                            return { tableName, rowCount: 0, error: error.message };
                        }
                    })
                );

                const totalRows = tableStats.reduce((sum, stat) => sum + (stat.rowCount || 0), 0);

                return {
                    totalTables: tables.length,
                    totalRows,
                    tables: tableStats
                };
            } catch (error: any) {
                logger.error(`Error getting statistics: ${error.message || error}`);
                return { error: "Internal error getting statistics", details: error.message || String(error) };
            }
        }
    };
    resources.set("/statistics", databaseStatisticsResource);

    // Añadir más recursos aquí...

    logger.info(`Defined ${resources.size} database resources.`);
    return resources;
};
