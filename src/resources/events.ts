import { z } from 'zod';
import { McpServer, ResourceTemplate, type ProtocolEra } from '@modelcontextprotocol/server';
import { createLogger } from '../utils/logger.js';
import { FirebirdError } from '../utils/errors.js';
import { DriverFactory, DriverType } from '../db/driver-factory.js';
import { getDefaultConfig } from '../db/connection.js';
import { securityConfig } from '../security/config.js';
import { toolError, toolOutputSchema, toolResult } from '../tools/contracts.js';

function assertEventPolicy(): void {
    if (securityConfig.authorization?.type && securityConfig.authorization.type !== 'none' ||
        securityConfig.allowedTables || securityConfig.forbiddenTables?.length || securityConfig.tableNamePattern ||
        Object.keys(securityConfig.rowFilters || {}).length || securityConfig.dataMasking?.length) {
        throw new FirebirdError('Shared event subscriptions are disabled with scoped security policies', 'SECURITY_ERROR');
    }
}

const logger = createLogger('resources:events');
const EventName = z.string().min(1).max(127).regex(/^[^\u0000-\u001f\u007f]+$/)
    .refine(name => Buffer.byteLength(name, 'utf8') <= 127, 'Firebird event names must not exceed 127 UTF-8 bytes');
const eventUri = (name: string) => `firebird://events/${encodeURIComponent(name)}`;
const MAX_REGISTERED_EVENTS = 128;

export function eventNameFromUri(uri: string): string {
    const url = new URL(uri);
    if (url.protocol !== 'firebird:' || url.host !== 'events' || url.search || url.hash || !url.pathname.startsWith('/')) {
        throw new FirebirdError('Expected a firebird://events/{eventName} resource URI', 'VALIDATION_ERROR');
    }
    const name = EventName.parse(decodeURIComponent(url.pathname.slice(1)));
    // The SDK matches subscription URIs exactly. Reject aliases rather than
    // registering a listener whose canonical update URI would never match.
    if (uri !== eventUri(name)) throw new FirebirdError('Use the canonical URI-encoded Firebird event resource URI', 'VALIDATION_ERROR');
    return name;
}

interface EventState { count: number; lastFired: Date | null }
interface EventBackend { setEvents(names: string[]): Promise<void>; close(): Promise<void> }
const states = new Map<string, EventState>();
const clients = new Set<EventClientImpl>();
let backend: EventBackend | undefined;
let backendEvents = new Set<string>();
let operations: Promise<unknown> = Promise.resolve();

function serialized<T>(operation: () => Promise<T>): Promise<T> {
    const result = operations.then(operation);
    operations = result.catch(() => undefined);
    return result;
}

function callbackOperation(operation: (callback: (error?: unknown) => void) => void): Promise<void> {
    return new Promise((resolve, reject) => operation(error => error ? reject(error) : resolve()));
}

function publish(name: string, count: number): void {
    try { assertEventPolicy(); } catch { return; }
    if (!states.has(name) || count <= 0) return;
    states.set(name, { count, lastFired: new Date() });
    const sinks = new Set([...clients].map(client => client.sinkFor(name)).filter(sink => sink !== undefined));
    for (const sink of sinks) {
        try { Promise.resolve(sink(eventUri(name))).catch(error => logger.error('Failed to deliver resource update', { error })); }
        catch (error) { logger.error('Failed to deliver resource update', { error }); }
    }
}

async function openBackend(): Promise<EventBackend> {
    const driverInfo = await DriverFactory.getDriverInfo();
    const driver = await DriverFactory.getDriver();
    const db = await driver.attach(getDefaultConfig());
    const detach = () => callbackOperation(callback => db.detach(callback));
    try {
        if (driverInfo.current === DriverType.NATIVE) {
            const attachment = (db as any)._nativeAttachment;
            if (!attachment || typeof attachment.queueEvents !== 'function') throw new Error('Native driver event API unavailable');
            let events: { cancel(): Promise<void> } | undefined;
            return {
                async setEvents(names) {
                    await events?.cancel();
                    events = undefined;
                    if (names.length) events = await attachment.queueEvents(names, async (counters: [string, number][]) => {
                        for (const [name, count] of counters) publish(name, count);
                    });
                },
                async close() { try { await events?.cancel(); } finally { await detach(); } }
            };
        }
        const target = (db as any)._nativeAttachment || db;
        if (typeof target.attachEvent !== 'function') throw new Error('Driver event API unavailable');
        const manager: any = await new Promise((resolve, reject) => {
            target.attachEvent((error: unknown, value: unknown) => error ? reject(error) : resolve(value));
        });
        manager.on('post_event', publish);
        let registered = new Set<string>();
        return {
            async setEvents(names) {
                const desired = new Set(names);
                const removed = [...registered].filter(name => !desired.has(name));
                const added = names.filter(name => !registered.has(name));
                if (removed.length) await callbackOperation(callback => manager.unregisterEvent(removed, callback));
                if (added.length) await callbackOperation(callback => manager.registerEvent(added, callback));
                registered = desired;
            },
            async close() {
                manager.removeListener('post_event', publish);
                // node-firebird's close callback is error-only; successful closure
                // is signaled by its event socket instead. Never wait for a success
                // callback that the installed driver does not invoke.
                try {
                    await new Promise<void>((resolve, reject) => {
                        const socket = manager.eventconnection?._socket;
                        const done = (error?: unknown) => {
                            clearTimeout(timeout);
                            socket?.removeListener('close', onClose);
                            error ? reject(error) : resolve();
                        };
                        const onClose = () => done();
                        const timeout = setTimeout(() => { socket?.destroy(); done(); }, 1000);
                        socket?.once('close', onClose);
                        manager.close(done);
                        if (!socket) done();
                    });
                } finally { await detach(); }
            }
        };
    } catch (error) {
        await detach().catch(() => undefined);
        throw new FirebirdError('Failed to initialize Firebird event connection', 'FIREBIRD_ERROR', error);
    }
}

async function reconcile(): Promise<void> {
    const names = [...new Set([...clients].flatMap(client => [...client.events]))];
    if (names.length > MAX_REGISTERED_EVENTS) throw new FirebirdError('Too many active Firebird events', 'RESOURCE_LIMIT_EXCEEDED');
    if (!names.length) {
        const closing = backend;
        backend = undefined;
        backendEvents.clear();
        states.clear();
        await closing?.close();
        return;
    }
    backend ||= await openBackend();
    // Seed state before registration because a driver may immediately report a counter.
    for (const name of names) if (!states.has(name)) states.set(name, { count: 0, lastFired: null });
    if (names.length !== backendEvents.size || names.some(name => !backendEvents.has(name))) {
        await backend.setEvents(names);
        backendEvents = new Set(names);
    }
    for (const name of states.keys()) if (!names.includes(name)) states.delete(name);
}

export interface EventClient {
    subscribe(events: string[]): Promise<void>;
    unsubscribe(event: string): Promise<void>;
    state(event: string): EventState & { registered: boolean };
    close(): Promise<void>;
}

class EventClientImpl implements EventClient {
    readonly events = new Set<string>();
    private closed = false;
    constructor(private readonly notify: (uri: string) => void | Promise<void>) {}
    async subscribe(events: string[]): Promise<void> {
        assertEventPolicy();
        const names = events.map(event => EventName.parse(event));
        await serialized(async () => {
            if (this.closed) throw new Error('Event client is closed');
            const previous = new Set(this.events);
            for (const name of names) this.events.add(name);
            try { await reconcile(); }
            catch (error) {
                this.events.clear();
                for (const name of previous) this.events.add(name);
                // Reconcile after a failed driver registration without swallowing
                // the original error or leaving this client falsely registered.
                await reconcile().catch(cleanupError => logger.error('Event registration rollback failed', { error: cleanupError }));
                throw error;
            }
        });
    }
    async unsubscribe(event: string): Promise<void> {
        assertEventPolicy();
        await serialized(async () => { this.events.delete(event); await reconcile(); });
    }
    state(event: string): EventState & { registered: boolean } {
        assertEventPolicy();
        const registered = !this.closed && this.events.has(event);
        return { ...(registered ? states.get(event) : undefined) || { count: 0, lastFired: null }, registered };
    }
    sinkFor(event: string): ((uri: string) => void | Promise<void>) | undefined {
        return !this.closed && this.events.has(event) ? this.notify : undefined;
    }
    async close(): Promise<void> {
        if (this.closed) return;
        this.closed = true;
        clients.delete(this);
        await serialized(async () => { this.events.clear(); await reconcile(); });
    }
}

/** One owner per stdio/legacy connection or validated modern HTTP listen stream. */
export function createEventClient(notify: (uri: string) => void | Promise<void>): EventClient {
    const client = new EventClientImpl(notify);
    clients.add(client);
    return client;
}

export interface EventResourceOptions {
    era?: ProtocolEra;
    /** Modern HTTP requests never own persistent driver registrations. */
    eventLifetime?: 'request' | 'connection';
}

export function setupEventResources(server: McpServer, options: EventResourceOptions = {}): void {
    try { assertEventPolicy(); } catch { return; }
    const subscriptions = new Set<string>();
    const client = options.eventLifetime === 'request' ? undefined : createEventClient(uri => {
        if (options.era === 'modern' || subscriptions.has(uri)) return server.server.sendResourceUpdated({ uri });
    });
    server.server.registerCapabilities({ resources: { subscribe: true } });
    if (client) {
        const onclose = server.server.onclose;
        server.server.onclose = () => {
            onclose?.();
            subscriptions.clear();
            void client.close().catch(error => logger.error('Event cleanup failed', { error }));
        };
    }
    // Only 2025 uses these request methods. The 2026 serving entries own
    // subscriptions/listen, cancellation, URI filtering and stream teardown.
    if (client && options.era !== 'modern') {
        server.server.setRequestHandler('resources/subscribe', async request => {
            assertEventPolicy();
            const name = eventNameFromUri(request.params.uri);
            await client.subscribe([name]);
            subscriptions.add(eventUri(name));
            return {};
        });
        server.server.setRequestHandler('resources/unsubscribe', async request => {
            assertEventPolicy();
            const name = eventNameFromUri(request.params.uri);
            subscriptions.delete(eventUri(name));
            await client.unsubscribe(name);
            return {};
        });
    }
    server.registerResource('firebird-event', new ResourceTemplate('firebird://events/{eventName}', { list: undefined }), {
        title: 'Firebird Event State', description: 'Latest observed count for a registered Firebird POST_EVENT event', mimeType: 'application/json'
    }, async uri => {
        const name = eventNameFromUri(uri.href);
        assertEventPolicy();
        const state = client?.state(name) || { ...(states.get(name) || { count: 0, lastFired: null }), registered: states.has(name) };
        return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify({
            event: name, count: state.count, lastFired: state.lastFired,
            status: state.registered ? 'subscribed' : 'unsubscribed',
            note: 'Register the event, then subscribe to its URI using the MCP subscription method for your protocol version.'
        }, null, 2) }] };
    });
    const outputSchema = toolOutputSchema(z.object({
        eventName: z.string(), uri: z.string(), registered: z.boolean().optional(),
        subscriptionAction: z.enum(['open', 'close']).optional()
    }));
    for (const subscribe of [true, false]) {
        const name = subscribe ? 'subscribe_to_event' : 'unsubscribe_from_event';
        server.registerTool(name, {
            title: name,
            description: !client
                ? `Returns the event URI and instructions to ${subscribe ? 'open' : 'close'} a 2026 subscriptions/listen stream; does not change listener registrations`
                : subscribe
                ? 'Register a Firebird POST_EVENT listener; MCP resource subscription is also required for notifications'
                : 'Release a Firebird event registration owned by this connection or HTTP application',
            inputSchema: z.object({ eventName: EventName }), outputSchema,
            annotations: { readOnlyHint: !client, destructiveHint: false, idempotentHint: true, openWorldHint: false }
        }, async ({ eventName }) => {
            try {
                assertEventPolicy();
                if (!client) return toolResult({ eventName, uri: eventUri(eventName), subscriptionAction: subscribe ? 'open' : 'close' }, {
                    text: subscribe
                        ? `Open subscriptions/listen with params.notifications.resourceSubscriptions containing '${eventUri(eventName)}'. The stream owns the Firebird listener and releases it on disconnect.`
                        : `Close or cancel your subscriptions/listen stream for '${eventUri(eventName)}' to release your listener. Other clients' subscriptions are unaffected.`
                });
                if (subscribe) await client.subscribe([eventName]);
                else { subscriptions.delete(eventUri(eventName)); await client.unsubscribe(eventName); }
                return toolResult({ eventName, uri: eventUri(eventName), registered: subscribe }, {
                    text: `${subscribe ? 'Registered' : 'Released'} Firebird event '${eventName}'. ${subscribe ? `Subscribe to '${eventUri(eventName)}' with your MCP protocol's resource subscription method to receive updates.` : ''}`.trim()
                });
            } catch (error) { return toolError(error); }
        });
    }
}

/** Idempotent shutdown releases all clients, native event handles and connections. */
export async function closeEventManager(): Promise<void> {
    await Promise.all([...clients].map(client => client.close()));
    await serialized(reconcile);
}
