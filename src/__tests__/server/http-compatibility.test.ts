import request from 'supertest';
import { McpServer } from '@modelcontextprotocol/server';
import { AuthorizationSchema, loadHttpSecurityConfig, securityConfig } from '../../security/config.js';
import { createHttpApplication } from '../../server/http-server.js';
import { verifyOAuth2Token } from '../../security/authorization.js';

// This suite exercises HTTP configuration/auth, not Firebird event backends.
jest.mock('../../server/event-http.js', () => ({ withHttpEventSubscriptions: (handler: unknown) => handler }));

const legacyOAuth = { tokenVerifyUrl: 'https://auth.example/introspect', clientId: 'client', clientSecret: 'secret', scope: 'db:read' };

describe('HTTP upgrade compatibility and explicit hardening', () => {
    const originalAuth = securityConfig.authorization;
    const originalFetch = global.fetch;
    afterEach(() => { securityConfig.authorization = originalAuth; global.fetch = originalFetch; });

    it.each([{}, { MCP_ALLOWED_ORIGIN: '*' }, { MCP_ALLOWED_ORIGIN: '' }])('preserves old remote bind and non-cookie wildcard CORS %#', async env => {
        const config = loadHttpSecurityConfig(env);
        expect(config).toEqual({ mode: 'compat', host: '0.0.0.0', allowedHosts: [], allowedOrigins: ['*'] });
        const http = createHttpApplication(jest.fn(), config);
        try {
            const response = await request(http.app).get('/health').set({ Host: 'existing.example', Origin: 'https://existing-client.example' }).expect(200);
            expect(response.headers['access-control-allow-origin']).toBe('*');
            expect(response.headers['access-control-allow-credentials']).toBeUndefined();
            await request(http.app).get('/').set('Host', 'existing.example').expect(200);
        } finally { await http.close(); }
    });

    it('enforces explicit Host/Origin lists even in compatibility mode', async () => {
        const http = createHttpApplication(jest.fn(), loadHttpSecurityConfig({ MCP_ALLOWED_HOSTS: 'existing.example', MCP_ALLOWED_ORIGIN: 'https://client.example' }));
        try {
            await request(http.app).get('/health').set({ Host: 'existing.example', Origin: 'https://client.example' }).expect(200);
            await request(http.app).get('/health').set('Host', 'other.example').expect(403);
            await request(http.app).options('/health').set({ Host: 'existing.example', Origin: 'https://other.example' }).expect(403);
        } finally { await http.close(); }
    });

    it('accepts the existing 2025 browser handshake through the real transport', async () => {
        const http = createHttpApplication(async () => new McpServer({ name: 'compat', version: '1' }), loadHttpSecurityConfig({ MCP_ALLOWED_ORIGIN: '*' }));
        try {
            const result = await request(http.app).post('/mcp')
                .set({ Host: 'existing.example', Origin: 'https://existing-client.example', Accept: 'application/json, text/event-stream' })
                .send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'old-client', version: '1' } } })
                .expect(200);
            expect(result.headers['access-control-allow-origin']).toBe('*');
            expect(result.text).toContain('protocolVersion');
        } finally { await http.close(); }
    });

    it('honors an explicit remote-exposure denial', () => {
        expect(() => loadHttpSecurityConfig({ MCP_ALLOW_REMOTE: 'false' })).toThrow();
        expect(loadHttpSecurityConfig({ MCP_ALLOW_REMOTE: 'false', HTTP_HOST: '127.0.0.1' }).host).toBe('127.0.0.1');
    });

    it('fails closed on an unknown security mode', () => {
        expect(() => loadHttpSecurityConfig({ MCP_HTTP_SECURITY_MODE: 'strcit' })).toThrow('MCP_HTTP_SECURITY_MODE');
    });

    it('retains old OAuth configurations without advertising nonexistent discovery', async () => {
        const auth = AuthorizationSchema.parse({ type: 'oauth2', oauth2: legacyOAuth });
        securityConfig.authorization = auth;
        global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ active: true, sub: 'person', role: 'analyst', scope: 'db:read' }) });
        const http = createHttpApplication(jest.fn(), loadHttpSecurityConfig({}));
        try {
            const challenge = await request(http.app).get('/health').expect(401);
            expect(challenge.headers['www-authenticate']).toBe('Bearer');
            await request(http.app).get('/health').set('Authorization', 'Bearer valid').expect(200);
            await request(http.app).get('/.well-known/oauth-protected-resource').set('Authorization', 'Bearer valid').expect(404);
        } finally { await http.close(); }
    });

    it.each([{ active: false }, { scope: 'other' }, { role: undefined }, { exp: 0 }])('keeps old OAuth checks enforced %#', async override => {
        securityConfig.authorization = { type: 'oauth2', oauth2: legacyOAuth };
        global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ active: true, sub: 'person', role: 'analyst', scope: 'db:read', ...override }) });
        await expect(verifyOAuth2Token('invalid')).rejects.toThrow();
    });

    it('does not allow strict HTTP with introspection-only OAuth', () => {
        securityConfig.authorization = { type: 'oauth2', oauth2: legacyOAuth };
        expect(() => createHttpApplication(jest.fn(), loadHttpSecurityConfig({ MCP_HTTP_SECURITY_MODE: 'strict' }))).toThrow('resourceUrl');
    });

    it('never bypasses an explicitly configured OAuth audience in compat mode', async () => {
        securityConfig.authorization = { type: 'oauth2', oauth2: { ...legacyOAuth, resourceUrl: 'https://mcp.example/mcp', authorizationServers: ['https://auth.example'] } };
        global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ active: true, sub: 'person', role: 'analyst', scope: 'db:read', aud: 'https://other.example' }) });
        const http = createHttpApplication(jest.fn(), loadHttpSecurityConfig({}));
        try { await request(http.app).get('/health').set('Authorization', 'Bearer wrong-audience').expect(401); }
        finally { await http.close(); }
    });
});
