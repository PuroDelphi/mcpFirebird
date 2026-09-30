/** Tie Firebird registrations to validated modern HTTP listen stream lifetimes. */
import type { McpHttpHandler, McpHandlerRequestOptions } from '@modelcontextprotocol/server';
import { createEventClient, eventNameFromUri } from '../resources/events.js';

type EventClientFactory = typeof createEventClient;

export function withHttpEventSubscriptions(handler: McpHttpHandler, makeClient: EventClientFactory = createEventClient) {
    // Reuse the same function identity so the hub publishes once when several streams
    // reference the same event. The SDK bus performs each stream's URI filtering.
    const publish = (uri: string) => handler.notify.resourceUpdated(uri);
    return {
        fetch: async (request: Request, options?: McpHandlerRequestOptions): Promise<Response> => {
            const response = await handler.fetch(request, options);
            const body = options?.parsedBody as { method?: string; id?: string | number; params?: { notifications?: { resourceSubscriptions?: string[] } } } | undefined;
            if (body?.method !== 'subscriptions/listen' || response.status !== 200 ||
                !response.headers.get('content-type')?.startsWith('text/event-stream') || !response.body) return response;
            let names: string[];
            try {
                names = [...new Set((body.params?.notifications?.resourceSubscriptions || [])
                    .filter(uri => uri.startsWith('firebird://events/')).map(eventNameFromUri))];
            } catch {
                await response.body.cancel();
                return Response.json({ jsonrpc: '2.0', id: body.id ?? null,
                    error: { code: -32602, message: 'Invalid Firebird event URI' } });
            }
            if (!names.length) return response;
            const client = makeClient(publish);
            const reader = response.body.getReader();
            let closed = false;
            const cleanup = async () => {
                if (closed) return;
                closed = true;
                request.signal.removeEventListener('abort', onAbort);
                await client.close();
            };
            const onAbort = () => { void cleanup().catch(() => {}); };
            request.signal.addEventListener('abort', onAbort, { once: true });
            try {
                await client.subscribe(names);
                if (request.signal.aborted) {
                    await cleanup(); await reader.cancel();
                    return new Response(null, { status: 499 });
                }
            } catch {
                await cleanup(); await reader.cancel();
                return Response.json({ jsonrpc: '2.0', id: body.id ?? null,
                    error: { code: -32603, message: 'Unable to subscribe to Firebird events' } });
            }
            const stream = new ReadableStream<Uint8Array>({
                async pull(controller) {
                    try {
                        const next = await reader.read();
                        if (next.done) { await cleanup(); controller.close(); }
                        else controller.enqueue(next.value);
                    } catch (error) { await cleanup(); controller.error(error); }
                },
                async cancel(reason) {
                    try { await reader.cancel(reason); } finally { await cleanup(); }
                }
            });
            return new Response(stream, { status: response.status, headers: response.headers });
        }
    };
}
