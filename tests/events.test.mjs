import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createEventClient, closeEventManager, eventNameFromUri, setupEventResources } from '../dist/resources/events.js';
import { DriverFactory, DriverType } from '../dist/db/driver-factory.js';
import { securityConfig, DEFAULT_SECURITY_CONFIG } from '../dist/security/config.js';

const originals = { getDriverInfo: DriverFactory.getDriverInfo, getDriver: DriverFactory.getDriver };
let managers, attaches, detaches, closes, failRegistration;
class Manager extends EventEmitter {
    names = new Set();
    registerEvent(names, callback) {
        if (failRegistration) return callback(new Error('Registration rejected'));
        for (const name of names) this.names.add(name);
        callback();
    }
    unregisterEvent(names, callback) { for (const name of names) this.names.delete(name); callback(); }
    close(callback) { closes++; callback(); }
}
beforeEach(() => {
    managers = []; attaches = 0; detaches = 0; closes = 0; failRegistration = false;
    for (const key of Object.keys(securityConfig)) delete securityConfig[key];
    Object.assign(securityConfig, structuredClone(DEFAULT_SECURITY_CONFIG));
    DriverFactory.getDriverInfo = async () => ({ current: DriverType.PURE_JS });
    DriverFactory.getDriver = async () => ({ attach: async () => {
        attaches++;
        return {
            attachEvent(callback) { const manager = new Manager(); managers.push(manager); callback(null, manager); },
            detach(callback) { detaches++; callback(); }
        };
    } });
});
afterEach(async () => {
    await closeEventManager();
    Object.assign(DriverFactory, originals);
});

function fakeServer() {
    const tools = new Map(), requests = new Map(), resources = new Map(), notifications = [];
    return {
        tools, requests, resources, notifications,
        server: {
            registerCapabilities(capabilities) { this.capabilities = capabilities; },
            setRequestHandler(method, handler) { requests.set(method, handler); },
            async sendResourceUpdated(params) { notifications.push(params); }
        },
        registerTool(name, config, handler) { tools.set(name, { config, handler }); },
        registerResource(name, template, config, handler) { resources.set(name, { template, config, handler }); }
    };
}

test('concurrent registrations share one attachment and route updates to the correct client', async () => {
    const receivedA = [], receivedB = [];
    const a = createEventClient(uri => receivedA.push(uri));
    const b = createEventClient(uri => receivedB.push(uri));
    await Promise.all([a.subscribe(['A']), b.subscribe(['B'])]);
    assert.equal(attaches, 1);
    managers[0].emit('post_event', 'A', 1);
    assert.deepEqual(receivedA, ['firebird://events/A']);
    assert.deepEqual(receivedB, []);
    managers[0].emit('post_event', 'B', 2);
    assert.deepEqual(receivedB, ['firebird://events/B']);
    assert.equal(a.state('B').registered, false);
    assert.equal(a.state('A').count, 1);
});

test('deduplicates shared bus sinks and one unsubscribe cannot stop another subscriber', async () => {
    const received = [];
    const sink = uri => received.push(uri);
    const a = createEventClient(sink), b = createEventClient(sink);
    await Promise.all([a.subscribe(['SAME']), b.subscribe(['SAME'])]);
    managers[0].emit('post_event', 'SAME', 1);
    assert.deepEqual(received, ['firebird://events/SAME']);
    await a.unsubscribe('SAME');
    assert.equal(detaches, 0);
    managers[0].emit('post_event', 'SAME', 2);
    assert.equal(received.length, 2);
    assert.equal(b.state('SAME').registered, true);
    await a.close();
    await b.close();
    assert.equal(closes, 1);
    assert.equal(detaches, 1);
});

test('disconnect releases registrations and permits a clean reconnect', async () => {
    const received = [];
    const a = createEventClient(uri => received.push(uri));
    await a.subscribe(['A']);
    await a.close();
    await a.close();
    managers[0].emit('post_event', 'A', 1);
    assert.deepEqual(received, []);
    assert.equal(detaches, 1);
    const b = createEventClient(uri => received.push(uri));
    await b.subscribe(['A']);
    assert.equal(attaches, 2);
    assert.equal(b.state('A').count, 0);
    managers[1].emit('post_event', 'A', 3);
    assert.deepEqual(received, ['firebird://events/A']);
});

test('registration failure rolls back ownership and closes an unused attachment', async () => {
    failRegistration = true;
    const client = createEventClient(() => {});
    await assert.rejects(client.subscribe(['A']), /Registration rejected/);
    assert.equal(client.state('A').registered, false);
    assert.equal(detaches, 1);
    failRegistration = false;
    await client.subscribe(['A']);
    assert.equal(attaches, 2);
});

test('scoped policies block registration and suppress previously enabled event delivery', async () => {
    const received = [];
    const client = createEventClient(uri => received.push(uri));
    await client.subscribe(['A']);
    securityConfig.allowedTables = ['PUBLIC'];
    await assert.rejects(client.subscribe(['B']), /disabled with scoped security policies/);
    managers[0].emit('post_event', 'A', 1);
    assert.deepEqual(received, []);
    const server = fakeServer();
    setupEventResources(server);
    assert.equal(server.tools.size, 0);
    assert.equal(server.resources.size, 0);
});

test('legacy resource subscribe and unsubscribe control notifications', async () => {
    const server = fakeServer();
    setupEventResources(server, { era: 'legacy' });
    assert.equal(server.server.capabilities.resources.subscribe, true);
    await server.tools.get('subscribe_to_event').handler({ eventName: 'A' });
    managers[0].emit('post_event', 'A', 1);
    assert.deepEqual(server.notifications, []);
    await server.requests.get('resources/subscribe')({ params: { uri: 'firebird://events/A' } });
    managers[0].emit('post_event', 'A', 2);
    assert.deepEqual(server.notifications, [{ uri: 'firebird://events/A' }]);
    await server.requests.get('resources/unsubscribe')({ params: { uri: 'firebird://events/A' } });
    managers[0].emit('post_event', 'A', 3);
    assert.equal(server.notifications.length, 1);
    assert.equal(detaches, 1);
});

test('modern stdio sends typed updates and cleans up on connection close', async () => {
    const server = fakeServer();
    setupEventResources(server, { era: 'modern' });
    await server.tools.get('subscribe_to_event').handler({ eventName: 'A' });
    managers[0].emit('post_event', 'A', 1);
    assert.deepEqual(server.notifications, [{ uri: 'firebird://events/A' }]);
    assert.equal(server.requests.size, 0);
    server.server.onclose();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(detaches, 1);
});

test('modern request factories retain no listeners and return stream lifecycle instructions', async () => {
    const server = fakeServer();
    setupEventResources(server, { era: 'modern', eventLifetime: 'request' });
    for (const name of ['subscribe_to_event', 'unsubscribe_from_event']) {
        const tool = server.tools.get(name);
        const result = await tool.handler({ eventName: 'A' });
        assert.notEqual(result.isError, true);
        assert.match(result.content[0].text, /subscriptions\/listen/);
        assert.equal(result.structuredContent.result.uri, 'firebird://events/A');
        assert.equal(tool.config.outputSchema.safeParse(result.structuredContent).success, true);
    }
    assert.equal(attaches, 0);
    assert.equal(server.server.onclose, undefined);
});

test('event resource URIs are encoded and validated', async () => {
    assert.equal(eventNameFromUri('firebird://events/ORDER%20READY'), 'ORDER READY');
    assert.throws(() => eventNameFromUri('https://example.test/A'));
    assert.throws(() => eventNameFromUri('firebird://events/A?other=1'));
    assert.throws(() => eventNameFromUri('firebird://user@events/A'));
    assert.throws(() => eventNameFromUri('firebird://events/ORDER READY'));
    assert.throws(() => eventNameFromUri('firebird://events:3000/A'));
    assert.throws(() => eventNameFromUri('firebird://events/A/B'));
    assert.throws(() => eventNameFromUri(`firebird://events/${encodeURIComponent('é'.repeat(64))}`));
    const received = [];
    const client = createEventClient(uri => received.push(uri));
    await client.subscribe(['ORDER READY']);
    managers[0].emit('post_event', 'ORDER READY', 1);
    assert.deepEqual(received, ['firebird://events/ORDER%20READY']);
});

test('native queue handles are cancelled and detached, without repeated registration churn', async () => {
    let callback, queues = 0, cancels = 0;
    DriverFactory.getDriverInfo = async () => ({ current: DriverType.NATIVE });
    DriverFactory.getDriver = async () => ({ attach: async () => ({
        _nativeAttachment: { async queueEvents(names, handler) { queues++; callback = handler; return { async cancel() { cancels++; } }; } },
        detach(done) { detaches++; done(); }
    }) });
    const received = [];
    const client = createEventClient(uri => received.push(uri));
    await client.subscribe(['NATIVE']);
    await client.subscribe(['NATIVE']);
    assert.equal(queues, 1);
    await callback([['NATIVE', 0]]);
    assert.deepEqual(received, []);
    await callback([['NATIVE', 4]]);
    assert.deepEqual(received, ['firebird://events/NATIVE']);
    await client.close();
    assert.equal(cancels, 1);
    assert.equal(detaches, 1);
});
