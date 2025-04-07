/**
 * MCP Firebird Server Implementation
 * Main server module that initializes and configures the MCP server
 */

import { z } from 'zod';
import UrlPattern from 'url-pattern';
import { zodToJsonSchema } from 'zod-to-json-schema';

// --- Global Error Handlers ---
import { createLogger } from '../utils/logger.js';
import { MCPError } from '../utils/errors.js';

const logger = createLogger('server:index');

// Set up global error handlers
process.on('uncaughtException', (err, origin) => {
    logger.error(`Uncaught exception: ${err instanceof Error ? err.message : String(err)}`, {
        error: err,
        origin
    });
    logger.error('Server will exit due to uncaught exception');
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled promise rejection', {
        reason,
        promise
    });
});
// ------------------------------------

// --- SDK Imports ---
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { startSseServer } from "./sse.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    ListPromptsRequestSchema,
    GetPromptRequestSchema,
    ListResourcesRequestSchema,
    ReadResourceRequestSchema,
    ListResourceTemplatesRequestSchema,
    ToolSchema
} from "@modelcontextprotocol/sdk/types.js";

// --- Local Imports ---
import { type ToolDefinition as DbToolDefinition } from '../tools/database.js';
import { type ToolDefinition as MetaToolDefinition } from '../tools/metadata.js';
import { type PromptDefinition } from '../prompts/types.js';
import { setupDatabaseResources, type ResourceDefinition } from '../resources/database.js';
import { setupDatabaseTools } from '../tools/database.js';
import { setupMetadataTools } from '../tools/metadata.js';
import { setupDatabasePrompts } from '../prompts/database.js';
import { setupSqlPrompts } from '../prompts/sql.js';
import { initSecurity } from '../security/index.js';
import { ConfigError, ErrorTypes } from '../utils/errors.js';
import pkg from '../../package.json' with { type: 'json' };

/**
 * Main function to start the MCP Firebird server
 * @returns A promise that resolves when the server is started
 */
export async function main() {
    logger.info(`Starting MCP Firebird Server - Name: ${pkg.name}, Version: ${pkg.version}`);

    try {
        // 1. Initialize security module
        logger.info('Initializing security module...');
        await initSecurity();

        // 2. Load tools, prompts and resources
        logger.info('Loading tool, prompt and resource definitions...');
        const databaseTools = setupDatabaseTools();
        const metadataTools = setupMetadataTools(databaseTools);
        const databasePrompts = setupDatabasePrompts();
        const sqlPrompts = setupSqlPrompts();
        const allResources: Map<string, ResourceDefinition> = setupDatabaseResources();
        const allPrompts = new Map<string, PromptDefinition>([...databasePrompts, ...sqlPrompts]);
        const allTools = new Map<string, DbToolDefinition | MetaToolDefinition>([...databaseTools, ...metadataTools]);

        // Log loaded prompts
        logger.info('Loaded prompts:');
        allPrompts.forEach((prompt, name) => {
            logger.info(`  - ${name}: ${prompt.description}`);
        });

        logger.info(
            `Loaded: ${allTools.size} tools, ${allPrompts.size} prompts, ${allResources.size} resources.`
        );

        // 2. Create MCP server instance
        logger.info('Creating MCP server instance...');
        const server = new Server(
            {
                name: pkg.name,
                version: pkg.version
            },
            {
                capabilities: {
                    tools: { list: true, execute: true },
                    prompts: { list: true, get: true, call: true },
                    resources: { list: true, read: true },
                    resourceTemplates: { list: true }
                }
            }
        );
        logger.info('MCP server instance created.');

        // 3. Configure request handlers
        logger.info('Configuring request handlers...');

        // Handler for listing tools
        server.setRequestHandler(ListToolsRequestSchema, async () => {
            logger.info('Received ListTools request');
            const tools = Array.from(allTools.entries()).map(([name, tool]) => ({
                name,
                description: tool.description,
                inputSchema: tool.inputSchema ? zodToJsonSchema(tool.inputSchema) : undefined
            }));
            return { tools };
        });

        // Handler for executing tools
        server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            logger.info(`Received CallTool request: ${name}`);

            const tool = allTools.get(name);
            if (!tool) {
                return {
                    content: [{ type: "text", text: `Error: Unknown tool: ${name}` }],
                    isError: true
                };
            }

            try {
                const result = await tool.handler(args);

                // Si el resultado es un objeto con success: false, lo devolvemos como JSON sin secuencias de escape
                if (typeof result === 'object' && result !== null && 'success' in result && result.success === false) {
                    return {
                        content: [{ type: "text", text: JSON.stringify(result) }],
                        isError: true
                    };
                }

                // Para otros resultados, devolvemos como texto plano
                return {
                    content: [{ type: "text", text: JSON.stringify(result) }]
                };
            } catch (error) {
                logger.error(`Error executing tool ${name}: ${error instanceof Error ? error.message : String(error)}`, { error });
                const message = error instanceof Error ? error.message : 'Unknown error';
                return {
                    content: [{ type: "text", text: `Error executing tool ${name}: ${message}` }],
                    isError: true
                };
            }
        });

        // Handler for listing prompts
        server.setRequestHandler(ListPromptsRequestSchema, async () => {
            logger.info('Received ListPrompts request');
            const prompts = Array.from(allPrompts.entries()).map(([name, prompt]) => ({
                name,
                description: prompt.description
            }));
            return { prompts };
        });

        // Handler for getting or executing a prompt
        server.setRequestHandler(GetPromptRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            logger.info(`Received GetPrompt request: ${name}`);

            const promptDef = allPrompts.get(name as string);
            if (!promptDef) {
                throw new Error(`Unknown prompt: ${name}`);
            }

            // If there are no arguments, just return the prompt definition
            if (!args) {
                return {
                    prompt: {
                        name: name,
                        description: promptDef.description,
                        inputSchema: promptDef.inputSchema ? zodToJsonSchema(promptDef.inputSchema) : undefined
                    }
                };
            }

            // If there are arguments, execute the prompt
            try {
                // Execute the prompt handler with the provided arguments
                const result = await promptDef.handler(args);

                // Make sure the result has the correct format
                if (!result || !result.messages || !Array.isArray(result.messages)) {
                    logger.error(`The prompt handler for ${name} did not return a valid format`);
                    throw new Error(`Internal error: invalid response format`);
                }

                return result;
            } catch (error) {
                logger.error(`Error executing prompt ${name}: ${error instanceof Error ? error.message : String(error)}`, { error });
                throw error;
            }
        });

        // Handler for listing resources
        server.setRequestHandler(ListResourcesRequestSchema, async () => {
            logger.info('Received ListResources request');
            const resources = Array.from(allResources.keys()).map(uriTemplate => ({
                uri: uriTemplate,
                name: `Resource: ${uriTemplate}`,
                mimeType: "application/json"
            }));
            return { resources };
        });

        // Handler for reading a specific resource
        server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
            const { uri } = request.params;
            logger.info(`Received ReadResource request: ${uri}`);

            let matchedResourceDef: ResourceDefinition | undefined;
            let uriParams: Record<string, string> = {};

            for (const [uriTemplate, definition] of allResources.entries()) {
                const pattern = new UrlPattern(uriTemplate);
                const match = pattern.match(uri);
                if (match) {
                    matchedResourceDef = definition;
                    uriParams = match;
                    break;
                }
            }

            if (!matchedResourceDef) {
                throw new Error(`Unknown resource or URI pattern does not match: ${uri}`);
            }

            try {
                const result = await matchedResourceDef.handler(uriParams);

                return {
                    contents: [
                        {
                            uri: request.params.uri,
                            mimeType: "application/json",
                            text: JSON.stringify(result, null, 2)
                        }
                    ]
                };
            } catch (error) {
                logger.error(`Error accessing resource ${uri}: ${error instanceof Error ? error.message : String(error)}`, { error });
                throw error;
            }
        });

        // Handler for listing resource templates
        server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
            logger.info('Received ListResourceTemplates request');
            // For now, return an empty list as we don't have any templates defined
            return { resourceTemplates: [] };
        });

        // 4. Start the server with the appropriate transport
        const transportType = process.env.TRANSPORT_TYPE?.toLowerCase() || 'stdio';
        logger.info(`Configuring ${transportType} transport...`);

        // Set up signal handlers for graceful shutdown
        let cleanup: (() => Promise<void>) | null = null;

        const setupSignalHandlers = (cleanupFn: () => Promise<void>) => {
            cleanup = cleanupFn;

            // Handle cleanup on process exit
            process.on('SIGINT', async () => {
                logger.info('Received SIGINT signal, cleaning up...');
                if (cleanup) await cleanup();
                process.exit(0);
            });

            process.on('SIGTERM', async () => {
                logger.info('Received SIGTERM signal, cleaning up...');
                if (cleanup) await cleanup();
                process.exit(0);
            });
        };

        // Start the server with the appropriate transport
        if (transportType === 'sse') {
            // Start SSE server
            const ssePort = parseInt(process.env.SSE_PORT || '3003', 10);
            if (isNaN(ssePort)) {
                throw new ConfigError(`Invalid SSE port: ${process.env.SSE_PORT}`);
            }

            logger.info(`Starting SSE server on port ${ssePort}...`);

            const { cleanup: sseCleanup } = await startSseServer(server, ssePort);
            setupSignalHandlers(sseCleanup);

            logger.info('MCP Firebird server with SSE transport ready to receive requests.');
            logger.info(`SSE server listening on port ${ssePort}...`);

            // Keep the process alive indefinitely
            await new Promise<void>(() => {});
        } else if (transportType === 'stdio') {
            // Use stdio transport
            logger.info('Configuring stdio transport...');
            const transport = new StdioServerTransport();
            logger.info('Connecting server to transport...');

            // Connect the server to the transport - following the official example pattern
            await server.connect(transport);

            // Setup cleanup function for SIGINT (Ctrl+C)
            process.on('SIGINT', async () => {
                logger.info('Received SIGINT signal, cleaning up...');
                logger.info('Closing stdio transport...');
                await server.close();
                logger.info('Server closed successfully');
                process.exit(0);
            });

            // Setup cleanup function for SIGTERM
            process.on('SIGTERM', async () => {
                logger.info('Received SIGTERM signal, cleaning up...');
                logger.info('Closing stdio transport...');
                await server.close();
                logger.info('Server closed successfully');
                process.exit(0);
            });

            logger.info('MCP Firebird server with stdio transport connected and ready to receive requests.');
            logger.info('Server waiting for requests...');
        } else {
            throw new ConfigError(
                `Unsupported transport type: ${transportType}. Supported types are 'stdio' and 'sse'.`,
                undefined,
                { transportType }
            );
        }

    } catch (error) {
        if (error instanceof MCPError) {
            logger.error(`Fatal error during server initialization: ${error.message}`, {
                type: error.type,
                context: error.context,
                originalError: error.originalError
            });
        } else if (error instanceof Error) {
            logger.error(`Fatal error during server initialization: ${error.message}`, {
                stack: error.stack
            });
        } else {
            logger.error(`Fatal error during server initialization: ${String(error)}`);
        }

        // Exit with error code
        process.exit(1);
    }
}
