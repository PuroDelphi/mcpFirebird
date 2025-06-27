/**
 * SSE (Server-Sent Events) transport implementation for MCP Firebird
 * Updated to follow latest MCP TypeScript SDK best practices
 * Supports session management, proper cleanup, error handling, and legacy client compatibility
 */

import express from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('server:sse');

interface SessionInfo {
    transport: SSEServerTransport;
    createdAt: Date;
    lastActivity: Date;
}

/**
 * Enhanced SSE router for legacy MCP clients with improved session management
 * @param server Instancia de McpServer
 * @returns Router Express listo para montar
 */
export function createSseRouter(_createServerInstance?: () => Promise<any>): express.Router {
    const router = express.Router();

    // Enhanced session storage with metadata
    const activeSessions: Record<string, SessionInfo> = {};

    // Configuration
    const SESSION_TIMEOUT_MS = parseInt(process.env.SSE_SESSION_TIMEOUT_MS || '1800000', 10); // 30 minutes
    const CLEANUP_INTERVAL_MS = 60000; // 1 minute

    // Periodic cleanup of expired sessions
    const cleanupInterval = setInterval(() => {
        const now = new Date();
        const expiredSessions = Object.entries(activeSessions)
            .filter(([_, info]) => now.getTime() - info.lastActivity.getTime() > SESSION_TIMEOUT_MS);

        for (const [sessionId, info] of expiredSessions) {
            logger.info(`Cleaning up expired session: ${sessionId}`);
            try {
                info.transport.close();
            } catch (error) {
                logger.warn(`Error closing expired session ${sessionId}:`, { error });
            }
            delete activeSessions[sessionId];
        }

        if (expiredSessions.length > 0) {
            logger.info(`Cleaned up ${expiredSessions.length} expired sessions`);
        }
    }, CLEANUP_INTERVAL_MS);

    // Health check endpoint
    router.get('/health', (req, res) => {
        res.json({
            status: 'healthy',
            activeSessions: Object.keys(activeSessions).length,
            uptime: process.uptime()
        });
    });

    // Main SSE endpoint with improved error handling
    router.get('/sse', async (req, res) => {
        logger.info('New SSE connection request');

        try {
            // Set proper SSE headers before creating transport
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Cache-Control'
            });

            // Create SSE transport
            const transport = new SSEServerTransport('/messages', res);
            const sessionId = transport.sessionId;

            logger.info(`Created SSE transport with session ID: ${sessionId}`);

            // Store session info
            activeSessions[sessionId] = {
                transport,
                createdAt: new Date(),
                lastActivity: new Date()
            };

            // Enhanced cleanup on connection close
            res.on('close', () => {
                logger.info(`SSE connection closed for session: ${sessionId}`);
                if (activeSessions[sessionId]) {
                    try {
                        activeSessions[sessionId].transport.close();
                    } catch (error) {
                        logger.warn(`Error closing transport for session ${sessionId}:`, { error });
                    }
                    delete activeSessions[sessionId];
                }
            });

            res.on('error', (error) => {
                logger.error(`SSE connection error for session ${sessionId}:`, { error });
                if (activeSessions[sessionId]) {
                    delete activeSessions[sessionId];
                }
            });

            // Connect server to transport
            // Note: Server connection will be handled by the transport itself
            logger.info(`SSE transport created for session: ${sessionId}`);

        } catch (error) {
            logger.error('Error establishing SSE connection:', { error });
            if (!res.headersSent) {
                res.status(500).json({
                    jsonrpc: '2.0',
                    error: {
                        code: -32603,
                        message: 'Internal server error establishing SSE connection'
                    },
                    id: null
                });
            } else if (!res.writableEnded) {
                res.end();
            }
        }
    });

    // Enhanced POST messages endpoint with better error handling
    router.post('/messages', async (req, res) => {
        const sessionId = req.query.sessionId as string;

        if (!sessionId) {
            logger.warn('POST /messages called without sessionId');
            res.status(400).json({
                jsonrpc: '2.0',
                error: {
                    code: -32602,
                    message: 'Missing sessionId parameter'
                },
                id: null
            });
            return;
        }

        const sessionInfo = activeSessions[sessionId];
        if (!sessionInfo) {
            logger.warn(`POST /messages called with unknown sessionId: ${sessionId}`);
            res.status(404).json({
                jsonrpc: '2.0',
                error: {
                    code: -32001,
                    message: 'Session not found'
                },
                id: null
            });
            return;
        }

        try {
            // Update last activity
            sessionInfo.lastActivity = new Date();

            // Handle the message
            await sessionInfo.transport.handlePostMessage(req, res, req.body);
            logger.debug(`Handled POST message for session: ${sessionId}`);

        } catch (error) {
            logger.error(`Error handling POST message for session ${sessionId}:`, { error });
            if (!res.headersSent) {
                res.status(500).json({
                    jsonrpc: '2.0',
                    error: {
                        code: -32603,
                        message: 'Internal server error handling message'
                    },
                    id: null
                });
            }
        }
    });

    // Cleanup function for graceful shutdown
    (router as any).cleanup = () => {
        logger.info('Cleaning up SSE router...');
        clearInterval(cleanupInterval);

        // Close all active sessions
        for (const [sessionId, info] of Object.entries(activeSessions)) {
            try {
                info.transport.close();
            } catch (error) {
                logger.warn(`Error closing session ${sessionId} during cleanup:`, { error });
            }
        }

        // Clear sessions
        Object.keys(activeSessions).forEach(key => delete activeSessions[key]);
        logger.info('SSE router cleanup completed');
    };

    return router;
}
