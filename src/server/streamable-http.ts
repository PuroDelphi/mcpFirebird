/** Legacy 2025 Streamable HTTP sessions, isolated by authenticated principal. */
import express from 'express';
import { randomUUID } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/server';
import { isInitializeRequest } from '@modelcontextprotocol/server';
import { NodeStreamableHTTPServerTransport as StreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import { createLogger } from '../utils/logger.js';
import { currentSecurityContext } from '../security/context.js';

const logger = createLogger('server:streamable-http');
interface SessionInfo {
    owner: string;
    transport: StreamableHTTPServerTransport;
    response: express.Response;
    server?: McpServer;
    ready: Promise<void>;
    connected: boolean;
    closed: boolean;
    transportClosed: boolean;
    closing?: Promise<void>;
    lastActivity: number;
}
export type StreamableHttpRouter = express.Router & { cleanup: () => Promise<void> };

export function createStreamableHttpRouter(createServerInstance: () => Promise<McpServer>): StreamableHttpRouter {
    const router = express.Router() as StreamableHttpRouter;
    const activeSessions = new Map<string, SessionInfo>();
    // Includes initialization and stateless requests, not just sessions with IDs.
    const allSessions = new Set<SessionInfo>();
    const sessionTimeout = Number(process.env.STREAMABLE_SESSION_TIMEOUT_MS || '1800000');
    const stateless = process.env.STREAMABLE_STATELESS_MODE === 'true';
    let shuttingDown = false;

    function closeSession(info: SessionInfo): Promise<void> {
        info.closed = true;
        if (info.transport.sessionId) activeSessions.delete(info.transport.sessionId);
        if (!info.closing) info.closing = Promise.resolve().then(async () => {
            if (!info.connected && !info.response.destroyed && !info.response.writableEnded) {
                if (!info.response.headersSent) info.response.status(503);
                info.response.end();
            }
            await info.ready.catch(() => undefined);
            let serverCloseFailed = false;
            if (info.server) {
                try { await info.server.close(); }
                catch (error) { serverCloseFailed = true; logger.warn('Error closing legacy MCP server', { error }); }
            }
            if ((!info.connected || serverCloseFailed) && !info.transportClosed) {
                try { await info.transport.close(); }
                catch (error) { logger.warn('Error closing legacy MCP transport', { error }); }
            }
            if (!info.response.destroyed && !info.response.writableEnded) info.response.end();
            allSessions.delete(info);
        });
        return info.closing;
    }

    const cleanupInterval = stateless ? undefined : setInterval(() => {
        for (const info of activeSessions.values()) {
            if (Date.now() - info.lastActivity > sessionTimeout) void closeSession(info);
        }
    }, 60000);
    cleanupInterval?.unref();

    function createSession(res: express.Response): SessionInfo {
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: stateless ? undefined : () => randomUUID(),
            ...(stateless ? { enableJsonResponse: true } : {}),
            onsessioninitialized: id => { if (!info.closed) activeSessions.set(id, info); }
        });
        const info: SessionInfo = {
            owner: currentSecurityContext().sessionId, transport, response: res, ready: Promise.resolve(),
            connected: false, closed: false, transportClosed: false, lastActivity: Date.now()
        };
        allSessions.add(info);
        transport.onclose = () => {
            info.transportClosed = true;
            // closeSession is deferred and idempotent, so SDK onclose may finish
            // clearing its protocol state before any server-level disposal runs.
            void closeSession(info);
        };
        res.once('close', () => {
            // A completed initialize response does not end a stateful session.
            if (stateless || !res.writableFinished || !transport.sessionId) void closeSession(info);
        });
        res.once('error', () => { void closeSession(info); });
        info.ready = Promise.resolve().then(async () => {
            info.server = await createServerInstance();
            if (info.closed || res.destroyed || res.writableEnded) return;
            await info.server.connect(transport);
            info.connected = true;
        });
        return info;
    }

    function reject(res: express.Response, status: number, message: string): void {
        if (!res.headersSent && !res.destroyed) res.status(status).json({
            jsonrpc: '2.0', error: { code: status === 500 ? -32603 : -32602, message }, id: null
        });
    }

    function ownedSession(req: express.Request, res: express.Response): SessionInfo | undefined {
        const id = req.headers['mcp-session-id'];
        const info = typeof id === 'string' ? activeSessions.get(id) : undefined;
        if (!info || info.closed) { reject(res, 400, 'Invalid or missing session ID'); return; }
        if (info.owner !== currentSecurityContext().sessionId) { reject(res, 403, 'Forbidden'); return; }
        info.lastActivity = Date.now();
        return info;
    }

    router.use((_req, res, next) => {
        if (shuttingDown) { res.status(503).json({ error: 'Server is shutting down' }); return; }
        next();
    });
    router.get('/health', (_req, res) => res.json({ status: 'healthy' }));
    router.post('/mcp', async (req, res) => {
        let info: SessionInfo | undefined;
        let created = false;
        try {
            if (stateless || (!req.headers['mcp-session-id'] && isInitializeRequest(req.body))) {
                info = createSession(res);
                created = true;
                await info.ready;
                if (info.closed || res.destroyed) { await closeSession(info); return; }
            } else {
                info = ownedSession(req, res);
                if (!info) return;
            }
            await info.transport.handleRequest(req, res, req.body);
        } catch (error) {
            logger.error('Error handling legacy MCP request', { error });
            reject(res, 500, 'Internal server error');
            if (created && info) await closeSession(info);
        } finally {
            if (info && (stateless || (created && !info.transport.sessionId))) await closeSession(info);
        }
    });

    router.get('/mcp', async (req, res) => {
        if (stateless) { reject(res, 405, 'Method not allowed in stateless mode'); return; }
        const info = ownedSession(req, res);
        if (!info) return;
        try { await info.transport.handleRequest(req, res); }
        catch (error) { logger.error('Error handling legacy MCP stream', { error }); reject(res, 500, 'Internal server error'); }
    });

    router.delete('/mcp', async (req, res) => {
        if (stateless) { reject(res, 405, 'Method not allowed in stateless mode'); return; }
        const info = ownedSession(req, res);
        if (!info) return;
        try {
            await info.transport.handleRequest(req, res);
            if (res.statusCode < 400) await closeSession(info);
        } catch (error) { logger.error('Error deleting legacy MCP session', { error }); reject(res, 500, 'Internal server error'); }
    });

    router.cleanup = async () => {
        shuttingDown = true;
        if (cleanupInterval) clearInterval(cleanupInterval);
        await Promise.all([...allSessions].map(closeSession));
    };
    return router;
}
