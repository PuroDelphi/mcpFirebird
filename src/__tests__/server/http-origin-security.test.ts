import express from 'express';
import cors from 'cors';
import request from 'supertest';
import { buildCorsOptions, createRequestOriginMiddleware } from '../../server/http-security.js';
import { loadHttpSecurityConfig as loadConfig, parseHttpAuthority } from '../../security/config.js';

const loadHttpSecurityConfig = (env: NodeJS.ProcessEnv = {}) => loadConfig({ ...env, MCP_HTTP_SECURITY_MODE: 'strict' });

describe('HTTP binding and DNS rebinding defenses', () => {
    function app(env: NodeJS.ProcessEnv = {}) {
        const result = express();
        result.set('trust proxy', true); // Forwarded values must still not bypass our checks.
        result.use(createRequestOriginMiddleware(loadHttpSecurityConfig(env)));
        result.use(cors(buildCorsOptions(env.MCP_ALLOWED_ORIGIN || '', 'strict')));
        result.all('/mcp', (_req, res) => res.json({ ok: true }));
        return result;
    }

    it('defaults to loopback with a same-origin browser policy', () => {
        expect(loadHttpSecurityConfig({})).toEqual({
            mode: 'strict', host: '127.0.0.1', allowedHosts: ['localhost', '127.0.0.1', '[::1]'], allowedOrigins: []
        });
    });

    it.each(['0.0.0.0', '::', '192.168.1.4', 'mcp.example'])('requires deliberate remote exposure for %s', host => {
        expect(() => loadHttpSecurityConfig({ HTTP_HOST: host })).toThrow('MCP_ALLOW_REMOTE=true');
        expect(() => loadHttpSecurityConfig({ HTTP_HOST: host, MCP_ALLOW_REMOTE: 'true' })).toThrow('MCP_ALLOWED_HOSTS');
        expect(loadHttpSecurityConfig({ HTTP_HOST: host, MCP_ALLOW_REMOTE: 'true', MCP_ALLOWED_HOSTS: 'mcp.example' }).host).toBe(host);
    });

    it.each(['*', 'mcp.example:3003', 'https://mcp.example', 'mcp.example/path', 'localhost,', '::1'])('rejects unsafe host configuration %s', value => {
        expect(() => loadHttpSecurityConfig({ MCP_ALLOWED_HOSTS: value })).toThrow('MCP_ALLOWED_HOSTS');
    });

    it.each(['*', 'null', 'https://good.example/', 'https://good.example/path', 'https://user@good.example', 'https://good.example,'])('rejects unsafe origin configuration %s', value => {
        expect(() => loadHttpSecurityConfig({ MCP_ALLOWED_ORIGIN: value })).toThrow('MCP_ALLOWED_ORIGIN');
    });

    it.each(['localhost:3003', '127.0.0.1:3003', '[::1]:3003', 'LOCALHOST:3003'])('accepts direct local Host %s without Origin', async host => {
        await request(app()).post('/mcp').set('Host', host).expect(200);
    });

    it.each(['evil.example:3003', 'localhost.evil.example', 'localhost@evil.example', 'localhost:70000', 'localhost,evil.example', 'localhost:0'])('rejects hostile or malformed Host %s before route dispatch', async host => {
        await request(app()).post('/mcp').set('Host', host).expect(403);
    });

    it('handles bracketed IPv6 and strips a valid port', () => {
        expect(parseHttpAuthority('[::1]:3003')).toEqual({ hostname: '[::1]', authority: '[::1]:3003' });
        expect(parseHttpAuthority('::1:3003')).toBeUndefined();
    });

    it('permits exact same-origin requests, including IPv6, without an allowlist', async () => {
        await request(app()).post('/mcp').set({ Host: 'localhost:3003', Origin: 'http://localhost:3003' }).expect(200);
        await request(app()).post('/mcp').set({ Host: '[::1]:3003', Origin: 'http://[::1]:3003' }).expect(200);
        await request(app()).post('/mcp').set({ Host: 'localhost:80', Origin: 'http://localhost' }).expect(200);
    });

    it.each(['https://evil.example', 'null', 'http://localhost:3004', 'http://localhost:3003/path', 'http://localhost:3003/', 'http://localhost:3003 https://evil.example'])('rejects foreign or malformed Origin %s', async origin => {
        await request(app()).post('/mcp').set({ Host: 'localhost:3003', Origin: origin }).expect(403);
    });

    it('does not trust forwarded hosts or protocol to validate a request', async () => {
        await request(app()).post('/mcp').set({ Host: 'evil.example', 'X-Forwarded-Host': 'localhost:3003' }).expect(403);
        await request(app()).post('/mcp').set({ Host: 'localhost:3003', Origin: 'https://localhost:3003', 'X-Forwarded-Proto': 'https' }).expect(403);
    });

    it('validates OPTIONS before CORS and allows configured origins with protocol/cache headers', async () => {
        const configured = app({ MCP_ALLOWED_ORIGIN: 'https://client.example' });
        await request(configured).options('/mcp').set({ Host: 'localhost:3003', Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' }).expect(403);
        const response = await request(configured).options('/mcp').set({
            Host: 'localhost:3003', Origin: 'https://client.example', 'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'authorization,mcp-protocol-version,mcp-method,mcp-name,mcp-session-id,last-event-id,if-none-match'
        }).expect(204);
        expect(response.headers['access-control-allow-origin']).toBe('https://client.example');
        const allowed = response.headers['access-control-allow-headers'].toLowerCase().split(',');
        for (const header of ['authorization', 'mcp-protocol-version', 'mcp-method', 'mcp-name', 'mcp-session-id', 'last-event-id', 'if-none-match', 'if-modified-since']) {
            expect(allowed).toContain(header);
        }
        const result = await request(configured).post('/mcp').set({ Host: 'localhost:3003', Origin: 'https://client.example' }).expect(200);
        const exposed = result.headers['access-control-expose-headers'].toLowerCase().split(',');
        for (const header of ['mcp-session-id', 'www-authenticate', 'cache-control', 'etag', 'last-modified']) expect(exposed).toContain(header);
        expect(result.headers['access-control-allow-credentials']).toBeUndefined();
    });

    it('allows a remote host only when it appears in the configured list', async () => {
        const configured = app({ HTTP_HOST: '0.0.0.0', MCP_ALLOW_REMOTE: 'true', MCP_ALLOWED_HOSTS: 'mcp.example,[2001:db8::1]', MCP_ALLOWED_ORIGIN: 'https://client.example' });
        await request(configured).post('/mcp').set({ Host: 'mcp.example:3003', Origin: 'https://client.example' }).expect(200);
        await request(configured).post('/mcp').set('Host', '[2001:db8::1]:3003').expect(200);
        await request(configured).post('/mcp').set('Host', 'other.example').expect(403);
    });
});
