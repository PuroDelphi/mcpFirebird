/**
 * SSE (Server-Sent Events) transport implementation for MCP Firebird
 * Updated to follow latest MCP TypeScript SDK best practices
 * Supports session management, proper cleanup, error handling, and legacy client compatibility
 */

import express from 'express';
import type { McpServer } from '@modelcontextprotocol/server';
import { SSEServerTransport } from '@modelcontextprotocol/server-legacy/sse';
import { createLogger } from '../utils/logger.js';
import { currentSecurityContext } from '../security/context.js';

const logger = createLogger('server:sse');

interface SessionInfo {
    owner: string;
    transport: SSEServerTransport;
    response: express.Response;
    server?: McpServer;
    ready: Promise<void>;
    connected: boolean;
    closed: boolean;
    closing?: Promise<void>;
    createdAt: Date;
    lastActivity: Date;
}

/**
 * Enhanced SSE router for legacy MCP clients with improved session management
 * @param server Instancia de McpServer
 * @returns Router Express listo para montar
 */
export type SseRouter = express.Router & { cleanup: () => Promise<void> };

export function createSseRouter(createServerInstance?: () => Promise<McpServer>): SseRouter {
    const router = express.Router() as SseRouter;
    let shuttingDown = false;
    const allSessions = new Set<SessionInfo>();

    // Add JSON parsing middleware to the router
    // This is crucial for parsing POST request bodies correctly
    router.use(express.json({ limit: '1mb' }));

    // Add text parsing for text/plain content type (fallback for some clients)
    router.use(express.text({ limit: '1mb', type: 'text/plain' }));

    // Add URL-encoded parsing for form data (optional but good practice)
    router.use(express.urlencoded({ extended: true, limit: '1mb' }));

    // Custom middleware to handle different content types and parsing edge cases
    router.use('/messages', (req, res, next) => {
        const contentType = req.headers['content-type'] || '';

        // If content-type is text/plain but body looks like JSON, try to parse it
        if (contentType.includes('text/plain') && typeof req.body === 'string') {
            try {
                const trimmedBody = req.body.trim();
                if ((trimmedBody.startsWith('{') && trimmedBody.endsWith('}')) ||
                    (trimmedBody.startsWith('[') && trimmedBody.endsWith(']'))) {
                    req.body = JSON.parse(trimmedBody);
                    logger.debug('Successfully parsed JSON from text/plain content');
                }
            } catch (error) {
                logger.warn('Failed to parse JSON from text/plain content:', { error: error instanceof Error ? error.message : String(error) });
                // Continue with original body
            }
        }

        // Validate that we have a proper object after parsing
        if (req.method === 'POST' && (!req.body || typeof req.body !== 'object')) {
            logger.warn('POST request body is not a valid object after parsing', {
                contentType,
                bodyType: typeof req.body
            });
        }

        next();
    });

    // Enhanced session storage with metadata
    const activeSessions = new Map<string, SessionInfo>();

    function closeSession(info: SessionInfo): Promise<void> {
        info.closed = true;
        activeSessions.delete(info.transport.sessionId);
        if (!info.closing) info.closing = Promise.resolve().then(async () => {
            if (!info.connected && !info.response.destroyed && !info.response.writableEnded) {
                if (!info.response.headersSent) info.response.status(503);
                info.response.end();
            }
            // A late factory result must be disposed too; never connect it after disconnect.
            await info.ready.catch(() => undefined);
            let serverCloseFailed = false;
            if (info.server) {
                try { await info.server.close(); }
                catch (error) { serverCloseFailed = true; logger.warn('Error closing SSE server', { error }); }
            }
            if (!info.connected || serverCloseFailed) {
                try { await info.transport.close(); }
                catch (error) { logger.warn('Error closing SSE transport', { error }); }
            }
            if (!info.response.destroyed && !info.response.writableEnded) info.response.end();
            allSessions.delete(info);
        });
        return info.closing;
    }

    // Configuration
    const SESSION_TIMEOUT_MS = parseInt(process.env.SSE_SESSION_TIMEOUT_MS || '1800000', 10); // 30 minutes
    const CLEANUP_INTERVAL_MS = 60000; // 1 minute

    // Periodic cleanup of expired sessions
    const cleanupInterval = setInterval(() => {
        const now = new Date();
        const expiredSessions = [...activeSessions.entries()]
            .filter(([_, info]) => now.getTime() - info.lastActivity.getTime() > SESSION_TIMEOUT_MS);

        for (const [sessionId, info] of expiredSessions) {
            logger.info(`Cleaning up expired session: ${sessionId}`);
            void closeSession(info);
        }

        if (expiredSessions.length > 0) {
            logger.info(`Cleaned up ${expiredSessions.length} expired sessions`);
        }
    }, CLEANUP_INTERVAL_MS);

    cleanupInterval.unref();

    // Health check endpoint
    router.get('/health', (req, res) => {
        res.json({
            status: 'healthy'
        });
    });

    // Do not open an SSE stream until a server factory is available.
    router.get('/sse', async (_req, res) => {
        if (shuttingDown) { res.status(503).json({ error: 'Server is shutting down' }); return; }
        if (!createServerInstance) { res.status(503).json({ error: 'An MCP server factory is required' }); return; }
        const transport = new SSEServerTransport('/messages', res);
        const info: SessionInfo = {
            owner: currentSecurityContext().sessionId, transport, response: res,
            ready: Promise.resolve(), connected: false, closed: false,
            createdAt: new Date(), lastActivity: new Date()
        };
        allSessions.add(info);
        activeSessions.set(transport.sessionId, info);
        // Install these before the factory or connect can yield.
        res.once('close', () => { void closeSession(info); });
        res.once('error', error => {
            logger.warn('SSE response failed', { error });
            void closeSession(info);
        });
        info.ready = Promise.resolve().then(async () => {
            info.server = await createServerInstance();
            if (info.closed || res.destroyed || res.writableEnded) return;
            res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
            await info.server.connect(transport);
            info.connected = true;
        });
        try {
            await info.ready;
            if (info.closed || res.destroyed) await closeSession(info);
        } catch (error) {
            logger.error('Error establishing SSE connection', { error });
            if (!res.headersSent && !res.destroyed) {
                res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error establishing SSE connection' }, id: null });
            } else if (!res.writableEnded) res.end();
            await closeSession(info);
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

        const sessionInfo = activeSessions.get(sessionId);
        if (!sessionInfo || sessionInfo.owner !== currentSecurityContext().sessionId) {
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

            // Validate request body
            if (!req.body) {
                logger.warn(`POST /messages called with empty body for session: ${sessionId}`);
                res.status(400).json({
                    jsonrpc: '2.0',
                    error: {
                        code: -32602,
                        message: 'Invalid request: empty body'
                    },
                    id: null
                });
                return;
            }

            // Log request details for debugging
            logger.debug(`Processing POST message for session: ${sessionId}`, {
                contentType: req.headers['content-type'],
                bodyType: typeof req.body,
                bodyKeys: typeof req.body === 'object' ? Object.keys(req.body) : 'N/A'
            });

            // Handle the message
            await sessionInfo.transport.handlePostMessage(req, res, req.body);
            logger.debug(`Successfully handled POST message for session: ${sessionId}`);

        } catch (error) {
            logger.error(`Error handling POST message for session ${sessionId}:`, {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                contentType: req.headers['content-type'],
                bodyType: typeof req.body
            });

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

    router.cleanup = async () => {
        shuttingDown = true;
        clearInterval(cleanupInterval);
        await Promise.all([...allSessions].map(closeSession));
    };

    return router;
}
