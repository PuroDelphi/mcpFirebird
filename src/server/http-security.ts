import crypto from 'crypto';
import type cors from 'cors';
import type { RequestHandler } from 'express';

export function buildCorsOptions(allowedOrigin = process.env.MCP_ALLOWED_ORIGIN): cors.CorsOptions {
    const origins = allowedOrigin
        ? allowedOrigin.split(',').map(origin => origin.trim()).filter(Boolean)
        : ['*'];

    return {
        origin: origins.length === 1 ? origins[0] : origins,
        methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'mcp-session-id', 'Cache-Control', 'Accept', 'Authorization'],
        credentials: false
    };
}

export function tokensMatch(actual: string, expected: string): boolean {
    const actualBuffer = Buffer.from(actual);
    const expectedBuffer = Buffer.from(expected);
    return actualBuffer.length === expectedBuffer.length &&
        crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

export function createBearerAuthMiddleware(
    apiKey: string | undefined,
    onRejected?: (message: string) => void
): RequestHandler {
    return (req, res, next) => {
        if (!apiKey || req.method === 'OPTIONS') return next();

        const authorization = req.headers.authorization;
        if (!authorization?.startsWith('Bearer ')) {
            onRejected?.('Missing or invalid Bearer token');
            return res.status(401).json({
                jsonrpc: '2.0',
                error: { code: -32000, message: 'Unauthorized' },
                id: null
            });
        }

        if (!tokensMatch(authorization.slice(7), apiKey)) {
            onRejected?.('Invalid API key');
            return res.status(403).json({
                jsonrpc: '2.0',
                error: { code: -32000, message: 'Forbidden' },
                id: null
            });
        }

        next();
    };
}
