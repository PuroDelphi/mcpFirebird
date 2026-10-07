# Firebird events and MCP subscriptions

Firebird `POST_EVENT` notifications are exposed as resource updates at
`firebird://events/{eventName}`. Updates carry the resource URI, not database
rows or a trigger payload. Read the resource to retrieve its latest observed
counter and timestamp. Event names are URI-encoded.

Events work over stdio, Streamable HTTP (`/mcp`), and legacy HTTP+SSE
(`/sse` with `/messages`). A supported Firebird event API is required: the
native driver's `queueEvents`, or the pure-JavaScript driver's `attachEvent`.
Native libraries are only required when selecting the native driver. The
Firebird server must be reachable for the selected driver's event connection.

## Database example

```sql
CREATE OR ALTER TRIGGER TRG_NEW_ORDER FOR ORDERS
ACTIVE AFTER INSERT POSITION 0
AS
BEGIN
  POST_EVENT 'NEW_ORDER';
END
```

Creating this trigger is an administrator action, separate from subscribing.
The MCP server does not create it automatically or change SQL permissions.

## Protocol 2025 clients

1. Call `subscribe_to_event` with `{"eventName":"NEW_ORDER"}` to register the
   database listener, or subscribe to its resource directly
2. Send `resources/subscribe` with
   `{"uri":"firebird://events/NEW_ORDER"}`
3. Handle `notifications/resources/updated`, then read that URI when needed
4. Send `resources/unsubscribe` for that URI to release the registration

The tool alone does not opt a legacy client into MCP resource notifications.
Registrations and resource subscriptions belong to that connection/session.
Unsubscribing or disconnecting one client does not stop another client's
listener. A stateless 2025 HTTP request has no durable subscription lifetime;
use a sessionful transport for events.

## Protocol 2026-07-28 clients

Use `subscriptions/listen` with these request parameters (the SDK client may
expose this as a subscription filter):

```json
{
  "notifications": {
    "resourceSubscriptions": ["firebird://events/NEW_ORDER"]
  }
}
```

Include the protocol's normal per-request `_meta` envelope. The SDK validates
the request, acknowledges the accepted subscriptions, applies exact-URI filters,
and tags delivered updates with the subscription ID. An event update is
`notifications/resources/updated`, not `notifications/message`.

### HTTP

The validated open listen stream owns the Firebird registration. No separate
tool call is required. Cancel or close that stream to release its registrations;
other streams are unaffected. The server does not retain a per-request MCP
server after returning its response.

Over modern HTTP, `subscribe_to_event` and `unsubscribe_from_event` return the
URI and instructions to open/close a stream. They do not create or remove
persistent registrations themselves. Reconnect by opening a new listen stream.

### stdio

Call `subscribe_to_event` to register the database event, then open a
`subscriptions/listen` subscription for its URI on the same connection. Cancel
the subscription to stop delivery; call `unsubscribe_from_event` to release the
underlying registration, or close the connection to release all its events.
The SDK routes typed resource updates only to matching active subscriptions.

## Lifecycle, security, and limits

- One shared Firebird attachment listens for the union of active registrations
- Each connection or HTTP listen stream has its own registration owner
- Duplicate registrations share the underlying event listener; shared HTTP bus
  delivery is deduplicated
- The final owner disconnect cancels driver event handles and detaches the
  event connection; a later subscription opens a fresh connection
- Registration changes are serialized; failed registrations roll back ownership
- At most 128 distinct event names can be registered by this process; a driver
  may impose a lower limit and will return an error
- Scoped authorization, table restrictions, row filters, or data masking disable
  this shared event facility; enabling those policies also suppresses delivery
  from previously opened listeners

The latest counter is a driver-reported event counter, not a durable audit log.
Updates may be coalesced or missed while disconnected. Use database queries or
an application-owned durable queue if every change must be processed.
