// Herramientas para consultas de base de datos
import { z } from 'zod';
import {
    executeQuery,
    listTables,
    describeTable,
    getFieldDescriptions,
    analyzeQueryPerformance,
    getExecutionPlan,
    analyzeMissingIndexes
} from '../db/index.js';

import {
    backupDatabase,
    restoreDatabase,
    validateDatabase,
    BackupOptions,
    RestoreOptions,
    ValidateOptions
} from '../db/index.js';
import { validateSql } from '../utils/security.js';
import { createLogger } from '../utils/logger.js';
import { stringifyCompact, wrapSuccess, wrapError, formatForClaude } from '../utils/jsonHelper.js';
import { FirebirdError } from '../utils/errors.js';

const logger = createLogger('tools:database');

// Define and export Zod schemas at the module's top level
export const ExecuteQueryArgsSchema = z.object({
    sql: z.string().min(1).describe("SQL query to execute (Firebird uses FIRST/ROWS for pagination instead of LIMIT)"),
    params: z.array(z.any()).optional().describe("Parameters for parameterized queries to prevent SQL injection")
});

export const AnalyzeQueryPerformanceArgsSchema = z.object({
    sql: z.string().min(1).describe("SQL query to analyze"),
    params: z.array(z.any()).optional().describe("Parameters for parameterized queries"),
    iterations: z.number().int().positive().default(3).describe("Number of times to run the query for averaging performance")
});

export const GetExecutionPlanArgsSchema = z.object({
    sql: z.string().min(1).describe("SQL query to analyze"),
    params: z.array(z.any()).optional().describe("Parameters for parameterized queries")
});

export const AnalyzeMissingIndexesArgsSchema = z.object({
    sql: z.string().min(1).describe("SQL query to analyze for missing indexes")
});

export const BackupDatabaseArgsSchema = z.object({
    backupPath: z.string().min(1).describe("Path where the backup file will be saved"),
    options: z.object({
        format: z.enum(['gbak', 'nbackup']).default('gbak').describe("Backup format: gbak (full backup) or nbackup (incremental)"),
        compress: z.boolean().default(false).describe("Whether to compress the backup"),
        metadata_only: z.boolean().default(false).describe("Whether to backup only metadata (no data)"),
        verbose: z.boolean().default(false).describe("Whether to show detailed progress")
    }).optional()
});

export const RestoreDatabaseArgsSchema = z.object({
    backupPath: z.string().min(1).describe("Path to the backup file"),
    targetPath: z.string().min(1).describe("Path where the database will be restored"),
    options: z.object({
        replace: z.boolean().default(false).describe("Whether to replace the target database if it exists"),
        pageSize: z.number().int().min(1024).max(16384).default(4096).describe("Page size for the restored database"),
        verbose: z.boolean().default(false).describe("Whether to show detailed progress")
    }).optional()
});

export const ValidateDatabaseArgsSchema = z.object({
    options: z.object({
        checkData: z.boolean().default(true).describe("Whether to validate data integrity"),
        checkIndexes: z.boolean().default(true).describe("Whether to validate indexes"),
        fixErrors: z.boolean().default(false).describe("Whether to attempt to fix errors"),
        verbose: z.boolean().default(false).describe("Whether to show detailed progress")
    }).optional()
});

export const ListTablesArgsSchema = z.object({}); // No arguments

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
 * Sets up and returns the database tool definitions.
 * @returns {Map<string, ToolDefinition>} A map with the tool definitions.
 */
export const setupDatabaseTools = (): Map<string, ToolDefinition> => {
    const tools = new Map<string, ToolDefinition>();

    tools.set("execute-query", {
        name: "execute-query",
        description: "Executes a SQL query in the Firebird database. Uses FIRST/ROWS for pagination.",
        inputSchema: ExecuteQueryArgsSchema,
        handler: async (args: z.infer<typeof ExecuteQueryArgsSchema>) => {
            const { sql, params = [] } = args;
            logger.info(`Executing query: ${sql.substring(0, 100)}${sql.length > 100 ? '...' : ''}`);

            try {
                if (typeof sql !== 'string' || !validateSql(sql)) {
                    throw new FirebirdError(
                        `Potentially unsafe SQL query: ${sql.substring(0, 100)}${sql.length > 100 ? '...' : ''}`,
                        'SECURITY_ERROR'
                    );
                }

                const result = await executeQuery(sql, params);
                logger.info(`Query executed successfully, ${result.length} rows returned`);

                return {
                    content: [{
                        type: "text",
                        text: formatForClaude(result)
                    }]
                };
            } catch (error) {
                const errorResponse = wrapError(error);
                logger.error(`Error ejecutando consulta: ${errorResponse.error} [${errorResponse.errorType || 'UNKNOWN'}]`);

                return {
                    content: [{
                        type: "text",
                        text: formatForClaude(errorResponse)
                    }]
                };
            }
        }
    });

    tools.set("list-tables", {
        name: "list-tables",
        description: "Lists all user tables in the current Firebird database.",
        inputSchema: ListTablesArgsSchema,
        handler: async () => {
            logger.info("Listing tables in the database");

            try {
                const tables = await listTables();
                logger.info(`Found ${tables.length} tables`);

                return {
                    content: [{
                        type: "text",
                        text: formatForClaude({ tables })
                    }]
                };
            } catch (error) {
                const errorResponse = wrapError(error);
                logger.error(`Error listando tablas: ${errorResponse.error} [${errorResponse.errorType || 'UNKNOWN'}]`);

                return {
                    content: [{
                        type: "text",
                        text: formatForClaude(errorResponse)
                    }]
                };
            }
        }
    });

    tools.set("describe-table", {
        name: "describe-table",
        description: "Gets the detailed schema (columns, types, etc.) of a specific table.",
        inputSchema: DescribeTableArgsSchema,
        handler: async (args: z.infer<typeof DescribeTableArgsSchema>) => {
            const { tableName } = args;
            logger.info(`Describing table: ${tableName}`);

            try {
                const schema = await describeTable(tableName);
                logger.info(`Schema obtained for table ${tableName}, ${schema.length} columns found`);

                return {
                    content: [{
                        type: "text",
                        text: formatForClaude({ schema })
                    }]
                };
            } catch (error) {
                const errorResponse = wrapError(error);
                logger.error(`Error describiendo tabla ${tableName}: ${errorResponse.error} [${errorResponse.errorType || 'UNKNOWN'}]`);
                return {
                    content: [{
                        type: "text",
                        text: formatForClaude(errorResponse)
                    }]
                };
            }
        }
    });

    tools.set("get-field-descriptions", {
        name: "get-field-descriptions",
        description: "Gets the stored descriptions for fields of a specific table (if they exist).",
        inputSchema: GetFieldDescriptionsArgsSchema,
        handler: async (args: z.infer<typeof GetFieldDescriptionsArgsSchema>) => {
            const { tableName } = args;
            logger.info(`Getting field descriptions for table: ${tableName}`);

            try {
                const fieldDescriptions = await getFieldDescriptions(tableName);
                logger.info(`Descriptions obtained for ${fieldDescriptions.length} fields in table ${tableName}`);

                return {
                    content: [{
                        type: "text",
                        text: formatForClaude({ fieldDescriptions })
                    }]
                };
            } catch (error) {
                const errorResponse = wrapError(error);
                logger.error(`Error getting field descriptions for table ${tableName}: ${errorResponse.error} [${errorResponse.errorType || 'UNKNOWN'}]`);

                return {
                    content: [{
                        type: "text",
                        text: formatForClaude(errorResponse)
                    }]
                };
            }
        }
    });

    // Add analyze-query-performance tool
    tools.set("analyze-query-performance", {
        name: "analyze-query-performance",
        description: "Analyzes the performance of a SQL query by executing it multiple times and measuring execution time",
        inputSchema: AnalyzeQueryPerformanceArgsSchema,
        handler: async (request) => {
            const { sql, params, iterations } = request;
            logger.info(`Executing analyze-query-performance tool for query: ${sql.substring(0, 50)}...`);

            try {
                const result = await analyzeQueryPerformance(
                    sql,
                    params || [],
                    iterations || 3
                );

                return {
                    content: [{
                        type: "text",
                        text: formatForClaude(result)
                    }]
                };
            } catch (error) {
                const errorResponse = wrapError(error);
                logger.error(`Error analyzing query performance: ${errorResponse.error} [${errorResponse.errorType || 'UNKNOWN'}]`);

                return {
                    content: [{
                        type: "text",
                        text: formatForClaude(errorResponse)
                    }]
                };
            }
        }
    });

    // Add get-execution-plan tool
    tools.set("get-execution-plan", {
        name: "get-execution-plan",
        description: "Gets the execution plan for a SQL query to understand how the database will execute it",
        inputSchema: GetExecutionPlanArgsSchema,
        handler: async (request) => {
            const { sql, params } = request;
            logger.info(`Executing get-execution-plan tool for query: ${sql.substring(0, 50)}...`);

            try {
                const result = await getExecutionPlan(sql, params || []);

                return {
                    content: [{
                        type: "text",
                        text: formatForClaude(result)
                    }]
                };
            } catch (error) {
                const errorResponse = wrapError(error);
                logger.error(`Error getting execution plan: ${errorResponse.error} [${errorResponse.errorType || 'UNKNOWN'}]`);

                return {
                    content: [{
                        type: "text",
                        text: stringifyCompact(errorResponse)
                    }]
                };
            }
        }
    });

    // Add analyze-missing-indexes tool
    tools.set("analyze-missing-indexes", {
        name: "analyze-missing-indexes",
        description: "Analyzes a SQL query to identify missing indexes that could improve performance",
        inputSchema: AnalyzeMissingIndexesArgsSchema,
        handler: async (request) => {
            const { sql } = request;
            logger.info(`Executing analyze-missing-indexes tool for query: ${sql.substring(0, 50)}...`);

            try {
                const result = await analyzeMissingIndexes(sql);

                return {
                    content: [{
                        type: "text",
                        text: formatForClaude(result)
                    }]
                };
            } catch (error) {
                const errorResponse = wrapError(error);
                logger.error(`Error analyzing missing indexes: ${errorResponse.error} [${errorResponse.errorType || 'UNKNOWN'}]`);

                return {
                    content: [{
                        type: "text",
                        text: formatForClaude(errorResponse)
                    }]
                };
            }
        }
    });

    // Add backup-database tool
    tools.set("backup-database", {
        name: "backup-database",
        description: "Creates a backup of the Firebird database",
        inputSchema: BackupDatabaseArgsSchema,
        handler: async (request) => {
            const { backupPath, options } = request;
            logger.info(`Executing backup-database tool to: ${backupPath}`);

            try {
                const result = await backupDatabase(backupPath, options);

                return {
                    content: [{
                        type: "text",
                        text: formatForClaude(result)
                    }]
                };
            } catch (error) {
                const errorResponse = wrapError(error);
                logger.error(`Error backing up database: ${errorResponse.error} [${errorResponse.errorType || 'UNKNOWN'}]`);

                return {
                    content: [{
                        type: "text",
                        text: formatForClaude(errorResponse)
                    }]
                };
            }
        }
    });

    // Add restore-database tool
    tools.set("restore-database", {
        name: "restore-database",
        description: "Restores a Firebird database from a backup",
        inputSchema: RestoreDatabaseArgsSchema,
        handler: async (request) => {
            const { backupPath, targetPath, options } = request;
            logger.info(`Executing restore-database tool from: ${backupPath} to: ${targetPath}`);

            try {
                const result = await restoreDatabase(backupPath, targetPath, options);

                return {
                    content: [{
                        type: "text",
                        text: formatForClaude(result)
                    }]
                };
            } catch (error) {
                const errorResponse = wrapError(error);
                logger.error(`Error restoring database: ${errorResponse.error} [${errorResponse.errorType || 'UNKNOWN'}]`);

                return {
                    content: [{
                        type: "text",
                        text: formatForClaude(errorResponse)
                    }]
                };
            }
        }
    });

    // Add validate-database tool
    tools.set("validate-database", {
        name: "validate-database",
        description: "Validates the integrity of the Firebird database",
        inputSchema: ValidateDatabaseArgsSchema,
        handler: async (request) => {
            const { options } = request;
            logger.info(`Executing validate-database tool`);

            try {
                const result = await validateDatabase(options);

                return {
                    content: [{
                        type: "text",
                        text: formatForClaude(result)
                    }]
                };
            } catch (error) {
                const errorResponse = wrapError(error);
                logger.error(`Error validating database: ${errorResponse.error} [${errorResponse.errorType || 'UNKNOWN'}]`);

                return {
                    content: [{
                        type: "text",
                        text: formatForClaude(errorResponse)
                    }]
                };
            }
        }
    });

    return tools;
};
