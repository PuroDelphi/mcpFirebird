# Proactive Events and Bidirectional Streaming in MCP 2.7+

As of MCP version 2.7+, the MCP Firebird server fully supports **Streamable HTTP** and **Proactive Events** (Firebird `POST_EVENT` triggers). This allows the database to notify MCP clients in real-time when changes occur.

## What are Proactive Events?

Instead of the client (like an LLM or n8n) repeatedly querying the database to see if something changed (Polling), Firebird can emit an event at the exact moment the change occurs using the `POST_EVENT` instruction.
Through MCP with HTTP/SSE transport, the MCP server listens for these events and instantly relays them to the client.

### Requirements

1. **Network Transport**: You must use `TRANSPORT_TYPE=sse` or `TRANSPORT_TYPE=unified` or `http`. The `stdio` transport does not support sending proactive event notifications from the server to the client in standard MCP.
2. **Native Driver**: Listening for events requires the native Firebird driver. You must start the server with the `--use-native-driver` flag.

## Quick Setup

### 1. In the Database (Firebird)

First, you need to create a trigger in your database that fires the event:

```sql
CREATE OR ALTER TRIGGER TRG_NEW_ORDER FOR ORDERS
ACTIVE AFTER INSERT POSITION 0
AS
BEGIN
  -- Fires an event named 'NEW_ORDER'
  POST_EVENT 'NEW_ORDER';
END
```

### 2. Start the MCP Server

Start the server by enabling the native driver, an SSE/HTTP port, and optional authentication (EMA):

```bash
npx -y mcp-firebird \
  --transport-type sse \
  --sse-port 3003 \
  --use-native-driver \
  --database /path/to/database.fdb \
  --user SYSDBA \
  --password masterkey \
  --api-key your_secret_key
```

### 3. Subscribe from the Client

The client can use the `subscribe_to_event` tool to start listening. When the event occurs in the database, the MCP client will receive a system notification.

Example from a client using the TypeScript SDK:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const transport = new StreamableHTTPClientTransport(
  new URL("http://localhost:3003/mcp"),
  { headers: { Authorization: "Bearer your_secret_key" } }
);

const client = new Client(
    { name: "my-client", version: "1.0.0" },
    { capabilities: { resources: { subscribe: true } } }
);

await client.connect(transport);

// Notification handler
client.setNotificationHandler("notifications/message", (notification) => {
    console.log("Event received!", notification);
});

// Subscribe to the Firebird event
await client.callTool({
  name: "subscribe_to_event",
  arguments: { eventName: "NEW_ORDER" }
});

console.log("Listening for events...");
```

## Use Cases

* **Real-time Automation (n8n/Make):** Trigger a workflow immediately after a record is inserted, instead of querying every minute.
* **Cache Synchronization:** Invalidate local caches when catalogs change in the database.
* **Proactive Agents:** A "sleeping" LLM can be awakened by an event notification to analyze an anomaly exactly when it occurs.
