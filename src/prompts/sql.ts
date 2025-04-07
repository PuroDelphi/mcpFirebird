// SQL-related prompts
import { z } from 'zod';
import { createLogger } from '../utils/logger.js';
import { executeQuery, getTableSchema, listTables } from '../db/index.js';
import { stringifyCompact } from '../utils/jsonHelper.js';
import { PromptDefinition, createAssistantTextMessage, createErrorMessage } from './types.js';

const logger = createLogger('prompts:sql');

// --- Prompt Definitions --- //

const queryDataPrompt: PromptDefinition = {
    name: "query-data",
    description: "Executes and analyzes a SQL query in Firebird",
    category: "SQL Execution",
    inputSchema: z.object({
        sql: z.string().min(1).describe("SQL query to execute"),
        limit: z.number().optional().describe("Maximum number of rows to return (default: 100)")
    }),
    handler: async ({ sql, limit }: { sql: string, limit?: number }) => {
        const rowLimit = limit || 100;
        logger.info(`Executing query-data prompt with SQL: ${sql} and limit: ${rowLimit}`);
        try {
            // Execute the query - limitamos los resultados en la consulta SQL
            let limitedSql = sql;
            if (sql.trim().toUpperCase().startsWith('SELECT') && !sql.includes('FIRST')) {
                // Añadir FIRST para limitar los resultados
                limitedSql = sql.replace(/SELECT\s+/i, `SELECT FIRST ${rowLimit} `);
            }
            const results = await executeQuery(limitedSql, []);

            // Intentar obtener el plan de ejecución
            // Como no tenemos acceso directo a getQueryPlan, usamos una consulta alternativa
            let plan = "Plan de ejecución no disponible";

            try {
                // Ejecutar una consulta que no devuelve resultados pero muestra el plan
                if (sql.trim().toUpperCase().startsWith('SELECT')) {
                    await executeQuery(`SET PLAN ON`);
                    await executeQuery(`SELECT FIRST 0 * FROM (${sql}) WHERE 0=1`);
                    await executeQuery(`SET PLAN OFF`);
                    plan = "Plan de ejecución solicitado. Consulta el log del servidor para más detalles.";
                }
            } catch (planError) {
                logger.warn(`Error getting execution plan: ${planError instanceof Error ? planError.message : String(planError)}`);
            }

            const resultText = `Query executed successfully. Results:\n\n**Execution Plan**:\n\`\`\`\n${plan}\n\`\`\`\n\n**Results** (${results.length} rows):\n\`\`\`json\n${stringifyCompact(results)}\n\`\`\`\n\nThe query returned ${results.length} rows.`;
            return createAssistantTextMessage(resultText);
        } catch (error) {
            logger.error(`Error executing query: ${error instanceof Error ? error.message : String(error)}`);
            return createErrorMessage(error, "executing SQL query");
        }
    }
};

const optimizeQueryPrompt: PromptDefinition = {
    name: "optimize-query",
    description: "Analyzes and suggests optimizations for a SQL query in Firebird",
    category: "SQL Optimization",
    inputSchema: z.object({
        sql: z.string().min(1).describe("SQL query to optimize")
    }),
    handler: async ({ sql }: { sql: string }) => {
        logger.info(`Executing optimize-query prompt with SQL: ${sql}`);
        try {
            // Intentar obtener el plan de ejecución
            // Como no tenemos acceso directo a getQueryPlan, usamos una consulta alternativa
            let plan = "Plan de ejecución no disponible";

            try {
                // Ejecutar una consulta que no devuelve resultados pero muestra el plan
                if (sql.trim().toUpperCase().startsWith('SELECT')) {
                    await executeQuery(`SET PLAN ON`);
                    await executeQuery(`SELECT FIRST 0 * FROM (${sql}) WHERE 0=1`);
                    await executeQuery(`SET PLAN OFF`);
                    plan = "Plan de ejecución solicitado. Consulta el log del servidor para más detalles.";
                }
            } catch (planError) {
                logger.warn(`Error getting execution plan: ${planError instanceof Error ? planError.message : String(planError)}`);
            }

            // Get tables involved in the query to provide schema information
            const tables = await listTables();
            const tablesInQuery = tables.filter((table: string) => {
                // Simple check for table names in the query
                return sql.toUpperCase().includes(table.toUpperCase());
            });

            // Get schema for each table involved
            const schemasInfo = [];
            for (const table of tablesInQuery) {
                try {
                    const schema = await getTableSchema(table);
                    schemasInfo.push({ table, schema });
                } catch (error) {
                    logger.warn(`Could not get schema for table ${table}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }

            const resultText = `Query Optimization Analysis:\n\n**Original Query**:\n\`\`\`sql\n${sql}\n\`\`\`\n\n**Execution Plan**:\n\`\`\`\n${plan}\n\`\`\`\n\n**Tables Involved**:\n\`\`\`json\n${stringifyCompact(schemasInfo)}\n\`\`\`\n\nBased on the execution plan and schema information, here are potential optimization opportunities for this query.`;
            return createAssistantTextMessage(resultText);
        } catch (error) {
            logger.error(`Error optimizing query: ${error instanceof Error ? error.message : String(error)}`);
            return createErrorMessage(error, "analyzing SQL query for optimization");
        }
    }
};

const generateSqlPrompt: PromptDefinition = {
    name: "generate-sql",
    description: "Generates a SQL query for Firebird based on a description",
    category: "SQL Generation",
    inputSchema: z.object({
        description: z.string().min(1).describe("Description of the query to be generated"),
        includeTables: z.array(z.string()).optional().describe("Specific tables to include in the query")
    }),
    handler: async ({ description, includeTables }: { description: string, includeTables?: string[] }) => {
        logger.info(`Executing generate-sql prompt with description: ${description}`);
        try {
            // Get all tables if specific tables aren't provided
            const tablesToInclude = includeTables || await listTables();

            // Get schema for each table
            const schemasInfo = [];
            for (const table of tablesToInclude) {
                try {
                    const schema = await getTableSchema(table);
                    schemasInfo.push({ table, schema });
                } catch (error) {
                    logger.warn(`Could not get schema for table ${table}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }

            const resultText = `SQL Query Generation Request:\n\n**Description**:\n${description}\n\n**Available Tables and Schemas**:\n\`\`\`json\n${stringifyCompact(schemasInfo)}\n\`\`\`\n\nBased on your description and the available database schema, here is a SQL query that should meet your requirements.`;
            return createAssistantTextMessage(resultText);
        } catch (error) {
            logger.error(`Error generating SQL: ${error instanceof Error ? error.message : String(error)}`);
            return createErrorMessage(error, "generating SQL query");
        }
    }
};

const explainSqlPrompt: PromptDefinition = {
    name: "explain-sql",
    description: "Explains a SQL query in detail, including its execution plan",
    category: "SQL Education",
    inputSchema: z.object({
        sql: z.string().min(1).describe("SQL query to explain")
    }),
    handler: async ({ sql }: { sql: string }) => {
        logger.info(`Executing explain-sql prompt with SQL: ${sql}`);
        try {
            // Intentar obtener el plan de ejecución
            // Como no tenemos acceso directo a getQueryPlan, usamos una consulta alternativa
            let plan = "Plan de ejecución no disponible";

            try {
                // Ejecutar una consulta que no devuelve resultados pero muestra el plan
                if (sql.trim().toUpperCase().startsWith('SELECT')) {
                    await executeQuery(`SET PLAN ON`);
                    await executeQuery(`SELECT FIRST 0 * FROM (${sql}) WHERE 0=1`);
                    await executeQuery(`SET PLAN OFF`);
                    plan = "Plan de ejecución solicitado. Consulta el log del servidor para más detalles.";
                }
            } catch (planError) {
                logger.warn(`Error getting execution plan: ${planError instanceof Error ? planError.message : String(planError)}`);
            }

            // Get tables involved in the query
            const tables = await listTables();
            const tablesInQuery = tables.filter((table: string) => {
                return sql.toUpperCase().includes(table.toUpperCase());
            });

            // Get schema for each table involved
            const schemasInfo = [];
            for (const table of tablesInQuery) {
                try {
                    const schema = await getTableSchema(table);
                    schemasInfo.push({ table, schema });
                } catch (error) {
                    logger.warn(`Could not get schema for table ${table}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }

            const resultText = `SQL Query Explanation:\n\n**Query**:\n\`\`\`sql\n${sql}\n\`\`\`\n\n**Execution Plan**:\n\`\`\`\n${plan}\n\`\`\`\n\n**Tables and Columns Used**:\n\`\`\`json\n${stringifyCompact(schemasInfo)}\n\`\`\`\n\nHere's a detailed explanation of how this query works and what it does.`;
            return createAssistantTextMessage(resultText);
        } catch (error) {
            logger.error(`Error explaining SQL: ${error instanceof Error ? error.message : String(error)}`);
            return createErrorMessage(error, "explaining SQL query");
        }
    }
};

const sqlTutorialPrompt: PromptDefinition = {
    name: "sql-tutorial",
    description: "Provides a tutorial on a specific SQL concept with Firebird examples",
    category: "SQL Education",
    inputSchema: z.object({
        topic: z.string().min(1).describe("SQL topic or concept to explain")
    }),
    handler: async ({ topic }: { topic: string }) => {
        logger.info(`Executing sql-tutorial prompt for topic: ${topic}`);
        try {
            // Get some tables for examples
            const tables = await listTables();
            const sampleTables = tables.slice(0, 3); // Take up to 3 tables for examples

            // Get schema for sample tables
            const schemasInfo = [];
            for (const table of sampleTables) {
                try {
                    const schema = await getTableSchema(table);
                    schemasInfo.push({ table, schema });
                } catch (error) {
                    logger.warn(`Could not get schema for table ${table}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }

            const resultText = `SQL Tutorial: ${topic}\n\n**Sample Database Schema**:\n\`\`\`json\n${stringifyCompact(schemasInfo)}\n\`\`\`\n\nHere's a tutorial on ${topic} with examples specific to Firebird SQL dialect.`;
            return createAssistantTextMessage(resultText);
        } catch (error) {
            logger.error(`Error creating SQL tutorial: ${error instanceof Error ? error.message : String(error)}`);
            return createErrorMessage(error, "creating SQL tutorial");
        }
    }
};

// Array with all SQL prompt definitions
const sqlPrompts: PromptDefinition[] = [
    // SQL Execution
    queryDataPrompt,

    // SQL Optimization
    optimizeQueryPrompt,

    // SQL Generation
    generateSqlPrompt,

    // SQL Education
    explainSqlPrompt,
    sqlTutorialPrompt
];

// --- Configuration Function --- //

/**
 * Sets up SQL-related prompts for the MCP server
 * and returns a map with their definitions.
 * @returns {Map<string, PromptDefinition>} Map with prompt definitions.
 */
export const setupSqlPrompts = (): Map<string, PromptDefinition> => {
    const promptsMap = new Map<string, PromptDefinition>();
    sqlPrompts.forEach(prompt => {
        promptsMap.set(prompt.name, prompt);
        logger.debug(`SQL prompt definition loaded: ${prompt.name}`);
    });
    logger.info(`Defined ${promptsMap.size} SQL prompts.`);
    return promptsMap;
};
