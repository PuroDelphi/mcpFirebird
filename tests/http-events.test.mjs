import assert from 'node:assert/strict';
import test from 'node:test';
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { withHttpEventSubscriptions } from '../dist/server/event-http.js';

const delay = () => new Promise(resolve => setTimeout(resolve, 15));

test('modern HTTP event streams isolate filters and release registrations', { timeout: 10000 }, async () => {
    const handler = createMcpHandler(() => new McpServer({ name: 'events-test', version: '1' }, { capabilities: { resources: { subscribe: true } } }));
    const owners = new Set();
    const makeClient = sink => {
        const owner = { names: [], sink, closed: false };
        owners.add(owner);
        return {
            async subscribe(names) { owner.names.push(...names); },
            async unsubscribe() {}, state() { return { count: 0, lastFired: null, registered: true }; },
            async close() { owner.closed = true; owners.delete(owner); }
        };
    };
    const served = withHttpEventSubscriptions(handler, makeClient);
    const clients = [];
    const connect = async () => {
        const client = new Client({ name: 'event-client', version: '1' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
        const fetch = async (url, init) => {
            const request = new Request(url, init);
            const parsedBody = request.method === 'POST' ? await request.clone().json() : undefined;
            return served.fetch(request, { parsedBody });
        };
        await client.connect(new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), { fetch }));
        clients.push(client); return client;
    };
    try {
        const a = await connect(), b = await connect();
        const receivedA = [], receivedB = [];
        a.setNotificationHandler('notifications/resources/updated', n => { receivedA.push(n.params.uri); });
        b.setNotificationHandler('notifications/resources/updated', n => { receivedB.push(n.params.uri); });
        const sa = await a.listen({ resourceSubscriptions: ['firebird://events/A'] });
        const sb = await b.listen({ resourceSubscriptions: ['firebird://events/B'] });
        assert.equal(owners.size, 2);
        const [ownerA, ownerB] = [...owners];
        assert.equal(ownerA.sink, ownerB.sink, 'shared sink can be deduplicated by driver hub');
        ownerA.sink('firebird://events/A'); await delay();
        assert.deepEqual(receivedA, ['firebird://events/A']); assert.deepEqual(receivedB, []);
        await sa.close(); await delay();
        assert.equal(owners.size, 1); assert(ownerA.closed); assert(!ownerB.closed);
        ownerB.sink('firebird://events/B'); await delay();
        assert.deepEqual(receivedB, ['firebird://events/B']);
        await handler.close();
        assert.equal(await sb.closed, 'graceful'); await delay(); assert.equal(owners.size, 0);
    } finally { await Promise.all(clients.map(client => client.close())); await handler.close(); }
});
