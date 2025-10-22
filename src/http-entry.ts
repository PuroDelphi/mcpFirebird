/**
 * HTTP Entry Point for MCP Firebird
 * 
 * This entry point starts the MCP server in HTTP mode (Streamable HTTP protocol)
 * for deployment on platforms like Smithery, Railway, Render, etc.
 * 
 * Configuration is passed via:
 * 1. Environment variables (standard Docker deployment)
 * 2. Query parameters (Smithery deployment)
 */

import express from 'express';
import cors from 'cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger } from './utils/logger.js';
import { createStreamableHttpRouter } from './server/streamable-http.js';
import { createSseRouter } from './server/sse.js';
import { setupDatabaseTools } from './tools/database.js';
import { setupMetadataTools } from './tools/metadata.js';
import { setupSimpleTools } from './tools/simple.js';
import { setupDatabasePrompts } from './prompts/database.js';
import { setupSqlPrompts } from './prompts/sql.js';
import { setupDatabaseResources } from './resources/database.js';
import { initSecurity } from './security/index.js';
import pkg from '../package.json' with { type: 'json' };
import { z } from 'zod';
import type { ToolDefinition as DbToolDefinition } from './tools/database.js';
import type { ToolDefinition as MetaToolDefinition } from './tools/metadata.js';
import type { ToolDefinition as SimpleToolDefinition } from './tools/simple.js';

const logger = createLogger('http-entry');

/**
 * Parse configuration from query parameters (Smithery format)
 * Smithery passes config as query params in dot-notation
 * Example: ?host=localhost&port=3050&database=/path/to/db.fdb
 */
function parseConfigFromQuery(query: any): void {
    if (query.host) {
        process.env.FIREBIRD_HOST = String(query.host);
        logger.info(`Config from query: FIREBIRD_HOST=${query.host}`);
    }
    
    if (query.port) {
        process.env.FIREBIRD_PORT = String(query.port);
        logger.info(`Config from query: FIREBIRD_PORT=${query.port}`);
    }
    
    if (query.database) {
        process.env.FIREBIRD_DATABASE = String(query.database);
        logger.info(`Config from query: FIREBIRD_DATABASE=${query.database}`);
    }
    
    if (query.user) {
        process.env.FIREBIRD_USER = String(query.user);
        logger.info(`Config from query: FIREBIRD_USER=${query.user}`);
    }
    
    if (query.password) {
        process.env.FIREBIRD_PASSWORD = String(query.password);
        logger.info('Config from query: FIREBIRD_PASSWORD=***');
    }
    
    if (query.useNativeDriver !== undefined) {
        process.env.USE_NATIVE_DRIVER = String(query.useNativeDriver);
        logger.info(`Config from query: USE_NATIVE_DRIVER=${query.useNativeDriver}`);
    }
    
    if (query.logLevel) {
        process.env.LOG_LEVEL = String(query.logLevel);
        logger.info(`Config from query: LOG_LEVEL=${query.logLevel}`);
    }
}

/**
 * Main function to start the HTTP server
 */
async function startHttpServer() {
    logger.info(`Starting MCP Firebird HTTP Server v${pkg.version}`);
    logger.info(`Platform: ${process.platform}, Node.js: ${process.version}`);
    
    try {
        // Get port from environment (Smithery sets PORT variable)
        const port = parseInt(process.env.PORT || process.env.SSE_PORT || '3003', 10);
        
        logger.info(`Configuring HTTP server on port ${port}...`);
        
        // Create Express app
        const app = express();
        
        // Enable CORS for web clients
        app.use(cors({
            origin: '*',
            methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization'],
            credentials: true
        }));
        
        // Parse JSON bodies
        app.use(express.json());
        
        // Parse URL-encoded bodies (for query parameters)
        app.use(express.urlencoded({ extended: true }));
        
        // Middleware to parse config from query parameters (Smithery)
        app.use((req, res, next) => {
            if (Object.keys(req.query).length > 0) {
                logger.debug('Parsing configuration from query parameters...');
                parseConfigFromQuery(req.query);
            }
            next();
        });
        
        // Root endpoint - health check
        app.get('/', (req, res) => {
            res.json({
                name: pkg.name,
                version: pkg.version,
                status: 'running',
                protocol: 'Streamable HTTP',
                endpoints: {
                    mcp: '/mcp',
                    health: '/health',
                    sse: '/sse'
                },
                platform: process.platform,
                nodeVersion: process.version
            });
        });
        
        // Health check endpoint
        app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                version: pkg.version
            });
        });
        
        // Create MCP server instance factory
        logger.info('Creating MCP server factory...');

        const createServerInstance = async (): Promise<McpServer> => {
            logger.info('Creating new MCP server instance...');

            // Initialize security
            await initSecurity();

            // Create server
            const server = new McpServer({
                name: pkg.name,
                version: pkg.version
            });

            // Register tools
            const registerTool = (name: string, toolDef: DbToolDefinition | MetaToolDefinition | SimpleToolDefinition) => {
                const schema = toolDef.inputSchema || z.object({});
                server.tool(
                    name,
                    toolDef.description || name,
                    schema,
                    async (params) => {
                        try {
                            const result = await toolDef.handler(params);

                            if (typeof result === 'object' && result !== null) {
                                if ('success' in result && result.success === false) {
                                    return {
                                        content: [{ type: "text", text: JSON.stringify(result) }],
                                        isError: true
                                    };
                                }

                                if ('content' in result && Array.isArray(result.content)) {
                                    return result;
                                }
                            }

                            return {
                                content: [{ type: "text", text: JSON.stringify(result) }]
                            };
                        } catch (error) {
                            logger.error(`Error executing tool ${name}:`, error);
                            const message = error instanceof Error ? error.message : 'Unknown error';
                            return {
                                content: [{ type: "text", text: `Error: ${message}` }],
                                isError: true
                            };
                        }
                    }
                );
            };

            // Setup all tools
            const dbTools = setupDatabaseTools();
            Object.entries(dbTools).forEach(([name, toolDef]) => registerTool(name, toolDef));

            const metaTools = setupMetadataTools();
            Object.entries(metaTools).forEach(([name, toolDef]) => registerTool(name, toolDef));

            const simpleTools = setupSimpleTools();
            Object.entries(simpleTools).forEach(([name, toolDef]) => registerTool(name, toolDef));

            // Register prompts
            const dbPrompts = setupDatabasePrompts();
            Object.entries(dbPrompts).forEach(([name, promptDef]) => {
                server.prompt(
                    name,
                    promptDef.description || name,
                    promptDef.arguments || [],
                    async (params) => await promptDef.handler(params)
                );
            });

            const sqlPrompts = setupSqlPrompts();
            Object.entries(sqlPrompts).forEach(([name, promptDef]) => {
                server.prompt(
                    name,
                    promptDef.description || name,
                    promptDef.arguments || [],
                    async (params) => await promptDef.handler(params)
                );
            });

            // Register resources
            const resources = setupDatabaseResources();
            Object.entries(resources).forEach(([uri, resourceDef]) => {
                server.resource(
                    uri,
                    resourceDef.name,
                    resourceDef.description || '',
                    resourceDef.mimeType || 'application/json',
                    async () => await resourceDef.handler()
                );
            });

            logger.info('MCP server instance created successfully');
            return server;
        };

        // Create and mount Streamable HTTP router (modern MCP protocol)
        logger.info('Creating Streamable HTTP router...');
        const streamableRouter = createStreamableHttpRouter(createServerInstance);
        app.use('/', streamableRouter);

        // Create and mount SSE router (legacy support)
        logger.info('Creating SSE router...');
        const sseRouter = createSseRouter(createServerInstance);
        app.use('/', sseRouter);
        
        // Error handling middleware
        app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
            logger.error('Express error:', {
                error: err.message,
                stack: err.stack,
                path: req.path,
                method: req.method
            });
            
            if (!res.headersSent) {
                res.status(500).json({
                    error: 'Internal server error',
                    message: err.message
                });
            }
        });
        
        // Start listening
        const server = app.listen(port, '0.0.0.0', () => {
            logger.info(`✅ MCP Firebird HTTP Server started successfully`);
            logger.info(`🌐 Listening on http://0.0.0.0:${port}`);
            logger.info(`📡 MCP endpoint: http://0.0.0.0:${port}/mcp`);
            logger.info(`❤️  Health check: http://0.0.0.0:${port}/health`);
            logger.info('');
            logger.info('Server is ready to accept connections!');
        });
        
        // Graceful shutdown
        const shutdown = async () => {
            logger.info('Shutting down HTTP server...');
            server.close(() => {
                logger.info('HTTP server closed');
                process.exit(0);
            });
            
            // Force shutdown after 10 seconds
            setTimeout(() => {
                logger.warn('Forcing shutdown...');
                process.exit(1);
            }, 10000);
        };
        
        process.on('SIGTERM', shutdown);
        process.on('SIGINT', shutdown);
        
    } catch (error) {
        logger.error('Failed to start HTTP server:', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        });
        process.exit(1);
    }
}

// Start the server
startHttpServer().catch(error => {
    logger.error('Fatal error:', error);
    process.exit(1);
});

