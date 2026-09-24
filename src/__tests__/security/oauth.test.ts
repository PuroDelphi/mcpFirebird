import express from 'express';
import request from 'supertest';
import { securityConfig, DEFAULT_SECURITY_CONFIG } from '../../security/config.js';
import { currentSecurityContext } from '../../security/context.js';
import { createBearerAuthMiddleware } from '../../server/http-security.js';
import { checkAllowedTable } from '../../security/authorization.js';

describe('OAuth2 HTTP enforcement', () => {
    const originalFetch = global.fetch;
    beforeEach(() => {
        Object.assign(securityConfig, structuredClone(DEFAULT_SECURITY_CONFIG));
        securityConfig.authorization = {
            type:'oauth2', oauth2:{tokenVerifyUrl:'https://auth.example/introspect', clientId:'client', clientSecret:'secret', scope:'db:read'},
            rolePermissions:{ analyst:{tables:['PUBLIC'],operations:['SELECT']} }
        };
        global.fetch = jest.fn().mockResolvedValue({ok:true,json:async()=>({active:true,sub:'person',role:'analyst',scope:'db:read'})});
    });
    afterEach(() => { global.fetch = originalFetch; delete securityConfig.authorization; });
    function app() {
        const result = express();
        result.use(createBearerAuthMiddleware(undefined));
        result.get('/who', (_req,res) => res.json(currentSecurityContext()));
        result.get('/private', (_req,res) => { try {checkAllowedTable('PRIVATE');res.sendStatus(200);} catch {res.sendStatus(403);} });
        return result;
    }
    it('requires a token, introspects it, and propagates trusted identity to query permissions', async () => {
        await request(app()).get('/who').expect(401);
        const response = await request(app()).get('/who').set('Authorization','Bearer valid').expect(200);
        expect(response.body.user.id).toBe('person');
        expect(response.body.user.role).toBe('analyst');
        expect(global.fetch).toHaveBeenCalledWith('https://auth.example/introspect', expect.objectContaining({body:'token=valid',redirect:'error'}));
        await request(app()).get('/private').set('Authorization','Bearer valid').expect(403);
    });
    it.each([{active:false,sub:'p',role:'analyst',scope:'db:read'}, {active:true,sub:'p',role:'analyst',scope:'wrong'},
        {active:true,sub:'p',role:'analyst',scope:'db:read',exp:1}, {active:true,sub:'p',scope:'db:read'}])('rejects invalid introspection claims %#', async claims => {
        jest.mocked(global.fetch).mockResolvedValue({ok:true,json:async()=>claims} as any);
        await request(app()).get('/who').set('Authorization','Bearer invalid').expect(401);
    });
    it('fails closed on authorization service outages', async () => {
        jest.mocked(global.fetch).mockRejectedValue(new Error('secret service detail'));
        const response = await request(app()).get('/who').set('Authorization','Bearer token').expect(401);
        expect(response.text).not.toContain('secret');
    });
});
