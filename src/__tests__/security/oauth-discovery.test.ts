import express from 'express';
import request from 'supertest';
import { AuthorizationSchema, securityConfig } from '../../security/config.js';
import { verifyOAuth2Token } from '../../security/authorization.js';
import { createBearerAuthMiddleware, createOAuthDiscoveryMiddleware, getOAuthResourceMetadataUrl } from '../../server/http-security.js';

const resourceUrl = 'https://mcp.example/public/mcp';
const oauth = {
    tokenVerifyUrl: 'https://auth.example/introspect', clientId: 'client', clientSecret: 'secret',
    resourceUrl, authorizationServers: ['https://auth.example/tenant'], scope: 'db:read db:list'
};
const validClaims = { active: true, sub: 'person', role: 'analyst', scope: 'db:read db:list', aud: resourceUrl };

describe('OAuth protected resource discovery and audience binding', () => {
    const originalFetch = global.fetch;
    const originalAuth = securityConfig.authorization;
    beforeEach(() => {
        securityConfig.authorization = { type: 'oauth2', oauth2: { ...oauth } };
        global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ...validClaims }) });
    });
    afterEach(() => { global.fetch = originalFetch; securityConfig.authorization = originalAuth; });
    function app() {
        const result = express();
        result.use(createOAuthDiscoveryMiddleware());
        result.use(createBearerAuthMiddleware(undefined));
        result.get('/public/mcp', (_req, res) => res.sendStatus(200));
        return result;
    }

    it.each(['/.well-known/oauth-protected-resource/public/mcp', '/.well-known/oauth-protected-resource'])('serves public metadata at %s without introspection or credential leakage', async path => {
        const response = await request(app()).get(path).set('Host', 'attacker.example').expect(200);
        expect(response.body).toEqual({ resource: resourceUrl, authorization_servers: oauth.authorizationServers, scopes_supported: ['db:read', 'db:list'], bearer_methods_supported: ['header'] });
        expect(response.text).not.toContain('secret');
        expect(response.text).not.toContain('introspect');
        expect(response.text).not.toContain('attacker.example');
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('supports HEAD metadata and does not disclose metadata outside OAuth mode', async () => {
        await request(app()).head('/.well-known/oauth-protected-resource').expect(200);
        securityConfig.authorization = { type: 'none' };
        await request(app()).get('/.well-known/oauth-protected-resource').expect(404);
    });

    it('advertises the configured metadata URL and scopes on a missing-token challenge', async () => {
        const response = await request(app()).get('/public/mcp').set('Host', 'untrusted.example').expect(401);
        expect(response.headers['www-authenticate']).toBe('Bearer resource_metadata="https://mcp.example/.well-known/oauth-protected-resource/public/mcp", scope="db:read db:list"');
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('supports pathless canonical resources', () => {
        expect(getOAuthResourceMetadataUrl('https://mcp.example')).toBe('https://mcp.example/.well-known/oauth-protected-resource');
        expect(getOAuthResourceMetadataUrl('http://[::1]:3003/mcp')).toBe('http://[::1]:3003/.well-known/oauth-protected-resource/mcp');
    });

    it.each([undefined, '', 'client', 'https://other.example/mcp', [], ['https://other.example/mcp'], [resourceUrl, 1], { resource: resourceUrl }])('rejects missing, foreign or malformed aud %#', async aud => {
        jest.mocked(global.fetch).mockResolvedValue({ ok: true, json: async () => ({ ...validClaims, aud }) } as Response);
        const response = await request(app()).get('/public/mcp').set('Authorization', 'Bearer token').expect(401);
        expect(response.headers['www-authenticate']).toContain('error="invalid_token"');
    });

    it.each([resourceUrl, ['https://other.example', resourceUrl]])('accepts an explicitly matching audience %#', async aud => {
        jest.mocked(global.fetch).mockResolvedValue({ ok: true, json: async () => ({ ...validClaims, aud }) } as Response);
        await request(app()).get('/public/mcp').set('Authorization', 'bearer valid').expect(200);
    });

    it.each([{ exp: 0 }, { exp: '9999999999' }, { nbf: Date.now() / 1000 + 3600 }, { nbf: '0' }, { roles: 'analyst', role: undefined }, null, []])('fails closed on invalid claims %#', async override => {
        const claims = override && !Array.isArray(override) ? { ...validClaims, ...override } : override;
        jest.mocked(global.fetch).mockResolvedValue({ ok: true, json: async () => claims } as Response);
        await request(app()).get('/public/mcp').set('Authorization', 'Bearer token').expect(401);
    });

    it('form-encodes introspection credentials and prohibits redirects', async () => {
        securityConfig.authorization!.oauth2!.clientId = 'client:with space';
        securityConfig.authorization!.oauth2!.clientSecret = 's:e&cret';
        await verifyOAuth2Token('token');
        expect(global.fetch).toHaveBeenCalledWith(oauth.tokenVerifyUrl, expect.objectContaining({
            method: 'POST', body: 'token=token', redirect: 'error',
            headers: expect.objectContaining({ Authorization: `Basic ${Buffer.from('client%3Awith+space:s%3Ae%26cret').toString('base64')}` })
        }));
    });

    it.each(['Bearer ', 'Bearer token extra', 'Bearer token,Bearer evil', 'Basic token'])('rejects malformed bearer authorization %#', async authorization => {
        await request(app()).get('/public/mcp').set('Authorization', authorization).expect(401);
        expect(global.fetch).not.toHaveBeenCalled();
    });
});

describe('OAuth configuration validation', () => {
    it('requires explicit resource and authorization server identifiers', () => {
        expect(AuthorizationSchema.safeParse({ type: 'oauth2', oauth2: oauth }).success).toBe(true);
        for (const key of ['resourceUrl', 'authorizationServers']) {
            const incomplete = { ...oauth } as Record<string, unknown>;
            delete incomplete[key];
            expect(AuthorizationSchema.safeParse({ type: 'oauth2', oauth2: incomplete }).success).toBe(false);
        }
    });
    it.each([
        { resourceUrl: 'http://remote.example/mcp' }, { resourceUrl: 'https://mcp.example/mcp#fragment' },
        { resourceUrl: 'https://mcp.example/mcp?query=value' }, { resourceUrl: 'not a URL' },
        { authorizationServers: [] }, { authorizationServers: ['http://auth.example'] },
        { authorizationServers: ['https://auth.example?query=value'] }, { authorizationServers: ['invalid'] },
        { tokenVerifyUrl: 'http://auth.example' }, { tokenVerifyUrl: 'invalid' }, { scope: 'bad"scope' }, { scope: 'bad\nscope' }
    ])('rejects invalid OAuth configuration %# without throwing a URL parsing error', override => {
        expect(AuthorizationSchema.safeParse({ type: 'oauth2', oauth2: { ...oauth, ...override } }).success).toBe(false);
    });
    it.each(['http://127.0.0.1:3003/mcp', 'http://localhost:3003/mcp', 'http://[::1]:3003/mcp'])('allows HTTP resource metadata only for loopback development at %s', resource => {
        expect(AuthorizationSchema.safeParse({ type: 'oauth2', oauth2: { ...oauth, resourceUrl: resource } }).success).toBe(true);
    });
});
