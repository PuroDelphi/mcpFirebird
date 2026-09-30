import express from 'express';
import cors from 'cors';
import { createMcpHandler, isLegacyRequest, type McpServerFactory } from '@modelcontextprotocol/server';
import { toNodeHandler, toWebRequest } from '@modelcontextprotocol/node';
import { createStreamableHttpRouter } from './streamable-http.js';
import { createSseRouter } from './sse.js';
import { withHttpEventSubscriptions } from './event-http.js';
import {
    buildCorsOptions, createBearerAuthMiddleware, createRequestOriginMiddleware,
    createOAuthDiscoveryMiddleware, loadHttpSecurityConfig
} from './http-security.js';

/** Preserve sessionful 2025 clients while explicitly opting into the 2026 factory. */
export function createHttpApplication(factory: McpServerFactory, config = loadHttpSecurityConfig(), options: { enableSSE?: boolean; enableStreamableHttp?: boolean; corsOptions?: cors.CorsOptions } = {}) {
    const app = express();
    app.disable('x-powered-by');
    app.use(createRequestOriginMiddleware(config));
    app.use(cors(options.corsOptions || buildCorsOptions(config.allowedOrigins.join(','))));
    app.use(createOAuthDiscoveryMiddleware());
    app.use(express.json({ limit: '1mb' }));
    app.use(createBearerAuthMiddleware(process.env.FIREBIRD_API_KEY || process.env.FB_API_KEY));
    const modern = createMcpHandler(factory, { legacy: 'reject', maxRequestBodySize: 1024 * 1024 });
    const modernNode = toNodeHandler(withHttpEventSubscriptions(modern));
    const legacyFactory = async () => {
        const server = await factory({ era: 'legacy' });
        if (!('registerTool' in server)) throw new Error('A McpServer factory is required');
        return server;
    };
    const legacy = createStreamableHttpRouter(legacyFactory);
    const sse = createSseRouter(legacyFactory);
    if (options.enableStreamableHttp !== false) app.all('/mcp', async (req, res, next) => {
        try {
            // Classification must never consume an unparsed body that the Node
            // handler would try to read a second time. MCP POSTs are JSON only.
            if (req.method === 'POST' && !req.is('application/json')) {
                res.status(415).json({ error: 'Content-Type must be application/json' }); return;
            }
            if (req.method === 'POST' && !req.body) {
                res.status(400).json({ error: 'A JSON-RPC body is required' }); return;
            }
            const request = await toWebRequest(req, req.body);
            if (await isLegacyRequest(request, req.body)) return next();
            await modernNode(req, res, req.body);
        } catch (error) { next(error); }
    });
    if (options.enableStreamableHttp !== false) app.use(legacy);
    if (options.enableSSE !== false) app.use(sse);
    app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        if (!res.headersSent) res.status('status' in error ? Number(error.status) : 500).json({ error: 'Request failed' });
    });
    return {
        app, modern,
        close: async () => {
            const results = await Promise.allSettled([
                modern.close(),
                (legacy as express.Router & { cleanup: () => Promise<void> }).cleanup(),
                (sse as express.Router & { cleanup: () => Promise<void> }).cleanup()
            ]);
            const failed = results.find(result => result.status === 'rejected');
            if (failed?.status === 'rejected') throw failed.reason;
        }
    };
}
