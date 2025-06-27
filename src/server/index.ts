/**
 * MCP Firebird Server Implementation
 * Main server module that initializes and configures the MCP server
 */

import { z } from 'zod';

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
import { UnifiedMcpServer } from "./unified-server.js";
// SDK types will be imported as needed

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
import { ConfigError } from '../utils/errors.js';
import pkg from '../../package.json' with { type: 'json' };

/**
 * Factory function to create a configured MCP server instance
 * @returns A configured McpServer instance
 */
function createMcpServerInstance(): any {
    logger.debug('Creating new MCP server instance...');

    // Load tools, prompts and resources
    const databaseTools = setupDatabaseTools();
    const metadataTools = setupMetadataTools(databaseTools);
    const databasePrompts = setupDatabasePrompts();
    const sqlPrompts = setupSqlPrompts();
    const allResources: Map<string, ResourceDefinition> = setupDatabaseResources();
    const allPrompts = new Map<string, PromptDefinition>([...databasePrompts, ...sqlPrompts]);
    const allTools = new Map<string, DbToolDefinition | MetaToolDefinition>([...databaseTools, ...metadataTools]);

    // Create MCP server instance
    const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
    const server = new McpServer({
        name: pkg.name,
        version: pkg.version
    });

    // Register tools, prompts and resources
    logger.debug('Registering tools, prompts and resources...');

    // Tools - using registerTool (modern method)
    for (const [name, tool] of allTools.entries()) {
        server.registerTool(
            name,
            {
                title: tool.title || name,
                description: tool.description,
                inputSchema: tool.inputSchema || z.object({})
            },
            async (args: any): Promise<{ content: any[], isError?: boolean }> => {
                try {
                    const result = await tool.handler(args);
                    if (typeof result === 'object' && result !== null && 'content' in result) {
                        return result;
                    }
                    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
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
    }

    // Prompts - using registerPrompt (modern method)
    for (const [name, promptDef] of allPrompts.entries()) {
        server.registerPrompt(
            name,
            {
                title: promptDef.title || name,
                description: promptDef.description,
                argsSchema: promptDef.inputSchema || z.object({})
            },
            async (args: any) => {
                try {
                    let result;
                    if (!args || Object.keys(args).length === 0) {
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
                        return {
                            messages: [
                                {
                                    role: 'assistant',
                                    content: { type: 'text', text: `Internal error: invalid response format` }
                                }
                            ]
                        };
                    }

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
    }

    // Resources - using registerResource (modern method)
    for (const [uriTemplate, resourceDef] of allResources.entries()) {
        // For static resources
        if (!uriTemplate.includes('{')) {
            server.registerResource(
                `resource-${uriTemplate.replace(/[^a-zA-Z0-9]/g, '-')}`,
                uriTemplate,
                {
                    title: resourceDef.title || `Resource ${uriTemplate}`,
                    description: resourceDef.description || `Resource at ${uriTemplate}`,
                    mimeType: resourceDef.mimeType || "application/json"
                },
                async (uri: any) => {
                    try {
                        const result = await resourceDef.handler({});
                        return {
                            contents: [
                                {
                                    uri: uri.href,
                                    mimeType: resourceDef.mimeType || "application/json",
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
        } else {
            // For dynamic resources with parameters, use ResourceTemplate
            const { ResourceTemplate } = require("@modelcontextprotocol/sdk/server/mcp.js");
            server.registerResource(
                `resource-${uriTemplate.replace(/[^a-zA-Z0-9]/g, '-')}`,
                new ResourceTemplate(uriTemplate, { list: undefined }),
                {
                    title: resourceDef.title || `Dynamic Resource ${uriTemplate}`,
                    description: resourceDef.description || `Dynamic resource at ${uriTemplate}`
                },
                async (uri: any, params: any) => {
                    try {
                        const result = await resourceDef.handler(params || {});
                        return {
                            contents: [
                                {
                                    uri: uri.href,
                                    mimeType: resourceDef.mimeType || "application/json",
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
        }
    }

    logger.debug(`Server instance created with ${allTools.size} tools, ${allPrompts.size} prompts, ${allResources.size} resources`);
    return server;
}

/**
 * Main function to start the MCP Firebird server
 * @returns A promise that resolves when the server is started
 */
export async function main() {
    logger.info(`Starting MCP Firebird Server - Name: ${pkg.name}, Version: ${pkg.version}`);

    try {
        // Initialize security module
        logger.info('Initializing security module...');
        await initSecurity();

        // Determine transport type
        const transportType = process.env.TRANSPORT_TYPE?.toLowerCase() || 'stdio';
        logger.info(`Configuring ${transportType} transport...`);

        if (transportType === 'stdio') {
            // Use stdio transport with a single server instance
            logger.info('Starting stdio transport...');
            const server = createMcpServerInstance();
            const transport = new StdioServerTransport();

            await server.connect(transport);

            // Setup cleanup for stdio
            const cleanup = async () => {
                logger.info('Closing stdio transport...');
                await server.close();
                logger.info('Server closed successfully');
            };

            process.on('SIGINT', async () => {
                logger.info('Received SIGINT signal, cleaning up...');
                await cleanup();
                process.exit(0);
            });

            process.on('SIGTERM', async () => {
                logger.info('Received SIGTERM signal, cleaning up...');
                await cleanup();
                process.exit(0);
            });

            logger.info('MCP Firebird server with stdio transport ready to receive requests.');

        } else if (transportType === 'sse' || transportType === 'http' || transportType === 'unified') {
            // Use unified server for HTTP-based transports
            logger.info('Starting unified server...');

            const port = parseInt(process.env.SSE_PORT || process.env.HTTP_PORT || '3003', 10);
            if (isNaN(port)) {
                throw new ConfigError(`Invalid port: ${process.env.SSE_PORT || process.env.HTTP_PORT}`);
            }

            const unifiedServer = new UnifiedMcpServer(createMcpServerInstance, {
                port,
                enableSSE: transportType === 'sse' || transportType === 'unified',
                enableStreamableHttp: transportType === 'http' || transportType === 'unified',
                sessionConfig: {
                    sessionTimeoutMs: parseInt(process.env.SESSION_TIMEOUT_MS || '1800000', 10),
                    maxSessions: parseInt(process.env.MAX_SESSIONS || '1000', 10)
                }
            });

            await unifiedServer.start();

            // Setup cleanup for unified server
            const cleanup = async () => {
                logger.info('Stopping unified server...');
                await unifiedServer.stop();
            };

            process.on('SIGINT', async () => {
                logger.info('Received SIGINT signal, cleaning up...');
                await cleanup();
                process.exit(0);
            });

            process.on('SIGTERM', async () => {
                logger.info('Received SIGTERM signal, cleaning up...');
                await cleanup();
                process.exit(0);
            });

            logger.info('MCP Firebird unified server ready to receive requests.');

        } else {
            throw new ConfigError(
                `Unsupported transport type: ${transportType}. Supported types are 'stdio', 'sse', 'http', and 'unified'.`,
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
