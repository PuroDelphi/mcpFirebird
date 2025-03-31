// Recursos de base de datos para MCP
import { createLogger } from '../utils/logger.js';
import { validateSql } from '../utils/security.js';
import { getDatabases, getTables, getViews, getProcedures } from '../db/queries.js';
import { getTableSchema } from '../db/schema.js';
import { getFieldDescriptions, executeQuery } from '../db/queries.js';
import { compactJsonStringify } from '../utils/json.js';

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
        { 
            uri: "firebird://databases",
            description: "Lista de bases de datos Firebird disponibles en el servidor"
        },
        async () => {
            logger.info('Accediendo al listado de bases de datos');
            try {
                const databases = getDatabases();
                return {
                    contents: [{
                        uri: "firebird://databases",
                        name: "Bases de datos Firebird",
                        mimeType: "application/json",
                        text: compactJsonStringify({ success: true, databases })
                    }]
                };
            } catch (error) {
                logger.error(`Error al listar bases de datos: ${error}`);
                return {
                    contents: [{
                        uri: "firebird://databases",
                        name: "Error en bases de datos",
                        mimeType: "application/json",
                        text: compactJsonStringify({ success: false, error: "Error al obtener el listado de bases de datos", message: String(error) })
                    }]
                };
            }
        }
    );

    // Recurso para listar tablas
    server.resource(
        "tables",
        { 
            uri: "firebird://tables",
            description: "Lista completa de tablas disponibles en la base de datos Firebird"
        },
        async () => {
            logger.info('Accediendo al listado de tablas');
            try {
                const tables = await getTables();
                return {
                    contents: [{
                        uri: "firebird://tables",
                        name: "Tablas de la base de datos",
                        mimeType: "application/json",
                        text: compactJsonStringify({ success: true, tables })
                    }]
                };
            } catch (error) {
                logger.error(`Error al listar tablas: ${error}`);
                return {
                    contents: [{
                        uri: "firebird://tables",
                        name: "Error en listado de tablas",
                        mimeType: "application/json",
                        text: compactJsonStringify({ success: false, error: "Error al obtener las tablas", message: String(error) })
                    }]
                };
            }
        }
    );

    // Recurso para listar vistas
    server.resource(
        "views",
        { 
            uri: "firebird://views",
            description: "Lista completa de vistas definidas en la base de datos Firebird"
        },
        async () => {
            logger.info('Accediendo al listado de vistas');
            try {
                const views = await getViews();
                return {
                    contents: [{
                        uri: "firebird://views",
                        name: "Vistas de la base de datos",
                        mimeType: "application/json",
                        text: compactJsonStringify({ success: true, views })
                    }]
                };
            } catch (error) {
                logger.error(`Error al listar vistas: ${error}`);
                return {
                    contents: [{
                        uri: "firebird://views",
                        name: "Error en listado de vistas",
                        mimeType: "application/json",
                        text: compactJsonStringify({ success: false, error: "Error al obtener las vistas", message: String(error) })
                    }]
                };
            }
        }
    );

    // Recurso para listar procedimientos
    server.resource(
        "procedures",
        { 
            uri: "firebird://procedures",
            description: "Lista completa de procedimientos almacenados en la base de datos Firebird"
        },
        async () => {
            logger.info('Accediendo al listado de procedimientos');
            try {
                const procedures = await getProcedures();
                return {
                    contents: [{
                        uri: "firebird://procedures",
                        name: "Procedimientos de la base de datos",
                        mimeType: "application/json",
                        text: compactJsonStringify({ success: true, procedures })
                    }]
                };
            } catch (error) {
                logger.error(`Error al listar procedimientos: ${error}`);
                return {
                    contents: [{
                        uri: "firebird://procedures",
                        name: "Error en listado de procedimientos",
                        mimeType: "application/json",
                        text: compactJsonStringify({ success: false, error: "Error al obtener los procedimientos", message: String(error) })
                    }]
                };
            }
        }
    );

    // Recurso de plantilla para descripciones de campos de tabla
    server.resource(
        "field-descriptions-template",
        {
            uriTemplate: "firebird://field-descriptions/{tableName}",
            description: "Descripciones de los campos de una tabla específica en Firebird. Reemplazar {tableName} con el nombre de la tabla deseada."
        },
        async (uri: URL) => {
            // Extraer el nombre de la tabla de la URI
            const pathParts = uri.pathname.split('/');
            const tableName = pathParts[pathParts.length - 1];
            
            logger.info(`Accediendo a descripciones de campos para la tabla ${tableName}`);
            try {
                validateSql({ table: tableName });
                const fieldDescriptions = await getFieldDescriptions(tableName);
                return {
                    contents: [{
                        uri: uri.href,
                        name: `Descripciones de campos de ${tableName}`,
                        mimeType: "application/json",
                        text: compactJsonStringify({ success: true, fieldDescriptions })
                    }]
                };
            } catch (error) {
                logger.error(`Error al obtener descripciones de campos para ${tableName}: ${error}`);
                return {
                    contents: [{
                        uri: uri.href,
                        name: `Error en descripciones de campos de ${tableName}`,
                        mimeType: "application/json",
                        text: compactJsonStringify({ success: false, error: `Error al obtener descripciones de campos para ${tableName}`, message: String(error) })
                    }]
                };
            }
        }
    );
    
    // Recurso de plantilla para esquema de tabla
    server.resource(
        "table-schema-template",
        {
            uriTemplate: "firebird://schema/{tableName}",
            description: "Esquema detallado de una tabla específica en Firebird. Reemplazar {tableName} con el nombre de la tabla deseada."
        },
        async (uri: URL) => {
            // Extraer el nombre de la tabla de la URI
            const pathParts = uri.pathname.split('/');
            const tableName = pathParts[pathParts.length - 1];
            
            logger.info(`Accediendo al esquema de la tabla ${tableName}`);
            try {
                validateSql({ table: tableName });
                const schema = await getTableSchema(tableName);
                return {
                    contents: [{
                        uri: uri.href,
                        name: `Esquema de ${tableName}`,
                        mimeType: "application/json",
                        text: compactJsonStringify({ success: true, schema })
                    }]
                };
            } catch (error) {
                logger.error(`Error al obtener esquema de ${tableName}: ${error}`);
                return {
                    contents: [{
                        uri: uri.href,
                        name: `Error en esquema de ${tableName}`,
                        mimeType: "application/json",
                        text: compactJsonStringify({ success: false, error: `Error al obtener esquema de ${tableName}`, message: String(error) })
                    }]
                };
            }
        }
    );
    
    // Recurso de plantilla para datos de tabla
    server.resource(
        "table-data-template",
        {
            uriTemplate: "firebird://data/{tableName}",
            description: "Datos almacenados en una tabla específica de Firebird. Reemplazar {tableName} con el nombre de la tabla deseada."
        },
        async (uri: URL) => {
            // Extraer el nombre de la tabla de la URI
            const pathParts = uri.pathname.split('/');
            const tableName = pathParts[pathParts.length - 1];
            
            logger.info(`Accediendo a los datos de la tabla ${tableName}`);
            try {
                validateSql({ table: tableName });
                const query = `SELECT FIRST 100 * FROM ${tableName}`;
                const data = await executeQuery(query);
                return {
                    contents: [{
                        uri: uri.href,
                        name: `Datos de ${tableName}`,
                        mimeType: "application/json",
                        text: compactJsonStringify({ success: true, data })
                    }]
                };
            } catch (error) {
                logger.error(`Error al obtener datos de ${tableName}: ${error}`);
                return {
                    contents: [{
                        uri: uri.href,
                        name: `Error en datos de ${tableName}`,
                        mimeType: "application/json",
                        text: compactJsonStringify({ success: false, error: `Error al obtener datos de ${tableName}`, message: String(error) })
                    }]
                };
            }
        }
    );
};
