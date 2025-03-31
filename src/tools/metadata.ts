// Herramientas para metadatos e información del sistema
import { createLogger } from '../utils/logger.js';

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
            logger.info("Obteniendo descripción de métodos disponibles");

            // Definir las descripciones de métodos
            const methods = [
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

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({ success: true, methods })
                }]
            };
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
                    type: "text",
                    text: JSON.stringify({ 
                        success: true, 
                        message: "Firebird MCP server is online",
                        timestamp: new Date().toISOString()
                    })
                }]
            };
        }
    );
};
