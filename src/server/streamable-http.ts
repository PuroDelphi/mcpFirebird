/**
 * Streamable HTTP transport implementation for MCP Firebird
 * Implements the modern MCP protocol (2025-03-26) with session management
 * and backwards compatibility support
 */

import express from 'express';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('server:streamable-http');

interface SessionInfo {
    transport: StreamableHTTPServerTransport;
    server: McpServer;
    createdAt: Date;
    lastActivity: Date;
}

/**
 * Creates a Streamable HTTP router for modern MCP clients
 * @param createServerInstance Function to create a new McpServer instance
 * @returns Express router configured for Streamable HTTP
 */
export function createStreamableHttpRouter(createServerInstance: () => Promise<McpServer>): express.Router {
    const router = express.Router();

    // Session storage for stateful mode
    const activeSessions: Record<string, SessionInfo> = {};

    // Configuration
    const SESSION_TIMEOUT_MS = parseInt(process.env.STREAMABLE_SESSION_TIMEOUT_MS || '1800000', 10); // 30 minutes
    const CLEANUP_INTERVAL_MS = 60000; // 1 minute
    // Default to stateless mode for better compatibility with MCP Inspector and most clients
    // Set STREAMABLE_STATELESS_MODE=false to enable stateful mode (requires proper session management)
    const STATELESS_MODE = process.env.STREAMABLE_STATELESS_MODE !== 'false';

    logger.info(`Streamable HTTP router initialized in ${STATELESS_MODE ? 'stateless' : 'stateful'} mode`);

    // Periodic cleanup of expired sessions (only in stateful mode)
    let cleanupInterval: NodeJS.Timeout | null = null;
    if (!STATELESS_MODE) {
        cleanupInterval = setInterval(() => {
            const now = new Date();
            const expiredSessions = Object.entries(activeSessions)
                .filter(([_, info]) => now.getTime() - info.lastActivity.getTime() > SESSION_TIMEOUT_MS);

            for (const [sessionId, info] of expiredSessions) {
                logger.info(`Cleaning up expired session: ${sessionId}`);
                try {
                    info.transport.close();
                    info.server.close();
                } catch (error) {
                    logger.warn(`Error closing expired session ${sessionId}:`, { error });
                }
                delete activeSessions[sessionId];
            }

            if (expiredSessions.length > 0) {
                logger.info(`Cleaned up ${expiredSessions.length} expired sessions`);
            }
        }, CLEANUP_INTERVAL_MS);
    }

    // Health check endpoint
    router.get('/health', (req, res) => {
        res.json({
            status: 'healthy',
            mode: STATELESS_MODE ? 'stateless' : 'stateful',
            activeSessions: STATELESS_MODE ? 'N/A' : Object.keys(activeSessions).length,
            uptime: process.uptime()
        });
    });

    // Main MCP endpoint - handles POST requests for client-to-server communication
    router.post('/mcp', async (req, res) => {
        logger.debug('Received POST request to /mcp');

        try {
            if (STATELESS_MODE) {
                // Stateless mode: create new instances for each request
                await handleStatelessRequest(req, res, createServerInstance);
            } else {
                // Stateful mode: manage sessions
                await handleStatefulRequest(req, res, createServerInstance, activeSessions);
            }
        } catch (error) {
            logger.error('Error handling MCP request:', { error });
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

    // Handle GET requests for server-to-client notifications via SSE (stateful mode only)
    router.get('/mcp', async (req, res) => {
        if (STATELESS_MODE) {
            logger.warn('GET request to /mcp in stateless mode');
            res.status(405).json({
                jsonrpc: "2.0",
                error: {
                    code: -32000,
                    message: "Method not allowed in stateless mode."
                },
                id: null
            });
            return;
        }

        const sessionId = req.headers['mcp-session-id'] as string | undefined;
        if (!sessionId || !activeSessions[sessionId]) {
            res.status(400).json({
                jsonrpc: "2.0",
                error: {
                    code: -32602,
                    message: "Invalid or missing session ID"
                },
                id: null
            });
            return;
        }

        const sessionInfo = activeSessions[sessionId];
        sessionInfo.lastActivity = new Date();

        try {
            await sessionInfo.transport.handleRequest(req, res);
        } catch (error) {
            logger.error(`Error handling GET request for session ${sessionId}:`, { error });
            if (!res.headersSent) {
                res.status(500).json({
                    jsonrpc: "2.0",
                    error: {
                        code: -32603,
                        message: "Internal server error"
                    },
                    id: null
                });
            }
        }
    });

    // Main MCP endpoint - handles POST requests for client-to-server communication
    router.post('/mcp', async (req, res) => {
        logger.debug('Received POST request to /mcp');

        try {
            if (STATELESS_MODE) {
                // Stateless mode: create new instances for each request
                await handleStatelessRequest(req, res, createServerInstance);
            } else {
                // Stateful mode: manage sessions
                await handleStatefulRequest(req, res, createServerInstance, activeSessions);
            }
        } catch (error) {
            logger.error('Error handling MCP request:', { error });
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

    // Handle GET requests for server-to-client notifications via SSE (stateful mode only)
    router.get('/mcp', async (req, res) => {
        if (STATELESS_MODE) {
            logger.warn('GET request to /mcp in stateless mode');
            res.status(405).json({
                jsonrpc: "2.0",
                error: {
                    code: -32000,
                    message: "Method not allowed in stateless mode."
                },
                id: null
            });
            return;
        }

        const sessionId = req.headers['mcp-session-id'] as string | undefined;
        if (!sessionId || !activeSessions[sessionId]) {
            res.status(400).json({
                jsonrpc: "2.0",
                error: {
                    code: -32602,
                    message: "Invalid or missing session ID"
                },
                id: null
            });
            return;
        }
        
        const sessionInfo = activeSessions[sessionId];
        sessionInfo.lastActivity = new Date();
        
        try {
            await sessionInfo.transport.handleRequest(req, res);
        } catch (error) {
            logger.error(`Error handling GET request for session ${sessionId}:`, { error });
            if (!res.headersSent) {
                res.status(500).json({
                    jsonrpc: "2.0",
                    error: {
                        code: -32603,
                        message: "Internal server error"
                    },
                    id: null
                });
            }
        }
    });

    // Handle DELETE requests for session termination (stateful mode only)
    router.delete('/mcp', async (req, res) => {
        if (STATELESS_MODE) {
            logger.warn('DELETE request to /mcp in stateless mode');
            res.status(405).json({
                jsonrpc: "2.0",
                error: {
                    code: -32000,
                    message: "Method not allowed in stateless mode."
                },
                id: null
            });
            return;
        }

        const sessionId = req.headers['mcp-session-id'] as string | undefined;
        if (!sessionId || !activeSessions[sessionId]) {
            res.status(400).json({
                jsonrpc: "2.0",
                error: {
                    code: -32602,
                    message: "Invalid or missing session ID"
                },
                id: null
            });
            return;
        }
        
        const sessionInfo = activeSessions[sessionId];
        
        try {
            await sessionInfo.transport.handleRequest(req, res);
            
            // Clean up session after handling the DELETE request
            setTimeout(() => {
                if (activeSessions[sessionId]) {
                    logger.info(`Terminating session: ${sessionId}`);
                    try {
                        sessionInfo.transport.close();
                        sessionInfo.server.close();
                    } catch (error) {
                        logger.warn(`Error closing session ${sessionId}:`, { error });
                    }
                    delete activeSessions[sessionId];
                }
            }, 100); // Small delay to ensure response is sent
            
        } catch (error) {
            logger.error(`Error handling DELETE request for session ${sessionId}:`, { error });
            if (!res.headersSent) {
                res.status(500).json({
                    jsonrpc: "2.0",
                    error: {
                        code: -32603,
                        message: "Internal server error"
                    },
                    id: null
                });
            }
        }
    });

    // Cleanup function for graceful shutdown
    (router as any).cleanup = () => {
        logger.info('Cleaning up Streamable HTTP router...');
        
        if (cleanupInterval) {
            clearInterval(cleanupInterval);
        }
        
        // Close all active sessions
        for (const [sessionId, info] of Object.entries(activeSessions)) {
            try {
                info.transport.close();
                info.server.close();
            } catch (error) {
                logger.warn(`Error closing session ${sessionId} during cleanup:`, { error });
            }
        }
        
        // Clear sessions
        Object.keys(activeSessions).forEach(key => delete activeSessions[key]);
        logger.info('Streamable HTTP router cleanup completed');
    };

    return router;
}

/**
 * Handles requests in stateless mode - creates new instances for each request
 */
async function handleStatelessRequest(
    req: express.Request,
    res: express.Response,
    createServerInstance: () => Promise<McpServer>
) {
    logger.debug('Handling request in stateless mode');

    const server = await createServerInstance();
    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // Disable session management
    });

    // Clean up on response close
    res.on('close', () => {
        logger.debug('Request closed, cleaning up stateless resources');
        try {
            transport.close();
            server.close();
        } catch (error) {
            logger.warn('Error cleaning up stateless resources:', { error });
        }
    });

    try {
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
    } catch (error) {
        logger.error('Error in stateless request handling:', { error });
        throw error;
    }
}

/**
 * Handles requests in stateful mode - manages sessions
 */
async function handleStatefulRequest(
    req: express.Request,
    res: express.Response,
    createServerInstance: () => Promise<McpServer>,
    activeSessions: Record<string, SessionInfo>
) {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let sessionInfo: SessionInfo;

    if (sessionId && activeSessions[sessionId]) {
        // Reuse existing session
        logger.debug(`Reusing existing session: ${sessionId}`);
        sessionInfo = activeSessions[sessionId];
        sessionInfo.lastActivity = new Date();
    } else if (!sessionId && isInitializeRequest(req.body)) {
        // New initialization request
        logger.debug('Creating new session for initialize request');

        const server = await createServerInstance();
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (newSessionId) => {
                logger.info(`Session initialized: ${newSessionId}`);
                // Store the session info
                activeSessions[newSessionId] = {
                    transport,
                    server,
                    createdAt: new Date(),
                    lastActivity: new Date()
                };
            }
        });

        // Clean up transport when closed
        transport.onclose = () => {
            if (transport.sessionId && activeSessions[transport.sessionId]) {
                logger.info(`Transport closed for session: ${transport.sessionId}`);
                try {
                    activeSessions[transport.sessionId].server.close();
                } catch (error) {
                    logger.warn(`Error closing server for session ${transport.sessionId}:`, { error });
                }
                delete activeSessions[transport.sessionId];
            }
        };

        sessionInfo = {
            transport,
            server,
            createdAt: new Date(),
            lastActivity: new Date()
        };

        try {
            await server.connect(transport);
        } catch (error) {
            logger.error('Error connecting server to transport:', { error });
            throw error;
        }
    } else {
        // Invalid request
        logger.warn('Invalid request: no valid session ID or initialize request');
        res.status(400).json({
            jsonrpc: '2.0',
            error: {
                code: -32602,
                message: 'Bad Request: No valid session ID provided or not an initialize request',
            },
            id: null,
        });
        return;
    }

    // Handle the request
    try {
        await sessionInfo.transport.handleRequest(req, res, req.body);
    } catch (error) {
        logger.error('Error handling stateful request:', { error });
        throw error;
    }
}
