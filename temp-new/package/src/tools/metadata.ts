// Herramientas para metadatos e información del sistema
import { createLogger } from '../utils/logger.js';
import { stringifyCompact } from '../utils/jsonHelper.js';
import { z } from 'zod'; // Importar zod

const logger = createLogger('tools:metadata');

/**
 * Configura las herramientas de metadatos para el servidor MCP
 * @param {Object} server - Instancia del servidor MCP
 */
export const setupMetadataTools = (server: any) => {
    // Implementar el handler para get-methods
    server.tool(
        "get-methods",
        {},
        async () => {
            logger.info("Obteniendo descripción de herramientas disponibles");

            // Definir las descripciones de las herramientas (antes methods)
            const tools = [
                {
                    name: "ping",
                    description: "Tests connectivity to the Firebird MCP server",
                    parameters: [],
                    returns: "A simple success response indicating the server is available"
                },
                {
                    name: "list-tables",
                    description: "Lists all user tables in the current database",
                    parameters: [],
                    returns: "Array of table objects with table names and URIs"
                },
                {
                    name: "describe-table",
                    description: "Gets detailed schema information for a specific table",
                    parameters: [
                        {
                            name: "tableName",
                            type: "string",
                            description: "Name of the table to describe"
                        }
                    ],
                    returns: "Table schema including columns, data types, primary keys, and foreign keys"
                },
                {
                    name: "get-field-descriptions",
                    description: "Retrieves metadata descriptions for all fields in a table",
                    parameters: [
                        {
                            name: "tableName",
                            type: "string",
                            description: "Name of the table to get field descriptions for"
                        }
                    ],
                    returns: "Array of field description objects with field names and descriptions"
                },
                {
                    name: "execute-query",
                    description: "Executes a custom SQL query on the database. Note that Firebird uses FIRST/ROWS for pagination instead of LIMIT",
                    parameters: [
                        {
                            name: "sql",
                            type: "string", 
                            description: "SQL query to execute. For pagination, use 'SELECT FIRST X ROWS Y * FROM...' instead of LIMIT"
                        },
                        {
                            name: "params",
                            type: "array",
                            description: "Parameters for the SQL query (optional)"
                        }
                    ],
                    returns: "Query results as an array of records"
                },
                {
                    name: "get-methods",
                    description: "Returns a description of all available MCP methods",
                    parameters: [],
                    returns: "Array of method objects with name, description, parameters, and return type"
                }
            ];

            try {
                // Devolver la lista de herramientas bajo la clave 'tools'
                return {
                    content: [{
                        type: 'json',
                        text: stringifyCompact({ success: true, tools }) // <-- Renombrado a 'tools'
                    }]
                };
            } catch (error: any) {
                logger.error(`Error en get-methods: ${error.message}`);
                return {
                    content: [{
                        type: 'json',
                        text: stringifyCompact({ success: false, error: 'Error al obtener la lista de herramientas.', message: error.message })
                    }]
                };
            }
        }
    );

    // Implementar el handler para describe-method
    // (Mantener como describe-method por convención, aunque ahora lista 'tools')
    server.tool(
        "describe-method",
        {
            // Corregir esquema Zod para describe-method
            name: z.string().describe("The name of the method (tool) to describe") 
        },
        async ({ name: methodName }: { name: string }) => {
            logger.info(`Llamada a describe-method para ${methodName}`);
            try {
                // Obtener la lista completa de herramientas (antes methods)
                const allTools = [
                    {
                        name: "ping",
                        description: "Tests connectivity to the Firebird MCP server",
                        parameters: [],
                        returns: "A simple success response indicating the server is available"
                    },
                    {
                        name: "list-tables",
                        description: "Lists all user tables in the current database",
                        parameters: [],
                        returns: "Array of table objects with table names and URIs"
                    },
                    {
                        name: "describe-table",
                        description: "Gets detailed schema information for a specific table",
                        parameters: [
                            {
                                name: "tableName",
                                type: "string",
                                description: "Name of the table to describe"
                            }
                        ],
                        returns: "Table schema including columns, data types, primary keys, and foreign keys"
                    },
                    {
                        name: "get-field-descriptions",
                        description: "Retrieves metadata descriptions for all fields in a table",
                        parameters: [
                            {
                                name: "tableName",
                                type: "string",
                                description: "Name of the table to get field descriptions for"
                            }
                        ],
                        returns: "Array of field description objects with field names and descriptions"
                    },
                    {
                        name: "execute-query",
                        description: "Executes a custom SQL query on the database. Note that Firebird uses FIRST/ROWS for pagination instead of LIMIT",
                        parameters: [
                            {
                                name: "sql",
                                type: "string", 
                                description: "SQL query to execute. For pagination, use 'SELECT FIRST X ROWS Y * FROM...' instead of LIMIT"
                            },
                            {
                                name: "params",
                                type: "array",
                                description: "Parameters for the SQL query (optional)"
                            }
                        ],
                        returns: "Query results as an array of records"
                    },
                    {
                        name: "get-methods",
                        description: "Returns a description of all available MCP methods",
                        parameters: [],
                        returns: "Array of method objects with name, description, parameters, and return type"
                    }
                    // ... Añadir aquí las demás herramientas si es necesario ...
                ];
                
                // Encontrar la herramienta específica por nombre
                const tool = allTools.find(t => t.name === methodName);

                if (!tool) {
                    return {
                        content: [{
                            type: 'json',
                            text: stringifyCompact({ 
                                success: false, 
                                error: `Herramienta (método) '${methodName}' no encontrada.` 
                            })
                        }]
                    };
                }

                return {
                    content: [{
                        type: 'json',
                        // Devolver la descripción de la herramienta encontrada
                        text: stringifyCompact({ 
                            success: true, 
                            toolDescription: tool // <-- Clave renombrada a 'toolDescription'
                        })
                    }]
                };
            } catch (error: any) {
                logger.error(`Error en describe-method: ${error.message}`);
                return {
                    content: [{
                        type: 'json',
                        text: stringifyCompact({ 
                            success: false, 
                            error: 'Error al obtener la descripción de la herramienta (método).', 
                            message: error.message 
                        })
                    }]
                };
            }
        }
    );

    // Herramienta para hacer ping y verificar conectividad
    server.tool(
        "ping",
        {},
        async () => {
            logger.info("Ping recibido");

            return {
                content: [{
                    type: 'json',
                    text: stringifyCompact({ 
                        success: true, 
                        message: "Firebird MCP server is online",
                        timestamp: new Date().toISOString()
                    })
                }]
            };
        }
    );
};
