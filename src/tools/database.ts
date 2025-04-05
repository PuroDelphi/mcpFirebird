// Herramientas para consultas de base de datos
import { z } from 'zod';
import { 
    executeQuery, 
    listTables, 
    describeTable, 
    getFieldDescriptions 
} from '../db/queries.js';
import { validateSql } from '../utils/security.js';
import { createLogger } from '../utils/logger.js';
import { stringifyCompact, wrapSuccess, wrapError } from '../utils/jsonHelper.js';
import { FirebirdError } from '../db/connection.js';

const logger = createLogger('tools:database');

// Definir y exportar esquemas Zod en el nivel superior del módulo
export const ExecuteQueryArgsSchema = z.object({
    sql: z.string().min(1).describe("SQL query to execute (Firebird uses FIRST/ROWS for pagination instead of LIMIT)"),
    params: z.array(z.any()).optional().describe("Parameters for parameterized queries to prevent SQL injection")
});

export const ListTablesArgsSchema = z.object({}); // Sin argumentos

export const DescribeTableArgsSchema = z.object({
    tableName: z.string().min(1).describe("Name of the table to describe")
});

export const GetFieldDescriptionsArgsSchema = z.object({
    tableName: z.string().min(1).describe("Name of the table to get field descriptions for")
});

/**
 * Interfaz para definir una herramienta MCP.
 */
export interface ToolDefinition {
    name: string;
    description: string;
    inputSchema: z.ZodObject<any>;
    handler: (args: any) => Promise<{ content: { type: string; text: string }[] }>;
}

/**
 * Configura y devuelve las definiciones de las herramientas de base de datos.
 * @returns {Map<string, ToolDefinition>} Un mapa con las definiciones de las herramientas.
 */
export const setupDatabaseTools = (): Map<string, ToolDefinition> => {
    const tools = new Map<string, ToolDefinition>();

    tools.set("execute-query", {
        name: "execute-query",
        description: "Ejecuta una consulta SQL en la base de datos Firebird. Usa FIRST/ROWS para paginación.",
        inputSchema: ExecuteQueryArgsSchema,
        handler: async (args: z.infer<typeof ExecuteQueryArgsSchema>) => {
            const { sql, params = [] } = args;
            logger.info(`Ejecutando consulta: ${sql.substring(0, 100)}${sql.length > 100 ? '...' : ''}`);

            try {
                if (typeof sql !== 'string' || !validateSql(sql)) {
                    throw new FirebirdError(
                        `Consulta SQL potencialmente insegura: ${sql.substring(0, 100)}${sql.length > 100 ? '...' : ''}`,
                        'SECURITY_ERROR' 
                    );
                }

                const result = await executeQuery(sql, params);
                logger.info(`Consulta ejecutada correctamente, ${result.length} filas obtenidas`);

                return {
                    content: [{
                        type: "json",
                        text: stringifyCompact(wrapSuccess(result)) 
                    }]
                };
            } catch (error) {
                const errorResponse = wrapError(error);
                logger.error(`Error ejecutando consulta: ${errorResponse.error} [${errorResponse.errorType || 'UNKNOWN'}]`);
                
                return {
                    content: [{
                        type: "json",
                        text: stringifyCompact(errorResponse) 
                    }]
                };
            }
        }
    });

    tools.set("list-tables", {
        name: "list-tables",
        description: "Lista todas las tablas de usuario en la base de datos Firebird actual.",
        inputSchema: ListTablesArgsSchema,
        handler: async () => {
            logger.info("Listando tablas en la base de datos");

            try {
                const tables = await listTables();
                logger.info(`Se encontraron ${tables.length} tablas`);

                return {
                    content: [{
                        type: "json",
                        text: stringifyCompact(wrapSuccess({ tables })) 
                    }]
                };
            } catch (error) {
                const errorResponse = wrapError(error);
                logger.error(`Error listando tablas: ${errorResponse.error} [${errorResponse.errorType || 'UNKNOWN'}]`);

                return {
                    content: [{
                        type: "json",
                        text: stringifyCompact(errorResponse) 
                    }]
                };
            }
        }
    });

    tools.set("describe-table", {
        name: "describe-table",
        description: "Obtiene el esquema detallado (columnas, tipos, etc.) de una tabla específica.",
        inputSchema: DescribeTableArgsSchema,
        handler: async (args: z.infer<typeof DescribeTableArgsSchema>) => {
            const { tableName } = args;
            logger.info(`Describiendo tabla: ${tableName}`);

            try {
                const schema = await describeTable(tableName);
                logger.info(`Esquema obtenido para tabla ${tableName}, ${schema.length} columnas encontradas`);

                return {
                    content: [{
                        type: "json",
                        text: stringifyCompact(wrapSuccess({ schema })) 
                    }]
                };
            } catch (error) {
                const errorResponse = wrapError(error);
                logger.error(`Error describiendo tabla ${tableName}: ${errorResponse.error} [${errorResponse.errorType || 'UNKNOWN'}]`);
                return {
                    content: [{
                        type: "json",
                        text: stringifyCompact(errorResponse) 
                    }]
                };
            }
        }
    });

    tools.set("get-field-descriptions", {
        name: "get-field-descriptions",
        description: "Obtiene las descripciones almacenadas para los campos de una tabla específica (si existen).",
        inputSchema: GetFieldDescriptionsArgsSchema,
        handler: async (args: z.infer<typeof GetFieldDescriptionsArgsSchema>) => {
            const { tableName } = args;
            logger.info(`Obteniendo descripciones de campos para tabla: ${tableName}`);

            try {
                const fieldDescriptions = await getFieldDescriptions(tableName);
                logger.info(`Descripciones obtenidas para ${fieldDescriptions.length} campos en tabla ${tableName}`);

                return {
                    content: [{
                        type: "json",
                        text: stringifyCompact(wrapSuccess({ fieldDescriptions })) 
                    }]
                };
            } catch (error) {
                const errorResponse = wrapError(error);
                logger.error(`Error obteniendo descripciones de campos para tabla ${tableName}: ${errorResponse.error} [${errorResponse.errorType || 'UNKNOWN'}]`);

                return {
                    content: [{
                        type: "json",
                        text: stringifyCompact(errorResponse) 
                    }]
                };
            }
        }
    });

    return tools;
};
