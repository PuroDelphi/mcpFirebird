/**
 * Unified MCP Server Implementation
 * Supports both SSE (legacy) and Streamable HTTP (modern) protocols
 * Provides backwards compatibility while enabling modern features
 */

import express from 'express';
import cors from 'cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createSseRouter } from './sse.js';
import { createStreamableHttpRouter } from './streamable-http.js';
import { SessionManager } from '../utils/session-manager.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('server:unified');

export interface UnifiedServerConfig {
    port?: number;
    enableSSE?: boolean;
    enableStreamableHttp?: boolean;
    corsOptions?: cors.CorsOptions;
    sessionConfig?: {
        sessionTimeoutMs?: number;
        cleanupIntervalMs?: number;
        maxSessions?: number;
    };
}

/**
 * Creates a unified server that supports both SSE and Streamable HTTP protocols
 */
export class UnifiedMcpServer {
    private app: express.Application;
    private server: any;
    private sessionManager: SessionManager;
    private config: Required<UnifiedServerConfig>;
    private sseRouter: any;
    private streamableRouter: any;

    constructor(
        private createServerInstance: () => McpServer,
        config: UnifiedServerConfig = {}
    ) {
        this.config = {
            port: config.port || 3003,
            enableSSE: config.enableSSE ?? true,
            enableStreamableHttp: config.enableStreamableHttp ?? true,
            corsOptions: config.corsOptions || {
                origin: '*',
                methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
                allowedHeaders: ['Content-Type', 'mcp-session-id', 'Cache-Control'],
                credentials: false
            },
            sessionConfig: config.sessionConfig || {}
        };

        this.app = express();
        this.sessionManager = new SessionManager(this.config.sessionConfig);
        
        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
    }

    /**
     * Sets up Express middleware
     */
    private setupMiddleware(): void {
        // CORS support
        this.app.use(cors(this.config.corsOptions));
        
        // JSON parsing
        this.app.use(express.json({ limit: '10mb' }));
        
        // Request logging
        this.app.use((req, res, next) => {
            logger.debug(`${req.method} ${req.path}`, {
                headers: req.headers,
                query: req.query
            });
            next();
        });

        // Health check middleware
        this.app.use('/health', (req, res) => {
            const sessionMetrics = this.sessionManager.getMetrics();
            res.json({
                status: 'healthy',
                protocols: {
                    sse: this.config.enableSSE,
                    streamableHttp: this.config.enableStreamableHttp
                },
                sessions: sessionMetrics,
                uptime: process.uptime(),
                timestamp: new Date().toISOString()
            });
        });
    }

    /**
     * Sets up routing for different protocols
     */
    private setupRoutes(): void {
        // Root endpoint with protocol information
        this.app.get('/', (req, res) => {
            res.json({
                name: 'MCP Firebird Unified Server',
                protocols: {
                    sse: {
                        enabled: this.config.enableSSE,
                        endpoint: '/sse',
                        messagesEndpoint: '/messages'
                    },
                    streamableHttp: {
                        enabled: this.config.enableStreamableHttp,
                        endpoint: '/mcp'
                    }
                },
                documentation: 'https://github.com/PuroDelphi/mcpFirebird'
            });
        });

        // SSE Protocol Support (Legacy)
        if (this.config.enableSSE) {
            logger.info('Enabling SSE protocol support');
            this.sseRouter = createSseRouter(this.createServerInstance());
            this.app.use('/', this.sseRouter);
        }

        // Streamable HTTP Protocol Support (Modern)
        if (this.config.enableStreamableHttp) {
            logger.info('Enabling Streamable HTTP protocol support');
            this.streamableRouter = createStreamableHttpRouter(this.createServerInstance);
            this.app.use('/', this.streamableRouter);
        }

        // Backwards compatibility endpoint that tries to detect protocol
        this.app.all('/mcp-auto', async (req, res) => {
            try {
                await this.handleAutoProtocolDetection(req, res);
            } catch (error) {
                logger.error('Error in auto protocol detection:', { error });
                res.status(500).json({
                    jsonrpc: '2.0',
                    error: {
                        code: -32603,
                        message: 'Internal server error in protocol detection'
                    },
                    id: null
                });
            }
        });
    }

    /**
     * Handles automatic protocol detection for backwards compatibility
     */
    private async handleAutoProtocolDetection(req: express.Request, res: express.Response): Promise<void> {
        const userAgent = req.headers['user-agent'] || '';
        const acceptHeader = req.headers['accept'] || '';
        const contentType = req.headers['content-type'] || '';

        // Detect if this looks like an SSE request
        if (req.method === 'GET' && acceptHeader.includes('text/event-stream')) {
            logger.info('Auto-detected SSE protocol request');
            if (this.config.enableSSE && this.sseRouter) {
                // Redirect to SSE endpoint
                res.redirect('/sse');
                return;
            } else {
                res.status(503).json({
                    jsonrpc: '2.0',
                    error: {
                        code: -32000,
                        message: 'SSE protocol not enabled'
                    },
                    id: null
                });
                return;
            }
        }

        // Detect if this looks like a Streamable HTTP request
        if (req.method === 'POST' && contentType.includes('application/json')) {
            logger.info('Auto-detected Streamable HTTP protocol request');
            if (this.config.enableStreamableHttp && this.streamableRouter) {
                // Forward to Streamable HTTP handler
                req.url = '/mcp';
                this.streamableRouter.handle(req, res);
                return;
            } else {
                res.status(503).json({
                    jsonrpc: '2.0',
                    error: {
                        code: -32000,
                        message: 'Streamable HTTP protocol not enabled'
                    },
                    id: null
                });
                return;
            }
        }

        // Default response for unrecognized requests
        res.status(400).json({
            jsonrpc: '2.0',
            error: {
                code: -32602,
                message: 'Unable to detect protocol. Use /sse for SSE or /mcp for Streamable HTTP'
            },
            id: null
        });
    }

    /**
     * Sets up error handling
     */
    private setupErrorHandling(): void {
        // 404 handler
        this.app.use('*', (req, res) => {
            res.status(404).json({
                jsonrpc: '2.0',
                error: {
                    code: -32601,
                    message: `Method not found: ${req.method} ${req.originalUrl}`
                },
                id: null
            });
        });

        // Global error handler
        this.app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
            logger.error('Unhandled error in unified server:', err);
            
            if (!res.headersSent) {
                res.status(500).json({
                    jsonrpc: '2.0',
                    error: {
                        code: -32603,
                        message: 'Internal server error'
                    },
                    id: null
                });
            }
        });
    }

    /**
     * Starts the unified server
     */
    async start(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                this.server = this.app.listen(this.config.port, () => {
                    logger.info(`Unified MCP server listening on port ${this.config.port}`);
                    logger.info(`Protocols enabled: SSE=${this.config.enableSSE}, StreamableHTTP=${this.config.enableStreamableHttp}`);
                    resolve();
                });

                this.server.on('error', (error: any) => {
                    logger.error('Server error:', { error });
                    reject(error);
                });

            } catch (error) {
                logger.error('Failed to start unified server:', { error });
                reject(error);
            }
        });
    }

    /**
     * Stops the unified server gracefully
     */
    async stop(): Promise<void> {
        logger.info('Stopping unified MCP server...');

        // Cleanup routers
        if (this.sseRouter && typeof this.sseRouter.cleanup === 'function') {
            this.sseRouter.cleanup();
        }
        
        if (this.streamableRouter && typeof this.streamableRouter.cleanup === 'function') {
            this.streamableRouter.cleanup();
        }

        // Shutdown session manager
        await this.sessionManager.shutdown();

        // Close HTTP server
        if (this.server) {
            return new Promise((resolve) => {
                this.server.close(() => {
                    logger.info('Unified MCP server stopped');
                    resolve();
                });
            });
        }
    }

    /**
     * Gets server metrics
     */
    getMetrics() {
        return {
            sessions: this.sessionManager.getMetrics(),
            config: {
                port: this.config.port,
                protocols: {
                    sse: this.config.enableSSE,
                    streamableHttp: this.config.enableStreamableHttp
                }
            },
            uptime: process.uptime()
        };
    }
}
