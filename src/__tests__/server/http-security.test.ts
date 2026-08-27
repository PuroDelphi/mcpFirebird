import express from 'express';
import request from 'supertest';
import { buildCorsOptions, createBearerAuthMiddleware, tokensMatch } from '../../server/http-security.js';

describe('HTTP security helpers', () => {
    it('keeps wildcard CORS compatibility without browser credentials', () => {
        expect(buildCorsOptions(undefined)).toMatchObject({
            origin: '*',
            credentials: false
        });
    });

    it('accepts an explicit list of allowed origins', () => {
        expect(buildCorsOptions('https://one.example, https://two.example').origin).toEqual([
            'https://one.example',
            'https://two.example'
        ]);
    });

    it('compares API keys safely', () => {
        expect(tokensMatch('secret', 'secret')).toBe(true);
        expect(tokensMatch('wrong', 'secret')).toBe(false);
    });

    it('protects routes only when an API key is configured', async () => {
        const app = express();
        app.use(createBearerAuthMiddleware('secret'));
        app.get('/health', (_req, res) => res.json({ status: 'healthy' }));

        await request(app).get('/health').expect(401);
        await request(app).get('/health').set('Authorization', 'Bearer wrong').expect(403);
        await request(app).get('/health').set('Authorization', 'Bearer secret').expect(200);
    });
});
