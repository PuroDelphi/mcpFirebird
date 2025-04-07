// src/prompts/database.ts
import { z } from 'zod';
import { createLogger } from '../utils/logger.js';
import { getTableSchema, listTables, executeQuery } from '../db/index.js';
import { stringifyCompact } from '../utils/jsonHelper.js';
import { PromptDefinition, createAssistantTextMessage, createErrorMessage } from './types.js';

const logger = createLogger('prompts:database');

// --- Definiciones de Prompts de Estructura de Base de Datos --- //

const analyzeTablePrompt: PromptDefinition = {
    name: "analyze-table",
    description: "Analyzes the structure of a specific table and returns its schema.",
    category: "Database Structure",
    inputSchema: z.object({
        tableName: z.string().min(1).describe("Name of the table to analyze")
    }),
    handler: async (params: { tableName: string }) => {
        logger.info(`Executing analyze-table prompt for: ${params.tableName}`);
        try {
            const schema = await getTableSchema(params.tableName);
            const resultText = `Schema for table '${params.tableName}':\n\`\`\`json\n${stringifyCompact(schema)}\n\`\`\``;
            return createAssistantTextMessage(resultText);
        } catch (error: any) {
            logger.error(`Error in analyze-table prompt for ${params.tableName}: ${error.message || error}`);
            return createErrorMessage(error, `analyzing table ${params.tableName}`);
        }
    }
};

const listTablesPrompt: PromptDefinition = {
    name: "list-tables",
    description: "Lists all available tables in the database.",
    category: "Database Structure",
    inputSchema: z.object({}), // No parameters
    handler: async () => {
        logger.info('Executing list-tables prompt');
        try {
            const tables = await listTables();
            const tableListText = `Available tables in the database:\n- ${tables.join('\n- ')}`;
            return createAssistantTextMessage(tableListText);
        } catch (error: any) {
            logger.error(`Error in list-tables prompt: ${error.message || error}`);
            return createErrorMessage(error, "listing tables");
        }
    }
};

const analyzeTableRelationshipsPrompt: PromptDefinition = {
    name: "analyze-table-relationships",
    description: "Analyzes the relationships of a specific table with other tables.",
    category: "Database Structure",
    inputSchema: z.object({
        tableName: z.string().min(1).describe("Name of the table to analyze relationships for")
    }),
    handler: async (params: { tableName: string }) => {
        logger.info(`Executing analyze-table-relationships prompt for: ${params.tableName}`);
        try {
            // Obtener el esquema de la tabla
            const schema = await getTableSchema(params.tableName);

            // Extraer las relaciones de las claves foráneas
            const relationships: {
                foreignKeys: any[];
                referencedBy: Array<{ table: string; references: any[] }>;
            } = {
                foreignKeys: schema.foreignKeys || [],
                referencedBy: [] // Aquí podríamos añadir tablas que referencian a esta tabla
            };

            // Buscar tablas que referencian a esta tabla
            // Esto requiere consultar todas las tablas y verificar sus claves foráneas
            const allTables = await listTables();
            for (const otherTable of allTables) {
                if (otherTable === params.tableName) continue;

                try {
                    const otherSchema = await getTableSchema(otherTable);
                    if (otherSchema.foreignKeys && otherSchema.foreignKeys.length > 0) {
                        // Buscar referencias a nuestra tabla
                        const references = otherSchema.foreignKeys.filter(fk =>
                            fk.references && fk.references.table === params.tableName
                        );

                        if (references.length > 0) {
                            relationships.referencedBy.push({
                                table: otherTable,
                                references: references
                            });
                        }
                    }
                } catch (error) {
                    logger.warn(`Could not check references from table ${otherTable}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }

            const resultText = `Relationships for table '${params.tableName}':\n\`\`\`json\n${stringifyCompact(relationships)}\n\`\`\``;
            return createAssistantTextMessage(resultText);
        } catch (error: any) {
            logger.error(`Error in analyze-table-relationships prompt for ${params.tableName}: ${error.message || error}`);
            return createErrorMessage(error, `analyzing relationships for table ${params.tableName}`);
        }
    }
};

const databaseSchemaOverviewPrompt: PromptDefinition = {
    name: "database-schema-overview",
    description: "Provides an overview of the database schema including tables and their relationships.",
    category: "Database Structure",
    inputSchema: z.object({
        includeSampleData: z.boolean().optional().describe("Whether to include sample data for each table")
    }),
    handler: async (params: { includeSampleData?: boolean }) => {
        logger.info(`Executing database-schema-overview prompt with includeSampleData=${params.includeSampleData}`);
        try {
            // Get all tables
            const tables = await listTables();

            // Build schema information for each table
            const schemaInfo = [];
            for (const table of tables) {
                const schema = await getTableSchema(table);
                schemaInfo.push({ table, schema });

                // Add sample data if requested
                if (params.includeSampleData) {
                    try {
                        const sampleData = await executeQuery(`SELECT FIRST 3 * FROM ${table}`);
                        // Añadir sampleData al objeto schemaInfo
                        schemaInfo[schemaInfo.length - 1] = {
                            ...schemaInfo[schemaInfo.length - 1],
                            sampleData
                        };
                    } catch (error) {
                        logger.warn(`Could not get sample data for table ${table}: ${error instanceof Error ? error.message : String(error)}`);
                        // Añadir mensaje de error al objeto schemaInfo
                        schemaInfo[schemaInfo.length - 1] = {
                            ...schemaInfo[schemaInfo.length - 1],
                            sampleData: "Error retrieving sample data"
                        };
                    }
                }
            }

            const resultText = `Database Schema Overview:\n\`\`\`json\n${stringifyCompact(schemaInfo)}\n\`\`\``;
            return createAssistantTextMessage(resultText);
        } catch (error: any) {
            logger.error(`Error in database-schema-overview prompt: ${error.message || error}`);
            return createErrorMessage(error, "generating database schema overview");
        }
    }
};

// --- Definiciones de Prompts de Análisis de Datos --- //

const analyzeTableDataPrompt: PromptDefinition = {
    name: "analyze-table-data",
    description: "Analyzes the data in a specific table and provides statistics.",
    category: "Data Analysis",
    inputSchema: z.object({
        tableName: z.string().min(1).describe("Name of the table to analyze data for"),
        limit: z.number().optional().describe("Maximum number of rows to analyze")
    }),
    handler: async (params: { tableName: string, limit?: number }) => {
        const limit = params.limit || 1000;
        logger.info(`Executing analyze-table-data prompt for: ${params.tableName} with limit ${limit}`);
        try {
            // Get table schema first
            const schema = await getTableSchema(params.tableName);

            // Build statistics queries based on column types
            const statsQueries = [];

            // Count total rows
            statsQueries.push(`SELECT COUNT(*) as total_rows FROM ${params.tableName}`);

            // For each column, get appropriate statistics based on type
            for (const column of schema.columns) {
                const columnName = column.name;
                const columnType = column.type.toLowerCase();

                // For numeric columns
                if (columnType.includes('int') || columnType.includes('float') || columnType.includes('numeric') || columnType.includes('decimal')) {
                    statsQueries.push(`SELECT
                        MIN(${columnName}) as min_value,
                        MAX(${columnName}) as max_value,
                        AVG(${columnName}) as avg_value,
                        COUNT(${columnName}) as non_null_count
                    FROM ${params.tableName}`);
                }

                // For string columns, get distinct value count
                else if (columnType.includes('char') || columnType.includes('text')) {
                    statsQueries.push(`SELECT
                        COUNT(DISTINCT ${columnName}) as distinct_values,
                        COUNT(${columnName}) as non_null_count
                    FROM ${params.tableName}`);
                }

                // For date columns
                else if (columnType.includes('date') || columnType.includes('time')) {
                    statsQueries.push(`SELECT
                        MIN(${columnName}) as earliest_date,
                        MAX(${columnName}) as latest_date,
                        COUNT(${columnName}) as non_null_count
                    FROM ${params.tableName}`);
                }
            }

            // Execute all statistics queries
            const statsResults = {};
            for (const query of statsQueries) {
                try {
                    const result = await executeQuery(query);
                    // Add to results
                    Object.assign(statsResults, result[0]);
                } catch (error) {
                    logger.warn(`Error executing statistics query: ${query}. Error: ${error instanceof Error ? error.message : String(error)}`);
                }
            }

            // Get sample data
            const sampleData = await executeQuery(`SELECT FIRST ${limit} * FROM ${params.tableName}`);

            const resultText = `Data Analysis for table '${params.tableName}':\n\n**Statistics**:\n\`\`\`json\n${stringifyCompact(statsResults)}\n\`\`\`\n\n**Sample Data** (${Math.min(sampleData.length, limit)} rows):\n\`\`\`json\n${stringifyCompact(sampleData)}\n\`\`\``;
            return createAssistantTextMessage(resultText);
        } catch (error: any) {
            logger.error(`Error in analyze-table-data prompt for ${params.tableName}: ${error.message || error}`);
            return createErrorMessage(error, `analyzing data for table ${params.tableName}`);
        }
    }
};

// Array with all database prompt definitions
const databasePrompts: PromptDefinition[] = [
    // Database Structure prompts
    analyzeTablePrompt,
    listTablesPrompt,
    analyzeTableRelationshipsPrompt,
    databaseSchemaOverviewPrompt,

    // Data Analysis prompts
    analyzeTableDataPrompt
];

// --- Configuration Function --- //

/**
 * Sets up prompts related to database structure
 * and returns a map with their definitions.
 * @returns {Map<string, PromptDefinition>} Map with prompt definitions.
 */
export const setupDatabasePrompts = (): Map<string, PromptDefinition> => {
    const promptsMap = new Map<string, PromptDefinition>();
    databasePrompts.forEach(prompt => {
        promptsMap.set(prompt.name, prompt);
        logger.debug(`Database prompt definition loaded: ${prompt.name}`);
    });
    logger.info(`Defined ${promptsMap.size} database prompts.`);
    return promptsMap;
};
