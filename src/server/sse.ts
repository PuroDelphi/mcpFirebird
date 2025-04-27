/**
 * SSE (Server-Sent Events) transport implementation for the MCP Firebird server
 * This allows clients to connect to the server using SSE instead of stdio
 *
 * Enhanced with proxy support to allow connections through an SSE proxy
 */

import express from 'express';
import cors from 'cors';
import { createLogger } from '../utils/logger.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { TransportError, ErrorTypes } from '../utils/errors.js';

const logger = createLogger('server:sse');

/**
 * Interface for session information
 */
interface SessionInfo {
    id: string;
    transport: SSEServerTransport;
    createdAt: Date;
    lastActivity: Date;
    isProxy?: boolean;         // Indicates if this session is from a proxy
    proxyClientId?: string;    // The client ID provided by the proxy
}

/**
 * Session manager for SSE connections
 */
class SessionManager {
    private sessions: Map<string, SessionInfo> = new Map();
    private readonly sessionTimeout: number;
    private cleanupInterval: NodeJS.Timeout | null = null;

    /**
     * Create a new session manager
     * @param sessionTimeoutMs - Session timeout in milliseconds (default: 30 minutes)
     */
    constructor(sessionTimeoutMs: number = 30 * 60 * 1000) {
        this.sessionTimeout = sessionTimeoutMs;
        this.startCleanupInterval();
    }

    /**
     * Start the cleanup interval to remove expired sessions
     */
    private startCleanupInterval(): void {
        // Clean up expired sessions every minute
        this.cleanupInterval = setInterval(() => this.cleanupExpiredSessions(), 60 * 1000);
    }

    /**
     * Stop the cleanup interval
     */
    public stopCleanupInterval(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }

    /**
     * Clean up expired sessions
     */
    private cleanupExpiredSessions(): void {
        const now = new Date();
        const expiredSessionIds: string[] = [];

        this.sessions.forEach((session, id) => {
            const timeSinceLastActivity = now.getTime() - session.lastActivity.getTime();
            if (timeSinceLastActivity > this.sessionTimeout) {
                expiredSessionIds.push(id);
            }
        });

        if (expiredSessionIds.length > 0) {
            logger.info(`Cleaning up ${expiredSessionIds.length} expired sessions`);
            expiredSessionIds.forEach(id => this.removeSession(id));
        }
    }

    /**
     * Create a new session
     * @param sessionId - Session ID
     * @param transport - SSE transport
     * @param options - Additional options for the session
     * @returns The created session
     */
    public createSession(sessionId: string, transport: SSEServerTransport, options?: { isProxy?: boolean, proxyClientId?: string }): SessionInfo {
        const now = new Date();
        const session: SessionInfo = {
            id: sessionId,
            transport,
            createdAt: now,
            lastActivity: now,
            isProxy: options?.isProxy || false,
            proxyClientId: options?.proxyClientId
        };

        this.sessions.set(sessionId, session);
        logger.info(`Created new session: ${sessionId}${session.isProxy ? ' (proxy)' : ''}${session.proxyClientId ? ` for client: ${session.proxyClientId}` : ''}`);
        return session;
    }

    /**
     * Get a session by ID
     * @param sessionId - Session ID
     * @returns The session or undefined if not found
     */
    public getSession(sessionId: string): SessionInfo | undefined {
        const session = this.sessions.get(sessionId);
        if (session) {
            // Update last activity time
            session.lastActivity = new Date();
        }
        return session;
    }

    /**
     * Get a session by proxy client ID
     * @param proxyClientId - Proxy client ID
     * @returns The session or undefined if not found
     */
    public getSessionByProxyClientId(proxyClientId: string): SessionInfo | undefined {
        for (const session of this.sessions.values()) {
            if (session.isProxy && session.proxyClientId === proxyClientId) {
                // Update last activity time
                session.lastActivity = new Date();
                return session;
            }
        }
        return undefined;
    }

    /**
     * Remove a session
     * @param sessionId - Session ID
     */
    public removeSession(sessionId: string): void {
        const session = this.sessions.get(sessionId);
        if (session) {
            // First remove the session from the map to prevent recursive calls
            this.sessions.delete(sessionId);
            logger.debug(`Removed session: ${sessionId}`);

            // Then try to close the transport
            try {
                if (session.transport) {
                    // Use a non-throwing approach to close the transport
                    Promise.resolve().then(() => {
                        try {
                            session.transport.close().catch(() => {
                                // Silently ignore errors during cleanup
                            });
                        } catch (e) {
                            // Silently ignore any errors
                        }
                    });
                }
            } catch (error) {
                // Silently ignore errors during cleanup
            }
        }
    }

    /**
     * Get the number of active sessions
     * @returns The number of active sessions
     */
    public getSessionCount(): number {
        return this.sessions.size;
    }

    /**
     * Get all active sessions
     * @returns All active sessions
     */
    public getAllSessions(): SessionInfo[] {
        return Array.from(this.sessions.values());
    }
}

/**
 * Create and start an SSE server
 * @param server - The MCP server instance (either Server or McpServer)
 * @param port - The port to listen on (default: 3003)
 * @returns The Express app and cleanup function
 */
export async function startSseServer(
    server: Server<any, any, any> | McpServer,
    port: number = 3003
): Promise<{ app: express.Application, cleanup: () => Promise<void> }> {
    const app = express();

    // Create session manager
    const sessionManager = new SessionManager(
        parseInt(process.env.SSE_SESSION_TIMEOUT_MS || '1800000', 10) // Default: 30 minutes
    );

    // Enable CORS
    app.use(cors({
        origin: '*',
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'X-Session-ID', 'Authorization']
    }));

    // Parse JSON bodies
    app.use(express.json());

    // SSE endpoint - both root and /sse path
    const handleSseRequest = async (req: express.Request, res: express.Response) => {
        try {
            // Check for proxy-specific headers
            const isProxy = req.headers['x-mcp-proxy'] === 'true';
            const proxyClientId = req.headers['x-proxy-client-id']?.toString();

            // Generate or use provided session ID
            const sessionId = req.query.sessionId?.toString() ||
                              req.headers['x-session-id']?.toString() ||
                              `session-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

            logger.info(`New SSE connection request received from ${req.url}`, {
                sessionId,
                isProxy,
                proxyClientId
            });

            // Set headers for SSE (must be set before creating the transport)
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache, no-transform');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders();

            // Create a new SSE transport with enhanced options
            const transport = new SSEServerTransport('/message', res, {
                // Add additional options for better compatibility
                keepAlive: true,
                keepAliveInterval: 30000, // 30 seconds
                sessionId: sessionId
            });

            // Create a new session with proxy information if applicable
            sessionManager.createSession(sessionId, transport, { isProxy, proxyClientId });

            // Connect the transport to the server
            await server.connect(transport);

            // Send the endpoint event after connecting to the server
            // This is important because the client waits for this event to start sending messages
            const endpointUrl = `/message?sessionId=${sessionId}`;
            res.write(`event: endpoint\ndata: ${encodeURI(endpointUrl)}\n\n`);

            logger.info(`SSE transport connected to server for session ${sessionId}${isProxy ? ' (proxy)' : ''}${proxyClientId ? ` for client: ${proxyClientId}` : ''}`);

            // Handle client disconnect
            req.on('close', () => {
                logger.info(`Client disconnected for session ${sessionId}${isProxy ? ' (proxy)' : ''}${proxyClientId ? ` for client: ${proxyClientId}` : ''}`);
                sessionManager.removeSession(sessionId);
            });

            // Note: We're using the built-in keepAlive functionality of SSEServerTransport
            // but we'll keep a reference to check if the connection is still alive
            const keepAliveInterval = setInterval(() => {
                if (res.writableEnded) {
                    clearInterval(keepAliveInterval);
                    return;
                }
                // We don't need to send keepalive manually anymore
                // Just check if the connection is still alive
                if (!sessionManager.getSession(sessionId)) {
                    clearInterval(keepAliveInterval);
                }
            }, 30000);

            // Set up cleanup on server close
            // Handle both Server and McpServer instances
            if ('onclose' in server) {
                // Legacy Server class
                server.onclose = async () => {
                    logger.info('Server closing, cleaning up all SSE sessions');

                    // Get all session IDs first to avoid modifying the collection while iterating
                    const sessionIds = [...sessionManager.getAllSessions().map(session => session.id)];

                    // Stop the cleanup interval first
                    sessionManager.stopCleanupInterval();

                    // Close all active sessions
                    for (const sessionId of sessionIds) {
                        try {
                            sessionManager.removeSession(sessionId);
                        } catch (error) {
                            // Silently ignore errors during cleanup
                        }
                    }
                };
            } else {
                // Modern McpServer class
                server.on('close', async () => {
                    logger.info('McpServer closing, cleaning up all SSE sessions');

                    // Get all session IDs first to avoid modifying the collection while iterating
                    const sessionIds = [...sessionManager.getAllSessions().map(session => session.id)];

                    // Stop the cleanup interval first
                    sessionManager.stopCleanupInterval();

                    // Close all active sessions
                    for (const sessionId of sessionIds) {
                        try {
                            sessionManager.removeSession(sessionId);
                        } catch (error) {
                            // Silently ignore errors during cleanup
                        }
                    }
                });
            }
        } catch (error: any) {
            const errorMessage = `Error establishing SSE connection: ${error.message}`;
            logger.error(errorMessage, { error });

            // Only send a response if headers haven't been sent yet
            if (!res.headersSent) {
                res.status(500).send({
                    error: 'Failed to establish SSE connection',
                    message: error.message
                });
            }
        }
    };

    // Register the handler for both root and /sse paths
    app.get('/', handleSseRequest);
    app.get('/sse', handleSseRequest);

    // Message endpoint for client-to-server communication
    app.post('/message', async (req: express.Request, res: express.Response) => {
        try {
            // Check for proxy-specific headers
            const isProxy = req.headers['x-mcp-proxy'] === 'true';
            const proxyClientId = req.headers['x-proxy-client-id']?.toString();

            // Get session ID from query parameter or header
            const sessionId = req.query.sessionId?.toString() || req.headers['x-session-id']?.toString();

            if (!sessionId) {
                throw new TransportError('Session ID is required', ErrorTypes.TRANSPORT_PROTOCOL);
            }

            logger.debug(`Received message from client for session ${sessionId}${isProxy ? ' (proxy)' : ''}${proxyClientId ? ` for client: ${proxyClientId}` : ''}`);

            // Get the session - try different methods based on the request type
            let session: SessionInfo | undefined;

            if (isProxy && proxyClientId) {
                // If this is a proxy request with a client ID, try to find the session by proxy client ID first
                session = sessionManager.getSessionByProxyClientId(proxyClientId);

                // If not found by proxy client ID, fall back to session ID
                if (!session) {
                    session = sessionManager.getSession(sessionId);
                }
            } else {
                // Standard request - get by session ID
                session = sessionManager.getSession(sessionId);
            }

            if (!session) {
                throw new TransportError(`No active session found for ID: ${sessionId}${proxyClientId ? ` or proxy client ID: ${proxyClientId}` : ''}`, ErrorTypes.TRANSPORT_CONNECTION);
            }

            // Update last activity timestamp
            session.lastActivity = new Date();

            // Handle the message
            await session.transport.handlePostMessage(req, res);
        } catch (error: any) {
            const errorMessage = `Error handling message: ${error.message}`;
            logger.error(errorMessage, { error });

            // Only send a response if headers haven't been sent yet
            if (!res.headersSent) {
                res.status(error instanceof TransportError ? 400 : 500).send({
                    jsonrpc: '2.0',
                    id: req.body?.id,
                    error: {
                        code: -32603,
                        message: error.message || 'Internal server error',
                        data: error instanceof TransportError ? { type: error.type } : undefined
                    }
                });
            }
        }
    });

    // Health check endpoint
    app.get('/health', (req: express.Request, res: express.Response) => {
        res.status(200).send({
            status: 'ok',
            activeSessions: sessionManager.getSessionCount(),
            serverVersion: process.env.npm_package_version || 'unknown'
        });
    });

    // Sessions info endpoint (for debugging/monitoring)
    app.get('/sessions', (req: express.Request, res: express.Response) => {
        const sessions = sessionManager.getAllSessions().map(session => ({
            id: session.id,
            createdAt: session.createdAt,
            lastActivity: session.lastActivity,
            isProxy: session.isProxy || false,
            proxyClientId: session.proxyClientId || null
        }));

        res.status(200).send({
            count: sessions.length,
            sessions
        });
    });

    // Proxy support endpoint - returns information about proxy support
    app.get('/proxy-support', (req: express.Request, res: express.Response) => {
        res.status(200).send({
            supported: true,
            version: process.env.npm_package_version || 'unknown',
            features: [
                'session-tracking',
                'client-id-mapping',
                'proxy-headers'
            ]
        });
    });

    // Start the server
    const httpServer = app.listen(port, () => {
        logger.info(`SSE server listening on port ${port}`);
    });

    // Cleanup function
    const cleanup = async (): Promise<void> => {
        return new Promise((resolve) => {
            // Stop the session cleanup interval
            sessionManager.stopCleanupInterval();

            // Get all session IDs first to avoid modifying the collection while iterating
            const sessionIds = [...sessionManager.getAllSessions().map(session => session.id)];

            // Close all active sessions
            for (const sessionId of sessionIds) {
                try {
                    sessionManager.removeSession(sessionId);
                } catch (error) {
                    // Silently ignore errors during cleanup
                }
            }

            // Close the HTTP server
            httpServer.close(() => {
                logger.info('SSE server closed');
                resolve();
            });
        });
    };

    return { app, cleanup };
}
