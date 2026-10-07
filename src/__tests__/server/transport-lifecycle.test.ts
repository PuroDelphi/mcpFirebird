import express from 'express';
import http from 'node:http';
import { once } from 'node:events';
import request from 'supertest';
import { McpServer } from '@modelcontextprotocol/server';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import { SSEServerTransport } from '@modelcontextprotocol/server-legacy/sse';
import { createSseRouter } from '../../server/sse.js';
import { createStreamableHttpRouter } from '../../server/streamable-http.js';

function deferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    const promise = new Promise<T>(done => { resolve = done; });
    return { promise, resolve };
}
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const initialize = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'lifecycle', version: '1' } } };

describe('legacy transport lifecycle', () => {
    const originalStateless = process.env.STREAMABLE_STATELESS_MODE;
    afterEach(() => {
        jest.restoreAllMocks();
        if (originalStateless === undefined) delete process.env.STREAMABLE_STATELESS_MODE;
        else process.env.STREAMABLE_STATELESS_MODE = originalStateless;
    });

    it.each(['sse', 'stateless', 'stateful'] as const)('closes a late %s factory result without connecting after disconnect', async kind => {
        process.env.STREAMABLE_STATELESS_MODE = String(kind === 'stateless');
        const started = deferred<void>();
        const release = deferred<McpServer>();
        const disconnected = deferred<void>();
        const fake = { connect: jest.fn(async () => undefined), close: jest.fn(async () => undefined) };
        const factory = async () => { started.resolve(); return release.promise; };
        const router = kind === 'sse' ? createSseRouter(factory) : createStreamableHttpRouter(factory);
        const app = express();
        app.use((_req, res, next) => { res.once('close', () => disconnected.resolve()); next(); });
        app.use(express.json()); app.use(router);
        const listener = app.listen(0, '127.0.0.1');
        await once(listener, 'listening');
        const address = listener.address();
        if (!address || typeof address === 'string') throw new Error('Expected TCP listener');
        const req = http.request({ host: '127.0.0.1', port: address.port, path: kind === 'sse' ? '/sse' : '/mcp', method: kind === 'sse' ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' } });
        req.on('error', () => undefined);
        req.end(kind === 'sse' ? undefined : JSON.stringify(initialize));
        try {
            await started.promise;
            req.destroy();
            await disconnected.promise;
            release.resolve(fake as unknown as McpServer);
            await router.cleanup();
            expect(fake.connect).not.toHaveBeenCalled();
            expect(fake.close).toHaveBeenCalledTimes(1);
            await router.cleanup();
            expect(fake.close).toHaveBeenCalledTimes(1);
        } finally {
            req.destroy();
            release.resolve(fake as unknown as McpServer);
            await router.cleanup();
            await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
        }
    });

    it('returns a finite error rather than opening an unhandled SSE stream without a factory', async () => {
        const router = createSseRouter();
        const app = express(); app.use(router);
        try {
            await request(app).get('/sse').expect(503).expect('Content-Type', /json/);
        } finally { await router.cleanup(); }
    });

    it.each(['sse', 'stateless', 'stateful'] as const)('ends a pending %s response during shutdown and awaits its late factory', async kind => {
        process.env.STREAMABLE_STATELESS_MODE = String(kind === 'stateless');
        const started = deferred<void>();
        const release = deferred<McpServer>();
        const fake = { connect: jest.fn(async () => undefined), close: jest.fn(async () => undefined) };
        const factory = async () => { started.resolve(); return release.promise; };
        const router = kind === 'sse' ? createSseRouter(factory) : createStreamableHttpRouter(factory);
        const app = express(); app.use(express.json()); app.use(router);
        const result = kind === 'sse' ? request(app).get('/sse') : request(app).post('/mcp').send(initialize);
        const response = result.then(value => value);
        await started.promise;
        let closed = false;
        const cleanup = router.cleanup().then(() => { closed = true; });
        try {
            expect((await response).status).toBe(503);
            expect(closed).toBe(false);
            release.resolve(fake as unknown as McpServer);
            await cleanup;
            expect(fake.connect).not.toHaveBeenCalled();
            expect(fake.close).toHaveBeenCalledTimes(1);
        } finally {
            release.resolve(fake as unknown as McpServer);
            await cleanup;
        }
    });

    it.each(['sse', 'stateless', 'stateful'] as const)('awaits asynchronous %s server disposal and catches failures', async kind => {
        process.env.STREAMABLE_STATELESS_MODE = String(kind === 'stateless');
        const serverCloseStarted = deferred<void>();
        const releaseClose = deferred<void>();
        const transportCloseStarted = deferred<void>();
        const releaseTransportClose = deferred<void>();
        const fake = {
            connect: jest.fn(async () => { throw new Error('connect failed'); }),
            close: jest.fn(async () => { serverCloseStarted.resolve(); await releaseClose.promise; throw new Error('close failed'); })
        };
        const transportPrototype = kind === 'sse' ? SSEServerTransport.prototype : NodeStreamableHTTPServerTransport.prototype;
        const originalClose = transportPrototype.close;
        const transportClosed = jest.spyOn(transportPrototype, 'close').mockImplementation(async function(this: SSEServerTransport & NodeStreamableHTTPServerTransport) {
            await originalClose.call(this);
            transportCloseStarted.resolve();
            await releaseTransportClose.promise;
            throw new Error('transport close failed');
        });
        const factory = async () => fake as unknown as McpServer;
        const router = kind === 'sse' ? createSseRouter(factory) : createStreamableHttpRouter(factory);
        const app = express(); app.use(express.json()); app.use(router);
        const result = kind === 'sse' ? request(app).get('/sse') : request(app).post('/mcp').send(initialize);
        const response = result.then(value => value);
        await serverCloseStarted.promise;
        let finished = false;
        const cleanup = router.cleanup().then(() => { finished = true; });
        await tick();
        expect(finished).toBe(false);
        releaseClose.resolve();
        await transportCloseStarted.promise;
        await tick();
        expect(finished).toBe(false);
        releaseTransportClose.resolve();
        await cleanup;
        expect((await response).status).toBe(500);
        expect(fake.close).toHaveBeenCalledTimes(1);
        expect(transportClosed).toHaveBeenCalledTimes(1);
        await router.cleanup();
    });

    it('releases a successful stateful session on DELETE and does not await an arbitrary timer', async () => {
        process.env.STREAMABLE_STATELESS_MODE = 'false';
        const server = new McpServer({ name: 'lifecycle', version: '1' });
        const close = jest.spyOn(server, 'close');
        const router = createStreamableHttpRouter(async () => server);
        const app = express(); app.use(express.json()); app.use(router);
        const accept = { Accept: 'application/json, text/event-stream' };
        try {
            const initial = await request(app).post('/mcp').set(accept).send(initialize).expect(200);
            const session = initial.headers['mcp-session-id'];
            await request(app).delete('/mcp').set({ ...accept, 'mcp-session-id': session }).expect(200);
            await router.cleanup();
            expect(close).toHaveBeenCalledTimes(1);
            await request(app).get('/health').expect(503);
        } finally { await router.cleanup(); }
    });
});
