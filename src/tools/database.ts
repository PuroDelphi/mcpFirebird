// Herramientas para consultas de base de datos
import { z } from 'zod';
import { createLogger } from '../utils/logger.js';
import { validateSql } from '../utils/security.js';
import { executeQuery, getTables } from '../db/queries.js';
import { getTableSchema } from '../db/schema.js';
import { getFieldDescriptions } from '../db/queries.js';

const logger = createLogger('tools:database');

/**
 * Configura las herramientas de base de datos para el servidor MCP
 * @param {Object} server - Instancia del servidor MCP
 */
export const setupDatabaseTools = (server: any) => {
    // Herramienta para ejecutar consultas personalizadas
    server.tool(
        "execute-query",
        {
            sql: z.string().min(1).describe("SQL query to execute (Firebird uses FIRST/ROWS for pagination instead of LIMIT)"),
            params: z.array(z.any()).optional().describe("Parameters for parameterized queries to prevent SQL injection")
        },
        async ({ sql, params = [] }: { sql: string, params?: any[] }) => {
            logger.info(`Ejecutando consulta: ${sql}`);

            try {
                // Validar la consulta SQL para prevenir inyección SQL
                if (typeof sql !== 'string' || !validateSql(sql)) {
                    throw new Error(`Consulta SQL inválida: ${sql}`);
                }

                const result = await executeQuery(sql, params);

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({ success: true, result })
                    }]
                };
            } catch (error) {
                logger.error(`Error ejecutando consulta: ${error}`);
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            success: false,
                            error: String(error)
                        })
                    }]
                };
            }
        }
    );

    // Herramienta para listar tablas
    server.tool(
        "list-tables",
        {},
        async () => {
            logger.info("Listando tablas");

            try {
                const tables = await getTables();

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({ success: true, tables })
                    }]
                };
            } catch (error) {
                logger.error(`Error listando tablas: ${error}`);
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            success: false,
                            error: String(error)
                        })
                    }]
                };
            }
        }
    );

    // Herramienta para describir una tabla
    server.tool(
        "describe-table",
        {
            tableName: z.string().min(1).describe("Name of the table to get schema information for")
        },
        async ({ tableName }: { tableName: string }) => {
            logger.info(`Describiendo tabla ${tableName}`);

            try {
                // Validar el nombre de la tabla para prevenir inyección SQL
                if (typeof tableName !== 'string' || !validateSql(tableName)) {
                    throw new Error(`Nombre de tabla inválido: ${tableName}`);
                }

                const schema = await getTableSchema(tableName);

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({ success: true, schema })
                    }]
                };
            } catch (error) {
                logger.error(`Error al describir tabla ${tableName}: ${error}`);
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            success: false,
                            error: String(error)
                        })
                    }]
                };
            }
        }
    );

    // Herramienta para obtener descripciones de campos
    server.tool(
        "get-field-descriptions",
        {
            tableName: z.string().min(1).describe("Name of the table to get field descriptions for")
        },
        async ({ tableName }: { tableName: string }) => {
            logger.info(`Obteniendo descripciones de campos para la tabla ${tableName}`);

            try {
                // Validar el nombre de la tabla para prevenir inyección SQL
                if (typeof tableName !== 'string' || !validateSql(tableName)) {
                    throw new Error(`Nombre de tabla inválido: ${tableName}`);
                }

                const fieldDescriptions = await getFieldDescriptions(tableName);

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({ success: true, fieldDescriptions })
                    }]
                };
            } catch (error) {
                logger.error(`Error al obtener descripciones de campos para ${tableName}: ${error}`);
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            success: false,
                            error: String(error)
                        })
                    }]
                };
            }
        }
    );
};
