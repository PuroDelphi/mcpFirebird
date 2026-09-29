import crypto from 'crypto';
import type cors from 'cors';
import type { RequestHandler } from 'express';
import { securityConfig } from '../security/config.js';
import { verifyOAuth2Token } from '../security/authorization.js';
import { securityContext } from '../security/context.js';

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
    return async (req, res, next) => {
        if (req.method === 'OPTIONS') return next();
        const authType = securityConfig.authorization?.type;
        const authorization = req.headers.authorization;
        if (authType === 'oauth2') {
            try {
                if (!authorization?.startsWith('Bearer ')) throw new Error('Missing token');
                const user = await verifyOAuth2Token(authorization.slice(7));
                return securityContext.run({ user, sessionId: `oauth:${user.id}` }, next);
            } catch {
                onRejected?.('OAuth2 authentication rejected');
                return res.status(401).json({ error: 'Unauthorized' });
            }
        }
        if (!apiKey && authType === 'basic') return res.status(503).json({ error: 'Authentication is not configured' });
        if (!apiKey) return securityContext.run({ sessionId: `http:${req.socket.remoteAddress || 'unknown'}` }, next);

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

        // The shared key represents one principal. Client-supplied session IDs cannot reset quotas.
        securityContext.run({ sessionId: 'api-key', user: { id: 'api-key', username: 'api-key', role: 'user' } }, next);
    };
}
