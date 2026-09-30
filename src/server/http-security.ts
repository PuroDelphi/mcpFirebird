import crypto from 'crypto';
import type cors from 'cors';
import type { RequestHandler } from 'express';
import { loadHttpSecurityConfig, parseAllowedOrigins, parseHttpAuthority, parseHttpOrigin, securityConfig } from '../security/config.js';
import type { HttpSecurityConfig } from '../security/config.js';
import { OAuthTokenError, verifyOAuth2Token } from '../security/authorization.js';
import { securityContext } from '../security/context.js';

export { loadHttpSecurityConfig } from '../security/config.js';
export type { HttpSecurityConfig } from '../security/config.js';

export function buildCorsOptions(allowedOrigin = process.env.MCP_ALLOWED_ORIGIN): cors.CorsOptions {
    const origins = parseAllowedOrigins(allowedOrigin);

    return {
        // Same-origin clients need no CORS headers. Cross-origin access is opt-in.
        origin: origins.length === 0 ? false : origins.length === 1 ? origins[0] : origins,
        methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
        allowedHeaders: [
            'Content-Type', 'Accept', 'Authorization', 'MCP-Protocol-Version', 'Mcp-Method', 'Mcp-Name',
            'Mcp-Session-Id', 'Last-Event-ID', 'Cache-Control', 'If-None-Match', 'If-Modified-Since'
        ],
        exposedHeaders: ['MCP-Protocol-Version', 'Mcp-Session-Id', 'WWW-Authenticate', 'Cache-Control', 'ETag', 'Last-Modified'],
        credentials: false
    };
}

/** Mount before CORS (including preflights), body parsing, discovery and auth. */
export function createRequestOriginMiddleware(config: HttpSecurityConfig = loadHttpSecurityConfig()): RequestHandler {
    const allowedHosts = new Set(config.allowedHosts);
    const allowedOrigins = new Set(config.allowedOrigins);
    return (req, res, next) => {
        const host = req.headers.host && parseHttpAuthority(req.headers.host);
        if (!host || !allowedHosts.has(host.hostname)) return res.status(403).json({ error: 'Invalid Host header' });
        const originHeader = req.headers.origin;
        if (originHeader !== undefined) {
            const origin = parseHttpOrigin(originHeader);
            // X-Forwarded-Host/Proto are deliberately not trusted. A TLS-terminating
            // reverse proxy deployment must list its HTTPS origin explicitly.
            const scheme = 'encrypted' in req.socket && req.socket.encrypted ? 'https' : 'http';
            const sameOrigin = new URL(`${scheme}://${req.headers.host}`).origin;
            if (!origin || (origin !== sameOrigin && !allowedOrigins.has(origin))) {
                return res.status(403).json({ error: 'Invalid Origin header' });
            }
        }
        return next();
    };
}

const resourceMetadataPrefix = '/.well-known/oauth-protected-resource';

export function getOAuthResourceMetadataUrl(resourceUrl: string): string {
    const url = new URL(resourceUrl);
    return `${url.origin}${resourceMetadataPrefix}${url.pathname === '/' ? '' : url.pathname}`;
}

/** Public RFC 9728 metadata, derived only from operator configuration, never Host. */
export function createOAuthDiscoveryMiddleware(): RequestHandler {
    return (req, res, next) => {
        const authorization = securityConfig.authorization;
        const oauth = authorization?.type === 'oauth2' ? authorization.oauth2 : undefined;
        if (!oauth || !['GET', 'HEAD'].includes(req.method)) return next();
        const metadataPath = new URL(getOAuthResourceMetadataUrl(oauth.resourceUrl)).pathname;
        if (req.path !== metadataPath && req.path !== resourceMetadataPrefix) return next();
        const metadata = {
            resource: oauth.resourceUrl,
            authorization_servers: oauth.authorizationServers,
            bearer_methods_supported: ['header'],
            ...(oauth.scope ? { scopes_supported: oauth.scope.split(' ') } : {})
        };
        // Contains no credentials; do not cache configuration across a policy change.
        res.setHeader('Cache-Control', 'no-store');
        return res.json(metadata);
    };
}

function oauthChallenge(error?: 'invalid_token' | 'insufficient_scope'): string {
    const oauth = securityConfig.authorization?.oauth2;
    const parameters: string[] = [];
    if (oauth) {
        parameters.push(`resource_metadata="${getOAuthResourceMetadataUrl(oauth.resourceUrl)}"`);
        if (oauth.scope) parameters.push(`scope="${oauth.scope}"`);
    }
    if (error) parameters.push(`error="${error}"`);
    return `Bearer${parameters.length ? ' ' + parameters.join(', ') : ''}`;
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
            const match = authorization?.match(/^Bearer ([^\s,]+)$/i);
            if (!match) {
                onRejected?.('OAuth2 authentication rejected');
                res.setHeader('WWW-Authenticate', oauthChallenge(authorization ? 'invalid_token' : undefined));
                return res.status(401).json({ error: 'Unauthorized' });
            }
            try {
                const user = await verifyOAuth2Token(match[1]);
                return securityContext.run({ user, sessionId: `oauth:${user.id}` }, next);
            } catch (error) {
                onRejected?.('OAuth2 authentication rejected');
                const insufficientScope = error instanceof OAuthTokenError && error.oauthError === 'insufficient_scope';
                res.setHeader('WWW-Authenticate', oauthChallenge(insufficientScope ? 'insufficient_scope' : 'invalid_token'));
                return res.status(insufficientScope ? 403 : 401).json({ error: insufficientScope ? 'Insufficient scope' : 'Unauthorized' });
            }
        }
        if (!apiKey && authType === 'basic') return res.status(503).json({ error: 'Authentication is not configured' });
        if (!apiKey) return securityContext.run({ sessionId: `http:${req.socket.remoteAddress || 'unknown'}` }, next);

        if (!authorization?.startsWith('Bearer ')) {
            onRejected?.('Missing or invalid Bearer token');
            res.setHeader('WWW-Authenticate', 'Bearer');
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
