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
                        text: compactJsonStringify({ databases })
                    }]
                };
            } catch (error) {
                logger.error(`Error al listar bases de datos: ${error}`);
                return {
                    contents: [{
                        uri: "firebird://databases/error",
                        name: "Error en bases de datos",
                        mimeType: "application/json",
                        text: compactJsonStringify({ 
                            error: "Error al obtener el listado de bases de datos", 
                            details: String(error)
                        })
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
                        text: compactJsonStringify({ tables })
                    }]
                };
            } catch (error) {
                logger.error(`Error al listar tablas: ${error}`);
                return {
                    contents: [{
                        uri: "firebird://tables/error",
                        name: "Error en listado de tablas",
                        mimeType: "application/json",
                        text: compactJsonStringify({ 
                            error: "Error al obtener las tablas", 
                            details: String(error)
                        })
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
                        text: compactJsonStringify({ views })
                    }]
                };
            } catch (error) {
                logger.error(`Error al listar vistas: ${error}`);
                return {
                    contents: [{
                        uri: "firebird://views/error",
                        name: "Error en listado de vistas",
                        mimeType: "application/json",
                        text: compactJsonStringify({ 
                            error: "Error al obtener las vistas", 
                            details: String(error)
                        })
                    }]
                };
            }
        }
    );

    // Recurso para listar procedimientos almacenados
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
                        name: "Procedimientos almacenados",
                        mimeType: "application/json",
                        text: compactJsonStringify({ procedures })
                    }]
                };
            } catch (error) {
                logger.error(`Error al listar procedimientos: ${error}`);
                return {
                    contents: [{
                        uri: "firebird://procedures/error",
                        name: "Error en listado de procedimientos",
                        mimeType: "application/json",
                        text: compactJsonStringify({ 
                            error: "Error al obtener los procedimientos", 
                            details: String(error)
                        })
                    }]
                };
            }
        }
    );

    // Recurso para obtener esquema de una tabla
    server.resource(
        "tableSchema",
        { 
            uri: "firebird://schema/:table",
            description: "Obtiene el esquema completo de una tabla específica de la base de datos"
        },
        async (request: any) => {
            const tableName = request.params.table;
            if (!tableName) {
                return {
                    contents: [{
                        uri: "firebird://schema/error",
                        name: "Error en la solicitud",
                        mimeType: "application/json",
                        text: compactJsonStringify({ error: "Nombre de tabla no especificado" })
                    }]
                };
            }

            logger.info(`Obteniendo esquema para la tabla: ${tableName}`);
            try {
                // Validar nombre de tabla para evitar inyección SQL
                validateSql(tableName);
                
                const schema = await getTableSchema(tableName);
                return {
                    contents: [{
                        uri: `firebird://schema/${tableName}`,
                        name: `Esquema de ${tableName}`,
                        mimeType: "application/json",
                        text: compactJsonStringify({ schema })
                    }]
                };
            } catch (error) {
                logger.error(`Error al obtener esquema de ${tableName}: ${error}`);
                return {
                    contents: [{
                        uri: `firebird://schema/error`,
                        name: "Error al obtener esquema",
                        mimeType: "application/json",
                        text: compactJsonStringify({ 
                            error: `Error al obtener el esquema de ${tableName}`, 
                            details: String(error)
                        })
                    }]
                };
            }
        }
    );

    // Recurso para obtener descripciones de campos
    server.resource(
        "fieldDescriptions",
        { 
            uri: "firebird://fields/:table",
            description: "Obtiene descripciones de los campos para una tabla específica"
        },
        async (request: any) => {
            const tableName = request.params.table;
            if (!tableName) {
                return {
                    contents: [{
                        uri: "firebird://fields/error",
                        name: "Error en la solicitud",
                        mimeType: "application/json",
                        text: compactJsonStringify({ error: "Nombre de tabla no especificado" })
                    }]
                };
            }

            logger.info(`Obteniendo descripciones de campos para tabla: ${tableName}`);
            try {
                // Validar nombre de tabla para evitar inyección SQL
                validateSql(tableName);
                
                const descriptions = await getFieldDescriptions(tableName);
                return {
                    contents: [{
                        uri: `firebird://fields/${tableName}`,
                        name: `Descripciones de campos de ${tableName}`,
                        mimeType: "application/json",
                        text: compactJsonStringify({ descriptions })
                    }]
                };
            } catch (error) {
                logger.error(`Error al obtener descripciones de campos para ${tableName}: ${error}`);
                return {
                    contents: [{
                        uri: `firebird://fields/error`,
                        name: "Error al obtener descripciones",
                        mimeType: "application/json",
                        text: compactJsonStringify({ 
                            error: `Error al obtener descripciones de campos para ${tableName}`, 
                            details: String(error)
                        })
                    }]
                };
            }
        }
    );

    // Recurso para ejecutar una consulta SQL
    server.resource(
        "queryResult",
        { 
            uri: "firebird://query",
            description: "Ejecuta una consulta SQL personalizada y devuelve los resultados"
        },
        async (request: any) => {
            const query = request.query.sql;
            const params = request.query.params || [];
            
            if (!query) {
                return {
                    contents: [{
                        uri: "firebird://query/error",
                        name: "Error en la consulta",
                        mimeType: "application/json",
                        text: compactJsonStringify({ error: "Consulta SQL no especificada" })
                    }]
                };
            }

            logger.info(`Ejecutando consulta SQL personalizada: ${query}`);
            try {
                // Validar la consulta SQL para evitar inyección
                validateSql(query);
                
                const results = await executeQuery(query, params);
                return {
                    contents: [{
                        uri: "firebird://query/results",
                        name: "Resultados de la consulta",
                        mimeType: "application/json",
                        text: compactJsonStringify({ results })
                    }]
                };
            } catch (error) {
                logger.error(`Error al ejecutar consulta SQL: ${error}`);
                return {
                    contents: [{
                        uri: "firebird://query/error",
                        name: "Error en la consulta",
                        mimeType: "application/json",
                        text: compactJsonStringify({ 
                            error: "Error al ejecutar la consulta SQL", 
                            details: String(error)
                        })
                    }]
                };
            }
        }
    );
};
