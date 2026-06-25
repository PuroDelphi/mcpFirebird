# Using MCP Firebird from Different Clients

This document shows how to use MCP Firebird from different programming languages and clients, using the modern **Streamable HTTP (SSE)** transport and **Enterprise Managed Authorization (EMA)**.

## TypeScript/JavaScript

With the official MCP SDK, connecting to an MCP Firebird server running in Streamable HTTP mode is incredibly easy and much more robust than managing raw `stdio` child processes.

First, install the MCP SDK:
```bash
npm install @modelcontextprotocol/sdk
```

Then, use the `StreamableHTTPClientTransport`:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

async function main() {
    console.log("Connecting to MCP Firebird...");

    // Connect to the remote server using the Streamable HTTP protocol
    // Pass the EMA API Key via the Authorization header
    const transport = new StreamableHTTPClientTransport(
        new URL("http://localhost:3003/mcp"),
        {
            headers: {
                "Authorization": "Bearer my_super_secret_api_key"
            }
        }
    );

    const client = new Client(
        { name: "my-custom-client", version: "1.0.0" },
        { capabilities: { resources: { subscribe: true } } }
    );

    try {
        await client.connect(transport);
        console.log("✅ Connected.");

        // Example 1: Use a tool
        console.log("Executing a query...");
        const queryResult = await client.callTool({
            name: "execute-query",
            arguments: { sql: "SELECT FIRST 5 * FROM EMPLOYEES" }
        });
        console.log("Results:", JSON.stringify(queryResult, null, 2));

        // Example 2: Subscribe to a Proactive Event
        console.log("Subscribing to new orders...");
        await client.callTool({
            name: "subscribe_to_event",
            arguments: { eventName: "NEW_ORDER" }
        });

        // The SDK will automatically handle incoming Server-Sent Events!
        // You just need to listen to resource updates:
        client.on("notification", (notification) => {
            if (notification.method === "notifications/resources/updated") {
                console.log(`🔔 Event Triggered! Resource updated: ${notification.params.uri}`);
            }
        });

    } catch (error) {
        console.error("Error:", error.message);
    }
}

main();
```

## Python

If you are using Python, you can use the official `mcp` Python SDK:

```bash
pip install mcp
```

```python
import asyncio
from mcp.client.session import ClientSession
from mcp.client.sse import sse_client

async def main():
    url = "http://localhost:3003/mcp"
    headers = {
        "Authorization": "Bearer my_super_secret_api_key"
    }

    # Connect via SSE (Streamable HTTP)
    async with sse_client(url, headers=headers) as streams:
        async with ClientSession(streams[0], streams[1]) as session:
            # Initialize the session
            await session.initialize()
            print("✅ Connected to MCP Firebird")

            # Call a tool
            result = await session.call_tool(
                "execute-query", 
                arguments={"sql": "SELECT FIRST 5 * FROM EMPLOYEES"}
            )
            print("Query Results:")
            print(result)

if __name__ == "__main__":
    asyncio.run(main())
```

## Low-Code Platforms (n8n, Make)

Because MCP Firebird now supports standard Streamable HTTP, integrating it into low-code automation tools like n8n is straightforward.

1. Configure your n8n instance to use the MCP functionality (requires n8n 1.0+ with MCP enabled).
2. Add a new MCP Server Connection.
3. Choose **HTTP / SSE** as the transport type.
4. Set the Server URL to `http://YOUR_SERVER_IP:3003/mcp`.
5. Under Headers, add:
   - Key: `Authorization`
   - Value: `Bearer your_super_secret_api_key`
6. Connect. You will immediately have access to all Firebird tools (`execute-query`, `list-tables`, etc.) directly as native n8n nodes!

## Legacy STDIO (Raw IPC)

If you must use the legacy `stdio` transport (e.g., local Claude Desktop), you no longer need to write complex JSON-RPC parsing manually. Use the standard `@modelcontextprotocol/sdk/client/stdio.js` transport provided by Anthropic, and spawn `mcp-firebird` directly.
