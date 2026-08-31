// src/resources/database.ts
import { createLogger } from '../utils/logger.js';
import { listTables, describeTable, executeQuery } from '../db/queries.js';
import { getTableSchema } from '../db/schema.js';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { checkAllowedTable } from '../security/authorization.js';
import { quoteIdentifier } from '../utils/security.js';

const logger = createLogger('database'); // Provide string argument

/**
 * Interfaz para definir un Recurso MCP.
 */
export interface ResourceDefinition {
    name: string;
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
        name: "database-tables",
        title: "Database Tables",
        description: "Resource representing the list of all tables in the database.",
        handler: async () => {
            logger.info("Accessing the /tables resource");
            try {
                const tables = await listTables();
                return { tables };
            } catch (error: any) {
                logger.error(`Error getting the table list for the /tables resource: ${error.message || error}`);
                return { contents: [], error: "Internal error listing tables" };
            }
        }
    };
    resources.set("firebird://tables", listTablesResource);

    // --- Definición del Recurso: Esquema de Tabla --- (URI: /tables/{tableName}/schema)
    const tableSchemaResource: ResourceDefinition = {
        name: "table-schema",
        title: "Table Schema",
        description: "Resource representing the schema of a specific table.",
        handler: async (params) => {
            const tableName = params.tableName;
            if (!tableName) {
                logger.warn("Attempted to access /tables/{tableName}/schema without tableName");
                return { contents: [], error: "The table name is missing from the URI" };
            }
            logger.info(`Accessing the /tables/${tableName}/schema resource`);
            try {
                checkAllowedTable(tableName);
                const schema = await getTableSchema(tableName);
                return schema;
            } catch (error: any) {
                logger.error(`Error getting the schema for the /tables/${tableName}/schema resource: ${error.message || error}`);
                return { contents: [], error: `Internal error getting schema for ${tableName}` };
            }
        }
    };
    // La clave podría ser la plantilla URI para que el handler en index.ts pueda hacer matching
    resources.set("firebird://tables/{tableName}/schema", tableSchemaResource);

    // --- Definición del Recurso: Descripción de Tabla (describeTable) --- (URI: /tables/{tableName}/description)
    const tableDescriptionResource: ResourceDefinition = {
        name: "table-description",
        title: "Table Description",
        description: "Resource representing the detailed description (columns, types, etc.) of a specific table.",
        handler: async (params) => {
            const tableName = params.tableName;
            if (!tableName) {
                logger.warn("Attempted to access /tables/{tableName}/description without tableName");
                return { contents: [], error: "The table name is missing from the URI" };
            }
            logger.info(`Accessing the /tables/${tableName}/description resource`);
            try {
                checkAllowedTable(tableName);
                // Asumiendo que describeTable devuelve un objeto adecuado
                const description = await describeTable(tableName);
                return description;
            } catch (error: any) {
                logger.error(`Error getting the description for the /tables/${tableName}/description resource: ${error.message || error}`);
                return { contents: [], error: `Internal error getting description for ${tableName}` };
            }
        }
    };
    resources.set("firebird://tables/{tableName}/description", tableDescriptionResource);

    // --- Recurso: Esquema Completo de la Base de Datos --- (URI: /schema)
    const databaseSchemaResource: ResourceDefinition = {
        name: "database-schema",
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
                return { error: "Internal error getting the complete schema" };
            }
        }
    };
    resources.set("firebird://schema", databaseSchemaResource);

    // --- Recurso: Índices de una Tabla --- (URI: /tables/{tableName}/indexes)
    const tableIndexesResource: ResourceDefinition = {
        name: "table-indexes",
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
                checkAllowedTable(tableName);
                const sql = `
                    SELECT
                        RDB$INDEX_NAME AS INDEX_NAME,
                        RDB$RELATION_NAME AS TABLE_NAME,
                        RDB$UNIQUE_FLAG AS IS_UNIQUE,
                        RDB$INDEX_TYPE AS INDEX_TYPE,
                        RDB$SEGMENT_COUNT AS SEGMENT_COUNT
                    FROM RDB$INDICES
                    WHERE RDB$RELATION_NAME = ?
                    AND RDB$SYSTEM_FLAG = 0
                    ORDER BY RDB$INDEX_NAME
                `;
                const indexes = await executeQuery(sql, [tableName.toUpperCase()]);
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
                return { error: `Internal error getting indexes for ${tableName}` };
            }
        }
    };
    resources.set("firebird://tables/{tableName}/indexes", tableIndexesResource);

    // --- Recurso: Constraints de una Tabla --- (URI: /tables/{tableName}/constraints)
    const tableConstraintsResource: ResourceDefinition = {
        name: "table-constraints",
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
                checkAllowedTable(tableName);
                const sql = `
                    SELECT
                        RC.RDB$CONSTRAINT_NAME AS CONSTRAINT_NAME,
                        RC.RDB$CONSTRAINT_TYPE AS CONSTRAINT_TYPE,
                        RC.RDB$RELATION_NAME AS TABLE_NAME,
                        I.RDB$INDEX_NAME AS INDEX_NAME
                    FROM RDB$RELATION_CONSTRAINTS RC
                    LEFT JOIN RDB$INDICES I ON RC.RDB$INDEX_NAME = I.RDB$INDEX_NAME
                    WHERE RC.RDB$RELATION_NAME = ?
                    ORDER BY RC.RDB$CONSTRAINT_NAME
                `;
                const constraints = await executeQuery(sql, [tableName.toUpperCase()]);
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
                return { error: `Internal error getting constraints for ${tableName}` };
            }
        }
    };
    resources.set("firebird://tables/{tableName}/constraints", tableConstraintsResource);

    // --- Recurso: Triggers de una Tabla --- (URI: /tables/{tableName}/triggers)
    const tableTriggersResource: ResourceDefinition = {
        name: "table-triggers",
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
                checkAllowedTable(tableName);
                const sql = `
                    SELECT
                        RDB$TRIGGER_NAME AS TRIGGER_NAME,
                        RDB$RELATION_NAME AS TABLE_NAME,
                        RDB$TRIGGER_TYPE AS TRIGGER_TYPE,
                        RDB$TRIGGER_SEQUENCE AS SEQUENCE,
                        RDB$TRIGGER_INACTIVE AS IS_INACTIVE,
                        RDB$TRIGGER_SOURCE AS SOURCE
                    FROM RDB$TRIGGERS
                    WHERE RDB$RELATION_NAME = ?
                    AND RDB$SYSTEM_FLAG = 0
                    ORDER BY RDB$TRIGGER_NAME
                `;
                const triggers = await executeQuery(sql, [tableName.toUpperCase()]);
                return {
                    tableName,
                    triggers: triggers.map((t: any) => ({
                        name: t.TRIGGER_NAME?.trim(),
                        type: t.TRIGGER_TYPE,
                        sequence: t.SEQUENCE,
                        isActive: t.IS_INACTIVE === 0,
                        source: typeof t.SOURCE === 'string'
                            ? t.SOURCE.trim()
                            : (Buffer.isBuffer(t.SOURCE) ? t.SOURCE.toString('utf8').trim() : '')
                    }))
                };
            } catch (error: any) {
                logger.error(`Error getting triggers for ${tableName}: ${error.message || error}`);
                return { error: `Internal error getting triggers for ${tableName}` };
            }
        }
    };
    resources.set("firebird://tables/{tableName}/triggers", tableTriggersResource);

    // --- Recurso: Estadísticas de la Base de Datos --- (URI: /statistics)
    const databaseStatisticsResource: ResourceDefinition = {
        name: "database-statistics",
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
                            checkAllowedTable(tableName);
                            const countSql = `SELECT COUNT(*) AS TOTAL_ROWS FROM ${quoteIdentifier(tableName)}`;
                            const result = await executeQuery(countSql);
                            return {
                                tableName,
                                rowCount: result[0]?.TOTAL_ROWS || 0
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
                return { error: "Internal error getting statistics" };
            }
        }
    };
    resources.set("firebird://statistics", databaseStatisticsResource);

    // Añadir más recursos aquí...

    logger.info(`Defined ${resources.size} database resources.`);
    return resources;
};

/**
 * Registers database resources with the modern MCP SDK. Static URIs are
 * exposed through resources/list, while parameterized URIs are exposed
 * through resources/templates/list.
 */
export const registerDatabaseResources = (
    server: any,
    resources: Map<string, ResourceDefinition> = setupDatabaseResources()
): number => {
    for (const [uriPattern, resource] of resources.entries()) {
        const uriOrTemplate = uriPattern.includes('{')
            ? new ResourceTemplate(uriPattern, { list: undefined })
            : uriPattern;

        server.registerResource(
            resource.name,
            uriOrTemplate,
            {
                title: resource.title || resource.name,
                description: resource.description,
                mimeType: resource.mimeType || 'application/json'
            },
            async (uri: URL, variables: Record<string, string | string[]> = {}) => {
                const params = Object.fromEntries(
                    Object.entries(variables).map(([key, value]) => [
                        key,
                        Array.isArray(value) ? value[0] : value
                    ])
                );
                const result = await resource.handler(params);

                return {
                    contents: [{
                        uri: uri.href,
                        mimeType: resource.mimeType || 'application/json',
                        text: JSON.stringify(result, null, 2)
                    }]
                };
            }
        );
        logger.info(`Registered database resource: ${uriPattern}`);
    }

    return resources.size;
};
