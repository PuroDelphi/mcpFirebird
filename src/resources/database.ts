// Recursos de base de datos para MCP
import { createLogger } from '../utils/logger.js';
import { validateSql } from '../utils/security.js';
import { getDatabases, getTables, getViews, getProcedures } from '../db/queries.js';
import { getTableSchema } from '../db/schema.js';
import { getFieldDescriptions, executeQuery } from '../db/queries.js';

const logger = createLogger('resources:database');

/**
 * Configura los recursos de base de datos para el servidor MCP
 * @param {Object} server - Instancia del servidor MCP
 * @param {Object} serverModule - Módulo del servidor con definiciones de recursos
 */
export const setupDatabaseResources = (server: any, serverModule: any) => {
    // Recurso para listar bases de datos
    server.resource(
        "databases",
        { uri: "firebird://databases" },
        async () => {
            logger.info('Accediendo al listado de bases de datos');
            try {
                const databases = getDatabases();
                return {
                    contents: [{
                        uri: "firebird://databases",
                        text: JSON.stringify(databases)
                    }]
                };
            } catch (error) {
                logger.error(`Error al listar bases de datos: ${error}`);
                return {
                    contents: [{
                        uri: "firebird://databases",
                        text: JSON.stringify({ error: "Error al obtener el listado de bases de datos", message: String(error) })
                    }]
                };
            }
        }
    );

    // Recurso para listar tablas
    server.resource(
        "tables",
        { uri: "firebird://tables" },
        async () => {
            logger.info('Accediendo al listado de tablas');
            try {
                const tables = await getTables();
                return {
                    contents: [{
                        uri: "firebird://tables",
                        text: JSON.stringify(tables)
                    }]
                };
            } catch (error) {
                logger.error(`Error al listar tablas: ${error}`);
                return {
                    contents: [{
                        uri: "firebird://tables",
                        text: JSON.stringify({ error: "Error al obtener las tablas", message: String(error) })
                    }]
                };
            }
        }
    );

    // Recurso para listar vistas
    server.resource(
        "views",
        { uri: "firebird://views" },
        async () => {
            logger.info('Accediendo al listado de vistas');
            try {
                const views = await getViews();
                return {
                    contents: [{
                        uri: "firebird://views",
                        text: JSON.stringify(views)
                    }]
                };
            } catch (error) {
                logger.error(`Error al listar vistas: ${error}`);
                return {
                    contents: [{
                        uri: "firebird://views",
                        text: JSON.stringify({ error: "Error al obtener las vistas", message: String(error) })
                    }]
                };
            }
        }
    );

    // Recurso para listar procedimientos
    server.resource(
        "procedures",
        { uri: "firebird://procedures" },
        async () => {
            logger.info('Accediendo al listado de procedimientos');
            try {
                const procedures = await getProcedures();
                return {
                    contents: [{
                        uri: "firebird://procedures",
                        text: JSON.stringify(procedures)
                    }]
                };
            } catch (error) {
                logger.error(`Error al listar procedimientos: ${error}`);
                return {
                    contents: [{
                        uri: "firebird://procedures",
                        text: JSON.stringify({ error: "Error al obtener los procedimientos", message: String(error) })
                    }]
                };
            }
        }
    );

    // Recurso para obtener descripciones de campos
    server.resource(
        "field-descriptions",
        new serverModule.ResourceTemplate("firebird://table/{tableName}/field-descriptions", { list: undefined }),
        async (uri: any, { tableName }: { tableName: string }) => {
            logger.info(`Accediendo a las descripciones de campos de la tabla: ${tableName}`);
            try {
                // Validar el nombre de la tabla para prevenir inyección SQL
                if (typeof tableName !== 'string' || !validateSql(tableName)) {
                    throw new Error(`Nombre de tabla inválido: ${tableName}`);
                }

                const fieldDescriptions = await getFieldDescriptions(tableName);
                return {
                    contents: [{
                        uri: uri.href,
                        text: JSON.stringify(fieldDescriptions)
                    }]
                };
            } catch (error) {
                logger.error(`Error al obtener descripciones de campos para ${tableName}: ${error}`);
                return {
                    contents: [{
                        uri: uri.href,
                        text: JSON.stringify({ error: `Error al obtener descripciones de campos para ${tableName}`, message: String(error) })
                    }]
                };
            }
        }
    );

    // Recurso dinámico para obtener el esquema de una tabla específica
    server.resource(
        "table-schema",
        new serverModule.ResourceTemplate("firebird://table/{tableName}/schema", { list: undefined }),
        async (uri: any, { tableName }: { tableName: string }) => {
            logger.info(`Accediendo al esquema de la tabla: ${tableName}`);
            try {
                // Validar el nombre de la tabla para prevenir inyección SQL
                if (typeof tableName !== 'string' || !validateSql(tableName)) {
                    throw new Error(`Nombre de tabla inválido: ${tableName}`);
                }

                const schema = await getTableSchema(tableName);
                return {
                    contents: [{
                        uri: uri.href,
                        text: JSON.stringify(schema)
                    }]
                };
            } catch (error) {
                logger.error(`Error al obtener esquema de tabla ${tableName}: ${error}`);
                return {
                    contents: [{
                        uri: uri.href,
                        text: JSON.stringify({ error: `Error al obtener esquema de ${tableName}`, message: String(error) })
                    }]
                };
            }
        }
    );

    // Recurso para obtener los primeros registros de una tabla
    server.resource(
        "table-data",
        new serverModule.ResourceTemplate("firebird://table/{tableName}/data", { list: undefined }),
        async (uri: any, { tableName }: { tableName: string }) => {
            logger.info(`Accediendo a los datos de la tabla: ${tableName}`);
            try {
                // Validar el nombre de la tabla para prevenir inyección SQL
                if (typeof tableName !== 'string' || !validateSql(tableName)) {
                    throw new Error(`Nombre de tabla inválido: ${tableName}`);
                }

                const sql = `SELECT FIRST 20 * FROM "${tableName}"`;
                const data = await executeQuery(sql);

                return {
                    contents: [{
                        uri: uri.href,
                        text: JSON.stringify(data)
                    }]
                };
            } catch (error) {
                logger.error(`Error al obtener datos de tabla ${tableName}: ${error}`);
                return {
                    contents: [{
                        uri: uri.href,
                        text: JSON.stringify({ error: `Error al obtener datos de ${tableName}`, message: String(error) })
                    }]
                };
            }
        }
    );
};
