// Herramientas para consultas de base de datos
import { z } from 'zod';
import {
    executeQuery,
    listTables,
    describeTable,
    getFieldDescriptions,
    analyzeQueryPerformance,
    getExecutionPlan,
    analyzeMissingIndexes,
    executeBatchQueries,
    describeBatchTables
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
    params: z.array(z.string().or(z.number()).or(z.boolean()).or(z.null())).optional().describe("Parameters for parameterized queries to prevent SQL injection")
});

export const AnalyzeQueryPerformanceArgsSchema = z.object({
    sql: z.string().min(1).describe("SQL query to analyze"),
    params: z.array(z.string().or(z.number()).or(z.boolean()).or(z.null())).optional().describe("Parameters for parameterized queries"),
    iterations: z.number().int().positive().default(3).describe("Number of times to run the query for averaging performance")
});

export const GetExecutionPlanArgsSchema = z.object({
    sql: z.string().min(1).describe("SQL query to analyze"),
    params: z.array(z.string().or(z.number()).or(z.boolean()).or(z.null())).optional().describe("Parameters for parameterized queries")
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

export const ExecuteBatchQueriesArgsSchema = z.object({
    queries: z.array(
        z.object({
            sql: z.string().min(1).describe("SQL query to execute"),
            params: z.array(z.string().or(z.number()).or(z.boolean()).or(z.null())).optional().describe("Parameters for parameterized queries")
        })
    ).min(1).max(20).describe("Array of query objects, each containing SQL and optional parameters"),
    maxConcurrent: z.number().int().min(1).max(10).optional().default(5).describe("Maximum number of concurrent queries (default: 5)")
});

export const DescribeBatchTablesArgsSchema = z.object({
    tableNames: z.array(z.string().min(1)).min(1).max(20).describe("Array of table names to describe"),
    maxConcurrent: z.number().int().min(1).max(10).optional().default(5).describe("Maximum number of concurrent operations (default: 5)")
});

export const GetTableDataArgsSchema = z.object({
    tableName: z.string().min(1).describe("Name of the table to retrieve data from"),
    first: z.number().int().positive().optional().describe("Number of rows to retrieve (FIRST clause in Firebird)"),
    skip: z.number().int().min(0).optional().describe("Number of rows to skip (SKIP clause in Firebird)"),
    where: z.string().optional().describe("Optional WHERE clause (without the WHERE keyword)"),
    orderBy: z.string().optional().describe("Optional ORDER BY clause (without the ORDER BY keyword)")
});

export const AnalyzeTableStatisticsArgsSchema = z.object({
    tableName: z.string().min(1).describe("Name of the table to analyze")
});

export const VerifyWireEncryptionArgsSchema = z.object({});

export const GetDatabaseInfoArgsSchema = z.object({});

/**
 * Interfaz para definir una herramienta MCP.
 */
export interface ToolDefinition {
    name: string;
    title?: string;
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
            const { sql, params = [] }: { sql: string; params?: (string | number | boolean | null)[] } = args;
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

    // Add execute-batch-queries tool
    tools.set("execute-batch-queries", {
        name: "execute-batch-queries",
        description: "Executes multiple SQL queries in parallel for improved performance.",
        inputSchema: ExecuteBatchQueriesArgsSchema,
        handler: async (args: z.infer<typeof ExecuteBatchQueriesArgsSchema>) => {
            const { queries, maxConcurrent = 5 } = args;
            logger.info(`Executing batch of ${queries.length} queries with max concurrency ${maxConcurrent}`);

            try {
                // Validate each query for security
                queries.forEach((query, index) => {
                    if (!validateSql(query.sql)) {
                        throw new FirebirdError(
                            `Potentially unsafe SQL query at index ${index}: ${query.sql.substring(0, 100)}${query.sql.length > 100 ? '...' : ''}`,
                            'SECURITY_ERROR'
                        );
                    }
                });

                const results = await executeBatchQueries(queries, undefined, maxConcurrent);

                logger.info(`Batch execution completed: ${results.filter(r => r.success).length} succeeded, ${results.filter(r => !r.success).length} failed`);

                return {
                    content: [{
                        type: "text",
                        text: formatForClaude(results)
                    }]
                };
            } catch (error) {
                const errorResponse = wrapError(error);
                logger.error(`Error executing batch queries: ${errorResponse.error} [${errorResponse.errorType || 'UNKNOWN'}]`);

                return {
                    content: [{
                        type: "text",
                        text: formatForClaude(errorResponse)
                    }]
                };
            }
        }
    });

    // Add describe-batch-tables tool
    tools.set("describe-batch-tables", {
        name: "describe-batch-tables",
        description: "Gets the detailed schema of multiple tables in parallel for improved performance.",
        inputSchema: DescribeBatchTablesArgsSchema,
        handler: async (args: z.infer<typeof DescribeBatchTablesArgsSchema>) => {
            const { tableNames, maxConcurrent = 5 } = args;
            logger.info(`Describing batch of ${tableNames.length} tables with max concurrency ${maxConcurrent}`);

            try {
                const results = await describeBatchTables(tableNames, undefined, maxConcurrent);

                logger.info(`Batch description completed: ${results.filter(r => r.schema !== null).length} succeeded, ${results.filter(r => r.schema === null).length} failed`);

                return {
                    content: [{
                        type: "text",
                        text: formatForClaude(results)
                    }]
                };
            } catch (error) {
                const errorResponse = wrapError(error);
                logger.error(`Error describing batch tables: ${errorResponse.error} [${errorResponse.errorType || 'UNKNOWN'}]`);

                return {
                    content: [{
                        type: "text",
                        text: formatForClaude(errorResponse)
                    }]
                };
            }
        }
    });

    // Nueva herramienta: get-table-data
    tools.set("get-table-data", {
        name: "get-table-data",
        title: "Get Table Data",
        description: "Retrieves data from a specific table with optional filtering, pagination, and ordering.",
        inputSchema: GetTableDataArgsSchema,
        handler: async (args: z.infer<typeof GetTableDataArgsSchema>) => {
            const { tableName, first, skip, where, orderBy } = args;
            logger.info(`Getting data from table: ${tableName}`);

            try {
                let sql = `SELECT * FROM "${tableName}"`;

                if (where) {
                    sql += ` WHERE ${where}`;
                }

                if (orderBy) {
                    sql += ` ORDER BY ${orderBy}`;
                }

                if (first !== undefined) {
                    sql = `SELECT FIRST ${first} ${skip ? `SKIP ${skip}` : ''} * FROM "${tableName}"${where ? ` WHERE ${where}` : ''}${orderBy ? ` ORDER BY ${orderBy}` : ''}`;
                }

                const result = await executeQuery(sql);
                logger.info(`Retrieved ${result.length} rows from ${tableName}`);

                return {
                    content: [{
                        type: "text",
                        text: formatForClaude({
                            tableName,
                            rowCount: result.length,
                            data: result
                        })
                    }]
                };
            } catch (error) {
                const errorResponse = wrapError(error);
                logger.error(`Error getting data from ${tableName}: ${errorResponse.error}`);

                return {
                    content: [{
                        type: "text",
                        text: formatForClaude(errorResponse)
                    }]
                };
            }
        }
    });

    // Nueva herramienta: analyze-table-statistics
    tools.set("analyze-table-statistics", {
        name: "analyze-table-statistics",
        title: "Analyze Table Statistics",
        description: "Analyzes statistical information about a table including row count, column statistics, and data distribution.",
        inputSchema: AnalyzeTableStatisticsArgsSchema,
        handler: async (args: z.infer<typeof AnalyzeTableStatisticsArgsSchema>) => {
            const { tableName } = args;
            logger.info(`Analyzing statistics for table: ${tableName}`);

            try {
                // Get row count
                const countResult = await executeQuery(`SELECT COUNT(*) as ROW_COUNT FROM "${tableName}"`);
                const rowCount = countResult[0]?.ROW_COUNT || 0;

                // Get table schema
                const schema = await describeTable(tableName);

                // Get sample data for analysis
                const sampleData = await executeQuery(`SELECT FIRST 100 * FROM "${tableName}"`);

                const statistics = {
                    tableName,
                    rowCount,
                    columnCount: schema.length,
                    sampleSize: sampleData.length,
                    columns: schema.map((col: any) => ({
                        name: col.FIELD_NAME,
                        type: col.FIELD_TYPE,
                        nullable: col.NULL_FLAG === 'YES',
                        hasDefault: !!col.DEFAULT_VALUE
                    }))
                };

                logger.info(`Statistics analyzed for ${tableName}: ${rowCount} rows, ${schema.length} columns`);

                return {
                    content: [{
                        type: "text",
                        text: formatForClaude(statistics)
                    }]
                };
            } catch (error) {
                const errorResponse = wrapError(error);
                logger.error(`Error analyzing statistics for ${tableName}: ${errorResponse.error}`);

                return {
                    content: [{
                        type: "text",
                        text: formatForClaude(errorResponse)
                    }]
                };
            }
        }
    });

    // Nueva herramienta: verify-wire-encryption
    tools.set("verify-wire-encryption", {
        name: "verify-wire-encryption",
        title: "Verify Wire Encryption",
        description: "Verifies if the current database connection is using wire encryption (requires native driver).",
        inputSchema: VerifyWireEncryptionArgsSchema,
        handler: async () => {
            logger.info("Verifying wire encryption status");

            try {
                // Check if native driver is available
                const driverInfo = {
                    hasNativeDriver: process.env.USE_NATIVE_DRIVER === 'true',
                    wireEncryptionEnabled: process.env.WIRE_CRYPT === 'Enabled',
                    driverType: process.env.USE_NATIVE_DRIVER === 'true' ? 'native' : 'pure-js',
                    recommendation: process.env.USE_NATIVE_DRIVER !== 'true'
                        ? 'Wire encryption requires the native driver. Set USE_NATIVE_DRIVER=true and install node-firebird-driver-native.'
                        : 'Native driver is configured. Ensure WIRE_CRYPT=Enabled for encryption.'
                };

                return {
                    content: [{
                        type: "text",
                        text: formatForClaude(driverInfo)
                    }]
                };
            } catch (error) {
                const errorResponse = wrapError(error);
                logger.error(`Error verifying wire encryption: ${errorResponse.error}`);

                return {
                    content: [{
                        type: "text",
                        text: formatForClaude(errorResponse)
                    }]
                };
            }
        }
    });

    // Nueva herramienta: get-database-info
    tools.set("get-database-info", {
        name: "get-database-info",
        title: "Get Database Info",
        description: "Retrieves general information about the connected Firebird database.",
        inputSchema: GetDatabaseInfoArgsSchema,
        handler: async () => {
            logger.info("Getting database information");

            try {
                const tables = await listTables();

                const info = {
                    database: process.env.DB_NAME || 'unknown',
                    host: process.env.DB_HOST || 'localhost',
                    port: process.env.DB_PORT || 3050,
                    totalTables: tables.length,
                    driverType: process.env.USE_NATIVE_DRIVER === 'true' ? 'native' : 'pure-js',
                    wireEncryption: process.env.WIRE_CRYPT || 'Disabled',
                    tables: tables
                };

                return {
                    content: [{
                        type: "text",
                        text: formatForClaude(info)
                    }]
                };
            } catch (error) {
                const errorResponse = wrapError(error);
                logger.error(`Error getting database info: ${errorResponse.error}`);

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
