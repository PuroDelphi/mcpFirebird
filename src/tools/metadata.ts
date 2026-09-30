// Herramientas para metadatos e información del sistema
import { createLogger } from '../utils/logger.js';
import { wrapError } from '../utils/jsonHelper.js';
import { z } from 'zod';
import { finalizeTools, toolResult, toolError, type ToolDraft, type ToolDefinition } from './contracts.js';
import { metadataResultSchemas } from './outputSchemas.js';
export type { ToolDefinition } from './contracts.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
    listTriggers,
    describeTrigger,
    listProcedures,
    describeProcedure,
    listFunctions,
    describeFunction,
    listPackages,
    describePackage,
    listAvailableEvents
} from '../db/metadata.js';
import { checkAllowedOperation } from '../security/authorization.js';


const logger = createLogger('tools:metadata');

// Get package.json version
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = join(__dirname, '../../package.json');
const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

/**
 * Configura las herramientas de metadatos, tomando las herramientas de base de datos como entrada.
 * @param databaseTools - Mapa de herramientas de base de datos ya configuradas.
 * @returns Map<string, ToolDefinition> - Mapa con las herramientas de metadatos.
 */
export function setupMetadataTools(databaseTools: Map<string, ToolDefinition>): Map<string, ToolDefinition> {
    const tools = new Map<string, ToolDraft>();

    // Herramienta para obtener información del servidor
    tools.set('get-server-info', {
        title: 'Get Server Information',
        description: 'Gets information about the Firebird MCP server and its available tools',
        inputSchema: z.object({}),
        handler: async () => {
            try {
                const serverInfo = {
                    name: pkg.name || 'MCP Firebird Server',
                    version: pkg.version || '2.6.0-alpha.11',
                    description: pkg.description || 'MCP server for Firebird databases',
                    capabilities: {
                        tools: Array.from(databaseTools.keys()),
                        totalTools: databaseTools.size,
                        features: [
                            'SQL query execution',
                            'Database schema inspection',
                            'Performance analysis'
                        ]
                    },
                    runtime: {
                        nodeVersion: process.version,
                        platform: process.platform,
                        uptime: process.uptime(),
                        memoryUsage: process.memoryUsage()
                    }
                };

                return toolResult(serverInfo, { prefix: `Firebird MCP server information:\n\n` });
            } catch (error) {
                logger.error('Error getting server info:', { error });
                return toolError(error, { text: `Error getting server information: ${error instanceof Error ? error.message : String(error)}` });
            }
        }
    });

    // Herramienta para listar todas las herramientas disponibles
    tools.set('list-available-tools', {
        title: 'List Available Tools',
        description: 'Lists all tools available on the MCP server',
        inputSchema: z.object({
            category: z.string().optional().describe('Filter by category (database, metadata)')
        }),
        handler: async (args: { category?: string }) => {
            try {
                const allTools = new Map([...databaseTools, ...tools]);
                let toolsList = Array.from(allTools.entries());

                if (args.category) {
                    if (args.category === 'database') {
                        toolsList = Array.from(databaseTools.entries());
                    } else if (args.category === 'metadata') {
                        toolsList = Array.from(tools.entries());
                    }
                }

                const toolsInfo = toolsList.map(([name, tool]) => ({
                    name,
                    title: tool.title || name,
                    description: tool.description,
                    category: databaseTools.has(name) ? 'database' : 'metadata'
                }));

                return toolResult(toolsInfo, {
                    prefix: `Available tools${args.category ? ` (category: ${args.category})` : ''}:\n\n`
                });
            } catch (error) {
                logger.error('Error listing tools:', { error });
                return toolError(error, { text: `Error listing tools: ${error instanceof Error ? error.message : String(error)}` });
            }
        }
    });

    // Herramienta para obtener ayuda sobre una herramienta específica
    tools.set('get-tool-help', {
        title: 'Get Tool Help',
        description: 'Gets detailed information about a specific tool',
        inputSchema: z.object({
            toolName: z.string().describe('Name of the tool to get help for')
        }),
        handler: async (args: { toolName: string }) => {
            try {
                const allTools = new Map([...databaseTools, ...tools]);
                const tool = allTools.get(args.toolName);

                if (!tool) {
                    const message = `Tool '${args.toolName}' not found. Use 'list-available-tools' to see the available tools.`;
                    return toolError(new Error(message), { text: message });
                }

                const helpInfo = {
                    name: args.toolName,
                    title: tool.title || args.toolName,
                    description: tool.description,
                    category: databaseTools.has(args.toolName) ? 'database' : 'metadata',
                    inputSchema: tool.inputSchema ? 'Available' : 'Not defined',
                    usage: `To use this tool, call '${args.toolName}' with the appropriate parameters.`
                };

                return toolResult(helpInfo, { prefix: `Help for tool: ${args.toolName}\n\n` });
            } catch (error) {
                logger.error('Error getting tool help:', { error });
                return toolError(error, { text: `Error getting tool help: ${error instanceof Error ? error.message : String(error)}` });
            }
        }
    });

    // Herramienta para verificar el estado del sistema
    tools.set('system-health-check', {
        title: 'System Health Check',
        description: 'Reports process health and runtime information; does not probe database connectivity',
        inputSchema: z.object({}),
        handler: async () => {
            try {
                const healthInfo = {
                    status: 'healthy',
                    timestamp: new Date().toISOString(),
                    uptime: process.uptime(),
                    memory: {
                        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
                        external: Math.round(process.memoryUsage().external / 1024 / 1024)
                    },
                    environment: {
                        nodeVersion: process.version,
                        platform: process.platform,
                        arch: process.arch
                    },
                    tools: {
                        database: databaseTools.size,
                        metadata: tools.size,
                        total: databaseTools.size + tools.size
                    }
                };

                return toolResult(healthInfo, { prefix: `System health status:\n\n` });
            } catch (error) {
                logger.error('Error in health check:', { error });
                return toolError(error, { text: `Error during health check: ${error instanceof Error ? error.message : String(error)}` });
            }
        }
    });

    // Herramienta para buscar eventos Firebird disponibles
    tools.set('list-available-events', {
        title: 'List Available Events',
        description: 'Lists native events (POST_EVENT) available in database triggers and procedures',
        inputSchema: z.object({}),
        handler: async () => {
            try {
                checkAllowedOperation('EXECUTE');
                const events = await listAvailableEvents();
                return toolResult(events, { prefix: `Available Firebird events (POST_EVENT):\n\n` });
            } catch (error) {
                return toolError(error);
            }
        }
    });

    // Herramienta para listar triggers
    tools.set('list-triggers', {
        title: 'List Triggers',
        description: 'Lists all database triggers with their associated table, trigger type, and status',
        inputSchema: z.object({}),
        handler: async () => {
            logger.info('Listing triggers');

            try {
                // Check if EXECUTE operation is allowed
                checkAllowedOperation('EXECUTE');

                const triggers = await listTriggers();
                logger.info(`Retrieved ${triggers.length} triggers`);

                return toolResult({
                            totalTriggers: triggers.length,
                            triggers: triggers
                        }, { prefix: `Database triggers:\n\n` });
            } catch (error) {
                const errorResponse = wrapError(error);
                logger.error(`Error listing triggers: ${errorResponse.error}`);

                return toolError(error);
            }
        }
    });

    // Herramienta para describir un trigger específico
    tools.set('describe-trigger', {
        title: 'Describe Trigger',
        description: 'Gets detailed information about a specific trigger, including its source code, type, sequence, and status',
        inputSchema: z.object({
            triggerName: z.string().describe('Name of the trigger to describe')
        }),
        handler: async (args: { triggerName: string }) => {
            const { triggerName } = args;
            logger.info(`Describing trigger: ${triggerName}`);

            try {
                // Check if EXECUTE operation is allowed
                checkAllowedOperation('EXECUTE');

                const trigger = await describeTrigger(triggerName);
                logger.info(`Retrieved trigger details for: ${triggerName}`);

                return toolResult(trigger, { prefix: `Details for trigger '${triggerName}':\n\n` });
            } catch (error) {
                const errorResponse = wrapError(error);
                logger.error(`Error describing trigger ${triggerName}: ${errorResponse.error}`);

                return toolError(error);
            }
        }
    });

    // Herramienta para listar procedimientos almacenados
    tools.set('list-procedures', {
        title: 'List Stored Procedures',
        description: 'Lists all stored procedures in the database with input and output parameter information',
        inputSchema: z.object({}),
        handler: async () => {
            logger.info('Listing stored procedures');

            try {
                // Check if EXECUTE operation is allowed
                checkAllowedOperation('EXECUTE');

                const procedures = await listProcedures();
                logger.info(`Retrieved ${procedures.length} procedures`);

                return toolResult({
                            totalProcedures: procedures.length,
                            procedures: procedures
                        }, { prefix: `Stored procedures in the database:\n\n` });
            } catch (error) {
                const errorResponse = wrapError(error);
                logger.error(`Error listing procedures: ${errorResponse.error}`);

                return toolError(error);
            }
        }
    });

    // Herramienta para describir un procedimiento almacenado específico
    tools.set('describe-procedure', {
        title: 'Describe Stored Procedure',
        description: 'Gets detailed information about a specific stored procedure, including its source code and parameters',
        inputSchema: z.object({
            procedureName: z.string().describe('Name of the stored procedure to describe')
        }),
        handler: async (args: { procedureName: string }) => {
            const { procedureName } = args;
            logger.info(`Describing procedure: ${procedureName}`);

            try {
                // Check if EXECUTE operation is allowed
                checkAllowedOperation('EXECUTE');

                const procedure = await describeProcedure(procedureName);
                logger.info(`Retrieved procedure details for: ${procedureName}`);

                return toolResult(procedure, { prefix: `Details for procedure '${procedureName}':\n\n` });
            } catch (error) {
                const errorResponse = wrapError(error);
                logger.error(`Error describing procedure ${procedureName}: ${errorResponse.error}`);

                return toolError(error);
            }
        }
    });

    // Herramienta para listar funciones
    tools.set('list-functions', {
        title: 'List Functions',
        description: 'Lists all functions in the database (UDFs and PSQL functions)',
        inputSchema: z.object({}),
        handler: async () => {
            logger.info('Listing functions');

            try {
                // Check if EXECUTE operation is allowed
                checkAllowedOperation('EXECUTE');

                const functions = await listFunctions();
                logger.info(`Retrieved ${functions.length} functions`);

                return toolResult({
                            totalFunctions: functions.length,
                            functions: functions
                        }, { prefix: `Functions in the database:\n\n` });
            } catch (error) {
                const errorResponse = wrapError(error);
                logger.error(`Error listing functions: ${errorResponse.error}`);

                return toolError(error);
            }
        }
    });

    // Herramienta para describir una función específica
    tools.set('describe-function', {
        title: 'Describe Function',
        description: 'Gets detailed information about a specific function, including its source code (for PSQL functions)',
        inputSchema: z.object({
            functionName: z.string().describe('Name of the function to describe')
        }),
        handler: async (args: { functionName: string }) => {
            const { functionName } = args;
            logger.info(`Describing function: ${functionName}`);

            try {
                // Check if EXECUTE operation is allowed
                checkAllowedOperation('EXECUTE');

                const func = await describeFunction(functionName);
                logger.info(`Retrieved function details for: ${functionName}`);

                return toolResult(func, { prefix: `Details for function '${functionName}':\n\n` });
            } catch (error) {
                const errorResponse = wrapError(error);
                logger.error(`Error describing function ${functionName}: ${errorResponse.error}`);

                return toolError(error);
            }
        }
    });

    // Herramienta para listar paquetes
    tools.set('list-packages', {
        title: 'List Packages',
        description: 'Lists all packages in the database (available in Firebird 3.0+)',
        inputSchema: z.object({}),
        handler: async () => {
            logger.info('Listing packages');

            try {
                // Check if EXECUTE operation is allowed
                checkAllowedOperation('EXECUTE');

                const packages = await listPackages();
                logger.info(`Retrieved ${packages.length} packages`);

                return toolResult({
                            totalPackages: packages.length,
                            packages: packages
                        }, { prefix: `Packages in the database:\n\n` });
            } catch (error) {
                const errorResponse = wrapError(error);
                logger.error(`Error listing packages: ${errorResponse.error}`);

                return toolError(error);
            }
        }
    });

    // Herramienta para describir un paquete específico
    tools.set('describe-package', {
        title: 'Describe Package',
        description: 'Gets detailed information about a specific package, including its header and body source',
        inputSchema: z.object({
            packageName: z.string().describe('Name of the package to describe')
        }),
        handler: async (args: { packageName: string }) => {
            const { packageName } = args;
            logger.info(`Describing package: ${packageName}`);

            try {
                // Check if EXECUTE operation is allowed
                checkAllowedOperation('EXECUTE');

                const pkg = await describePackage(packageName);
                logger.info(`Retrieved package details for: ${packageName}`);

                return toolResult(pkg, { prefix: `Details for package '${packageName}':\n\n` });
            } catch (error) {
                const errorResponse = wrapError(error);
                logger.error(`Error describing package ${packageName}: ${errorResponse.error}`);

                return toolError(error);
            }
        }
    });

    logger.info(`Configured ${tools.size} metadata tools`);
    return finalizeTools(tools, metadataResultSchemas);
}
