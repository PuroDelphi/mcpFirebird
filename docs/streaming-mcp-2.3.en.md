# Bidirectional Streaming (Streamable HTTP / SSE) in MCP 2.3+

As of MCP version 2.3+, the MCP Firebird server fully supports **Streamable HTTP** using Server-Sent Events (SSE). This is the modern standard recommended for network environments (such as n8n, Claude Desktop via HTTP, remote agents, and Docker deployments).

## Why use Streamable HTTP?

Unlike standard `stdio` (standard input/output) communication, which requires both the client and the server to run on the exact same physical machine or container, the HTTP transport allows you to:

1. **Separated Deployments:** Your database and MCP server can reside in a secure, internal network, while the LLM or automation client (like n8n) is in the cloud or another server.
2. **Bidirectional Streaming:** Unlike traditional REST HTTP API calls, Streamable HTTP maintains a persistent open connection (using SSE to send events from the server to the client, and standard HTTP POST requests to send client queries to the server).
3. **Stateful Session Management:** The client and server establish a session using an `mcp-session-id`, ensuring that state (such as subscribed events or pagination cursors) is kept alive across requests.

## Quick Setup

To enable this mode, you need to configure the server environment and then point to it from your client.

### 1. Start the Server

Use the `TRANSPORT_TYPE=sse` environment variable.

```bash
export TRANSPORT_TYPE=sse
export SSE_PORT=3003
mcp-firebird --database /path/to/database.fdb --user SYSDBA
```

The server will listen on the specified port. In this case, the initialization endpoint (McpServer) will be `http://localhost:3003/mcp`.

### 2. Configure the Client (TypeScript SDK Example)

When setting up an MCP client (or an n8n node that speaks MCP), make sure to use `StreamableHTTPClientTransport` or provide the URL to the endpoint.

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// Connect using the Streamable HTTP protocol
const transport = new StreamableHTTPClientTransport(new URL("http://localhost:3003/mcp"));

const client = new Client(
    { name: "my-client", version: "1.0.0" },
    { capabilities: { resources: { subscribe: true } } }
);

await client.connect(transport);
console.log("Successfully connected via HTTP!");
```

### 3. Networking Considerations

- **CORS:** The server is configured by default to support CORS (`Access-Control-Allow-Origin: *`).
- **Reverse Proxy:** If you use Nginx, Caddy or similar, make sure to disable "buffering" for SSE requests, otherwise the server's real-time events might be delayed or blocked from reaching the client.
  Nginx example: `proxy_buffering off;`
