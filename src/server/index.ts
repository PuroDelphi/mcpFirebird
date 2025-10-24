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
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import cors from "cors";
import crypto from "crypto";
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
import { setupTemplatePrompts } from '../prompts/templates.js';
import { setupAdvancedTemplatePrompts } from '../prompts/advanced-templates.js';
import { initSecurity } from '../security/index.js';
import { ConfigError } from '../utils/errors.js';
import pkg from '../../package.json' with { type: 'json' };

/**
 * Factory function to create a configured MCP server instance
 * @returns A configured McpServer instance
 */
async function createMcpServerInstance(): Promise<any> {
    logger.debug('Creating new MCP server instance...');

    // Load tools, prompts and resources
    const databaseTools = setupDatabaseTools();
    const metadataTools = setupMetadataTools(databaseTools);
    const databasePrompts = setupDatabasePrompts();
    const sqlPrompts = setupSqlPrompts();
    const templatePrompts = setupTemplatePrompts();
    const advancedTemplatePrompts = setupAdvancedTemplatePrompts();
    // Temporarily disable resources due to path-to-regexp compatibility issues
    const allResources: Map<string, ResourceDefinition> = new Map();
    const allPrompts = new Map<string, PromptDefinition>([
        ...databasePrompts,
        ...sqlPrompts,
        ...templatePrompts,
        ...advancedTemplatePrompts
    ]);
    const allTools = new Map<string, DbToolDefinition | MetaToolDefinition>([...databaseTools, ...metadataTools]);

    // Create MCP server instance
    const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
    const server = new McpServer({
        name: pkg.name,
        version: pkg.version,
        capabilities: {
            tools: {
                listChanged: true
            },
            prompts: {
                listChanged: true
            },
            resources: {
                listChanged: true,
                subscribe: false
            }
        }
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
                inputSchema: (tool.inputSchema && tool.inputSchema instanceof z.ZodObject) ? tool.inputSchema.shape : {}
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
                argsSchema: (promptDef.inputSchema && promptDef.inputSchema instanceof z.ZodObject) ? promptDef.inputSchema.shape : {}
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

    // Resources - temporarily disabled due to path-to-regexp compatibility issues
    logger.info(`Skipping ${allResources.size} resources - Resource registration temporarily disabled in alpha version`);
    // TODO: Re-enable resources once path-to-regexp issues are resolved

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
            const server = await createMcpServerInstance();
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
            // Use backwards compatible server for HTTP-based transports
            logger.info('Starting backwards compatible server with SSE and Streamable HTTP...');

            const port = parseInt(process.env.SSE_PORT || process.env.HTTP_PORT || '3003', 10);
            if (isNaN(port)) {
                throw new ConfigError(`Invalid port: ${process.env.SSE_PORT || process.env.HTTP_PORT}`);
            }

            await startBackwardsCompatibleServer(port);

            // Setup cleanup for backwards compatible server
            process.on('SIGINT', async () => {
                logger.info('Received SIGINT signal, cleaning up...');
                process.exit(0);
            });

            process.on('SIGTERM', async () => {
                logger.info('Received SIGTERM signal, cleaning up...');
                process.exit(0);
            });

            logger.info('MCP Firebird backwards compatible server ready to receive requests.');

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

/**
 * Starts a backwards compatible server that supports both Streamable HTTP and SSE transports
 * Based on the official MCP TypeScript SDK documentation
 */
async function startBackwardsCompatibleServer(port: number): Promise<void> {
    const app = express();

    // Configure CORS to allow web clients
    app.use(cors({
        origin: '*',
        methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'mcp-session-id', 'Cache-Control', 'Accept'],
        credentials: false
    }));

    app.use(express.json());

    // Middleware to handle Smithery configuration via query parameters
    // Smithery passes configuration as query params using dot-notation
    // Example: ?host=localhost&port=3050&database=/path/to/db.fdb
    app.use((req, res, next) => {
        const queryParams = req.query;

        // Map Smithery query parameters to environment variables
        if (queryParams.host && typeof queryParams.host === 'string') {
            process.env.FIREBIRD_HOST = queryParams.host;
            logger.debug(`Set FIREBIRD_HOST from query param: ${queryParams.host}`);
        }
        if (queryParams.port && typeof queryParams.port === 'string') {
            process.env.FIREBIRD_PORT = queryParams.port;
            logger.debug(`Set FIREBIRD_PORT from query param: ${queryParams.port}`);
        }
        if (queryParams.database && typeof queryParams.database === 'string') {
            process.env.FIREBIRD_DATABASE = queryParams.database;
            logger.debug(`Set FIREBIRD_DATABASE from query param: ${queryParams.database}`);
        }
        if (queryParams.user && typeof queryParams.user === 'string') {
            process.env.FIREBIRD_USER = queryParams.user;
            logger.debug(`Set FIREBIRD_USER from query param: ${queryParams.user}`);
        }
        if (queryParams.password && typeof queryParams.password === 'string') {
            process.env.FIREBIRD_PASSWORD = queryParams.password;
            logger.debug(`Set FIREBIRD_PASSWORD from query param: [REDACTED]`);
        }
        if (queryParams.useNativeDriver && typeof queryParams.useNativeDriver === 'string') {
            process.env.USE_NATIVE_DRIVER = queryParams.useNativeDriver;
            logger.debug(`Set USE_NATIVE_DRIVER from query param: ${queryParams.useNativeDriver}`);
        }
        if (queryParams.logLevel && typeof queryParams.logLevel === 'string') {
            process.env.LOG_LEVEL = queryParams.logLevel;
            logger.debug(`Set LOG_LEVEL from query param: ${queryParams.logLevel}`);
        }

        next();
    });

    // Store transports for each session type
    const transports = {
        streamable: {} as Record<string, StreamableHTTPServerTransport>,
        sse: {} as Record<string, SSEServerTransport>
    };

    // Modern Streamable HTTP endpoint
    app.all('/mcp', async (req, res) => {
        try {
            // Check for existing session ID
            const sessionId = req.headers['mcp-session-id'] as string | undefined;
            let transport: StreamableHTTPServerTransport;

            if (sessionId && transports.streamable[sessionId]) {
                // Reuse existing transport
                transport = transports.streamable[sessionId];
            } else if (!sessionId && req.method === 'POST') {
                // New initialization request
                transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => crypto.randomUUID(),
                });

                // Store the transport by session ID when initialized
                transport.onclose = () => {
                    if (transport.sessionId) {
                        delete transports.streamable[transport.sessionId];
                        logger.debug(`Cleaned up streamable transport for session: ${transport.sessionId}`);
                    }
                };

                // Create and connect server
                const server = await createMcpServerInstance();
                await server.connect(transport);

                // Store transport after connection
                if (transport.sessionId) {
                    transports.streamable[transport.sessionId] = transport;
                    logger.debug(`Created streamable transport for session: ${transport.sessionId}`);
                }
            } else {
                // Invalid request
                res.status(400).json({
                    jsonrpc: '2.0',
                    error: {
                        code: -32000,
                        message: 'Bad Request: No valid session ID provided',
                    },
                    id: null,
                });
                return;
            }

            // Handle the request
            await transport.handleRequest(req, res, req.body);
        } catch (error) {
            logger.error('Error handling Streamable HTTP request:', { error });
            if (!res.headersSent) {
                res.status(500).json({
                    jsonrpc: '2.0',
                    error: {
                        code: -32603,
                        message: 'Internal server error',
                    },
                    id: null,
                });
            }
        }
    });

    // Legacy SSE endpoint for older clients
    app.get('/sse', async (req, res) => {
        try {
            logger.info('Creating SSE transport for legacy client');

            // Create SSE transport for legacy clients
            const transport = new SSEServerTransport('/messages', res);
            const sessionId = transport.sessionId || crypto.randomUUID();
            transports.sse[sessionId] = transport;

            res.on("close", () => {
                delete transports.sse[sessionId];
                logger.debug(`Cleaned up SSE transport for session: ${sessionId}`);
            });

            // Create and connect server
            const server = await createMcpServerInstance();
            await server.connect(transport);

            logger.info(`SSE transport connected for session: ${sessionId}`);
        } catch (error) {
            logger.error('Error establishing SSE connection:', { error });
            if (!res.headersSent) {
                res.status(500).json({
                    jsonrpc: '2.0',
                    error: {
                        code: -32603,
                        message: 'Internal server error',
                    },
                    id: null,
                });
            }
        }
    });

    // Legacy message endpoint for older clients
    app.post('/messages', async (req, res) => {
        try {
            const sessionId = req.query.sessionId as string;
            const transport = transports.sse[sessionId];
            if (transport) {
                await transport.handlePostMessage(req, res, req.body);
            } else {
                res.status(400).json({
                    jsonrpc: '2.0',
                    error: {
                        code: -32000,
                        message: 'No transport found for sessionId',
                    },
                    id: null,
                });
            }
        } catch (error) {
            logger.error('Error handling SSE message:', { error });
            if (!res.headersSent) {
                res.status(500).json({
                    jsonrpc: '2.0',
                    error: {
                        code: -32603,
                        message: 'Internal server error',
                    },
                    id: null,
                });
            }
        }
    });

    // Start the server
    app.listen(port, () => {
        logger.info(`MCP Backwards Compatible Server listening on port ${port}`);
        logger.info('Endpoints:');
        logger.info('  - Modern Streamable HTTP: POST/GET/DELETE /mcp');
        logger.info('  - Legacy SSE: GET /sse');
        logger.info('  - Legacy Messages: POST /messages');
    });
}
