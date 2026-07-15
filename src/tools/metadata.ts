// Herramientas para metadatos e información del sistema
import { createLogger } from '../utils/logger.js';
import { formatForClaude, wrapError } from '../utils/jsonHelper.js';
import { z, ZodTypeAny } from 'zod';
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

// Definición local de ToolDefinition basada en el uso
export interface ToolDefinition {
    name?: string;
    title?: string;
    inputSchema: ZodTypeAny;
    description: string;
    handler: (...args: any[]) => Promise<any>; // Ajustar según sea necesario
}

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
export function setupMetadataTools(databaseTools: Map<string, any>): Map<string, ToolDefinition> {
    const tools = new Map<string, ToolDefinition>();

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

                return {
                    content: [{
                        type: 'text',
                        text: `Firebird MCP server information:\n\n${formatForClaude(serverInfo)}`
                    }]
                };
            } catch (error) {
                logger.error('Error getting server info:', { error });
                return {
                    content: [{
                        type: 'text',
                        text: `Error getting server information: ${error instanceof Error ? error.message : String(error)}`
                    }],
                    isError: true
                };
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

                return {
                    content: [{
                        type: 'text',
                        text: `Available tools${args.category ? ` (category: ${args.category})` : ''}:\n\n${formatForClaude(toolsInfo)}`
                    }]
                };
            } catch (error) {
                logger.error('Error listing tools:', { error });
                return {
                    content: [{
                        type: 'text',
                        text: `Error listing tools: ${error instanceof Error ? error.message : String(error)}`
                    }],
                    isError: true
                };
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
                    return {
                        content: [{
                            type: 'text',
                            text: `Tool '${args.toolName}' not found. Use 'list-available-tools' to see the available tools.`
                        }],
                        isError: true
                    };
                }

                const helpInfo = {
                    name: args.toolName,
                    title: tool.title || args.toolName,
                    description: tool.description,
                    category: databaseTools.has(args.toolName) ? 'database' : 'metadata',
                    inputSchema: tool.inputSchema ? 'Available' : 'Not defined',
                    usage: `To use this tool, call '${args.toolName}' with the appropriate parameters.`
                };

                return {
                    content: [{
                        type: 'text',
                        text: `Help for tool: ${args.toolName}\n\n${formatForClaude(helpInfo)}`
                    }]
                };
            } catch (error) {
                logger.error('Error getting tool help:', { error });
                return {
                    content: [{
                        type: 'text',
                        text: `Error getting tool help: ${error instanceof Error ? error.message : String(error)}`
                    }],
                    isError: true
                };
            }
        }
    });

    // Herramienta para verificar el estado del sistema
    tools.set('system-health-check', {
        title: 'System Health Check',
        description: 'Checks system health and database connectivity',
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

                return {
                    content: [{
                        type: 'text',
                        text: `System health status:\n\n${formatForClaude(healthInfo)}`
                    }]
                };
            } catch (error) {
                logger.error('Error in health check:', { error });
                return {
                    content: [{
                        type: 'text',
                        text: `Error during health check: ${error instanceof Error ? error.message : String(error)}`
                    }],
                    isError: true
                };
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
                return {
                    content: [{
                        type: 'text',
                        text: `Available Firebird events (POST_EVENT):\n\n${formatForClaude(events)}`
                    }]
                };
            } catch (error) {
                const errorResponse = wrapError(error);
                return {
                    content: [{
                        type: "text",
                        text: formatForClaude(errorResponse)
                    }],
                    isError: true
                };
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

                return {
                    content: [{
                        type: "text",
                        text: `Database triggers:\n\n${formatForClaude({
                            totalTriggers: triggers.length,
                            triggers: triggers
                        })}`
                    }]
                };
            } catch (error) {
                const errorResponse = wrapError(error);
                logger.error(`Error listing triggers: ${errorResponse.error}`);

                return {
                    content: [{
                        type: "text",
                        text: formatForClaude(errorResponse)
                    }],
                    isError: true
                };
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

                return {
                    content: [{
                        type: "text",
                        text: `Details for trigger '${triggerName}':\n\n${formatForClaude(trigger)}`
                    }]
                };
            } catch (error) {
                const errorResponse = wrapError(error);
                logger.error(`Error describing trigger ${triggerName}: ${errorResponse.error}`);

                return {
                    content: [{
                        type: "text",
                        text: formatForClaude(errorResponse)
                    }],
                    isError: true
                };
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

                return {
                    content: [{
                        type: "text",
                        text: `Stored procedures in the database:\n\n${formatForClaude({
                            totalProcedures: procedures.length,
                            procedures: procedures
                        })}`
                    }]
                };
            } catch (error) {
                const errorResponse = wrapError(error);
                logger.error(`Error listing procedures: ${errorResponse.error}`);

                return {
                    content: [{
                        type: "text",
                        text: formatForClaude(errorResponse)
                    }],
                    isError: true
                };
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

                return {
                    content: [{
                        type: "text",
                        text: `Details for procedure '${procedureName}':\n\n${formatForClaude(procedure)}`
                    }]
                };
            } catch (error) {
                const errorResponse = wrapError(error);
                logger.error(`Error describing procedure ${procedureName}: ${errorResponse.error}`);

                return {
                    content: [{
                        type: "text",
                        text: formatForClaude(errorResponse)
                    }],
                    isError: true
                };
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

                return {
                    content: [{
                        type: "text",
                        text: `Functions in the database:\n\n${formatForClaude({
                            totalFunctions: functions.length,
                            functions: functions
                        })}`
                    }]
                };
            } catch (error) {
                const errorResponse = wrapError(error);
                logger.error(`Error listing functions: ${errorResponse.error}`);

                return {
                    content: [{
                        type: "text",
                        text: formatForClaude(errorResponse)
                    }],
                    isError: true
                };
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

                return {
                    content: [{
                        type: "text",
                        text: `Details for function '${functionName}':\n\n${formatForClaude(func)}`
                    }]
                };
            } catch (error) {
                const errorResponse = wrapError(error);
                logger.error(`Error describing function ${functionName}: ${errorResponse.error}`);

                return {
                    content: [{
                        type: "text",
                        text: formatForClaude(errorResponse)
                    }],
                    isError: true
                };
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

                return {
                    content: [{
                        type: "text",
                        text: `Packages in the database:\n\n${formatForClaude({
                            totalPackages: packages.length,
                            packages: packages
                        })}`
                    }]
                };
            } catch (error) {
                const errorResponse = wrapError(error);
                logger.error(`Error listing packages: ${errorResponse.error}`);

                return {
                    content: [{
                        type: "text",
                        text: formatForClaude(errorResponse)
                    }],
                    isError: true
                };
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

                return {
                    content: [{
                        type: "text",
                        text: `Details for package '${packageName}':\n\n${formatForClaude(pkg)}`
                    }]
                };
            } catch (error) {
                const errorResponse = wrapError(error);
                logger.error(`Error describing package ${packageName}: ${errorResponse.error}`);

                return {
                    content: [{
                        type: "text",
                        text: formatForClaude(errorResponse)
                    }],
                    isError: true
                };
            }
        }
    });

    logger.info(`Configured ${tools.size} metadata tools`);
    return tools;
}
