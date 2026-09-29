import express from 'express';
import request from 'supertest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createStreamableHttpRouter } from '../../server/streamable-http.js';
import { createBearerAuthMiddleware } from '../../server/http-security.js';
import { securityConfig } from '../../security/config.js';
import { currentSecurityContext } from '../../security/context.js';

describe('OAuth identity through the actual MCP HTTP transport', () => {
    it('creates isolated protocol instances for concurrent stateless requests', async () => {
        const stateless = process.env.STREAMABLE_STATELESS_MODE;
        process.env.STREAMABLE_STATELESS_MODE = 'true';
        const create = jest.fn(async () => {
            const server = new McpServer({name:'isolated-test',version:'1'});
            server.registerTool('identity', {inputSchema:{}}, async () => {
                await new Promise(resolve => setTimeout(resolve, 10));
                return {content:[{type:'text',text:currentSecurityContext().sessionId}]};
            });
            return server;
        });
        const router = createStreamableHttpRouter(create);
        const app = express(); app.use(express.json()); app.use(createBearerAuthMiddleware('key')); app.use(router);
        try {
            const responses = await Promise.all([1,2].map(id => request(app).post('/mcp')
                .set({Authorization:'Bearer key',Accept:'application/json, text/event-stream'})
                .send({jsonrpc:'2.0',id,method:'tools/call',params:{name:'identity',arguments:{}}})));
            expect(responses.map(response => response.status)).toEqual([200,200]);
            expect(create).toHaveBeenCalledTimes(2);
            for (const response of responses) expect(response.text).toContain('api-key');
        } finally {
            (router as any).cleanup();
            if (stateless === undefined) delete process.env.STREAMABLE_STATELESS_MODE; else process.env.STREAMABLE_STATELESS_MODE = stateless;
        }
    });
    it('keeps identity through tool dispatch and prevents cross-principal session reuse', async () => {
        const fetchOriginal = global.fetch;
        const authOriginal = securityConfig.authorization;
        const stateless = process.env.STREAMABLE_STATELESS_MODE;
        process.env.STREAMABLE_STATELESS_MODE = 'false';
        securityConfig.authorization = {type:'oauth2',oauth2:{tokenVerifyUrl:'https://auth.example/introspect',clientId:'c',clientSecret:'s'}};
        global.fetch = jest.fn().mockImplementation(async (_url, options) => ({ok:true,json:async()=>({active:true,sub:new URLSearchParams(options.body).get('token'),role:'analyst'})}));
        const router = createStreamableHttpRouter(async () => {
            const server = new McpServer({name:'security-test',version:'1'});
            server.registerTool('identity', {inputSchema:{}}, async () => ({content:[{type:'text',text:currentSecurityContext().user?.id || 'missing'}]}));
            return server;
        });
        const app = express();
        app.use(express.json()); app.use(createBearerAuthMiddleware(undefined)); app.use(router);
        const headers = {Authorization:'Bearer alice',Accept:'application/json, text/event-stream'};
        try {
            const initialized = await request(app).post('/mcp').set(headers).send({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'test',version:'1'}}}).expect(200);
            const session = initialized.headers['mcp-session-id'];
            expect(session).toBeTruthy();
            const response = await request(app).post('/mcp').set({...headers,'mcp-session-id':session})
                .send({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'identity',arguments:{}}}).expect(200);
            expect(response.text).toContain('alice');
            const attacker = {...headers,Authorization:'Bearer bob','mcp-session-id':session};
            await request(app).post('/mcp').set(attacker).send({jsonrpc:'2.0',id:3,method:'tools/list'}).expect(403);
            await request(app).get('/mcp').set(attacker).expect(403);
            await request(app).delete('/mcp').set(attacker).expect(403);
        } finally {
            (router as any).cleanup();
            global.fetch = fetchOriginal; securityConfig.authorization = authOriginal;
            if (stateless === undefined) delete process.env.STREAMABLE_STATELESS_MODE; else process.env.STREAMABLE_STATELESS_MODE = stateless;
        }
    });
});
