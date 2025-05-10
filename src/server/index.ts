/**
 * MCP Firebird Server Implementation
 * Main server module that initializes and configures the MCP server
 */

import { z } from 'zod';

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
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createSseRouter } from "./sse.js";
import {
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

        // 2. Create MCP server instance (McpServer)
        logger.info('Creating MCP server instance...');
        const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
        const server = new McpServer({
            name: pkg.name,
            version: pkg.version
        });
        logger.info('MCP server instance created.');

        // 3. Registro de tools, prompts y resources (McpServer moderno)
        logger.info('Registrando tools, prompts y resources en MCP...');

        // Tools
        for (const [name, tool] of allTools.entries()) {
            server.tool(
                name,
                tool.description,
                (tool.inputSchema && tool.inputSchema instanceof z.ZodObject ? tool.inputSchema.shape : {}), 
                async (args: any, extra: any): Promise<{ content: any[], isError?: boolean }> => {
                    try {
                        const result = await tool.handler(args);
                        if (typeof result === 'object' && result !== null && 'content' in result) {
                            return result;
                        }
                        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
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
                }
            );
            logger.info(`Registered tool: ${name}`);
        }

        // Prompts
        for (const [name, promptDef] of allPrompts.entries()) {
            server.prompt(
                name,
                promptDef.description,
                (promptDef.inputSchema && promptDef.inputSchema instanceof z.ZodObject ? promptDef.inputSchema.shape : {}), 
                async (extra: any) => {
                    const args = extra.inputs;
                    try {
                        let result;
                        if (!args) {
                            // SDK espera siempre 'messages', aunque sea vacío o informativo
                            result = {
                                messages: [
                                    {
                                        role: 'assistant',
                                        content: { type: 'text', text: `Prompt '${name}' metadata: ${promptDef.description}` }
                                    }
                                ]
                            };
                        } else {
                            result = await promptDef.handler(args);
                        }
                        if (!result || !result.messages || !Array.isArray(result.messages)) {
                            logger.error(`The prompt handler for ${name} did not return a valid format`);
                            return {
                                messages: [
                                    {
                                        role: 'assistant',
                                        content: { type: 'text', text: `Internal error: invalid response format` }
                                    }
                                ]
                            };
                        }
                        // Ajusta los roles y el tipo de content
                        const safeMessages = result.messages.map((msg: any) => ({
                            role: (msg.role === 'user' || msg.role === 'assistant') ? msg.role : 'assistant',
                            content: (msg.content && typeof msg.content === 'object' && msg.content.type === 'text')
                                ? msg.content
                                : { type: 'text', text: String(msg.content) }
                        }));
                        return { messages: safeMessages };
                    } catch (error) {
                        logger.error(`Error executing prompt ${name}: ${error instanceof Error ? error.message : String(error)}`, { error });
                        return {
                            messages: [
                                {
                                    role: 'assistant',
                                    content: { type: 'text', text: `Error executing prompt: ${error instanceof Error ? error.message : String(error)}` }
                                }
                            ]
                        };
                    }
                }
            );
            logger.info(`Registered prompt: ${name}`);
        }

        // Resources
        for (const [uriTemplate, resourceDef] of allResources.entries()) {
            server.resource(
                `resource-${uriTemplate}`,
                uriTemplate,
                async (uriParams: any) => {
                    try {
                        const result = await resourceDef.handler(uriParams || {});
                        return {
                            contents: [
                                {
                                    uri: uriTemplate,
                                    mimeType: "application/json",
                                    text: JSON.stringify(result, null, 2)
                                }
                            ]
                        };
                    } catch (error) {
                        logger.error(`Error accessing resource ${uriTemplate}: ${error instanceof Error ? error.message : String(error)}`, { error });
                        throw error;
                    }
                }
            );
            logger.info(`Registered resource: ${uriTemplate}`);
        }

        // No resource templates registrados (SDK MCP moderno no expone resourceTemplate)

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
            // Nuevo: Express + Router SSE
            const ssePort = parseInt(process.env.SSE_PORT || '3003', 10);
            if (isNaN(ssePort)) {
                throw new ConfigError(`Invalid SSE port: ${process.env.SSE_PORT}`);
            }
            logger.info(`Starting Express SSE server on port ${ssePort}...`);
            const expressApp = require('express')();
            expressApp.use(require('cors')());
            expressApp.use(require('express').json());
            expressApp.use(createSseRouter(server));
            const serverInstance = expressApp.listen(ssePort, () => {
                logger.info(`SSE server listening on port ${ssePort}...`);
            });
            // Limpieza elegante
            const cleanup = async () => {
                logger.info('Cleaning up Express SSE server...');
                await new Promise<void>(resolve => serverInstance.close(() => resolve()));
            };
            setupSignalHandlers(cleanup);
            logger.info('MCP Firebird server with SSE transport ready to receive requests.');
            // Mantener proceso vivo
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
