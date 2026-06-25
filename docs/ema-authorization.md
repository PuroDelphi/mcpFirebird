# Enterprise Managed Authorization (EMA)

When you expose an MCP server on a network (for example, to connect it to a remote n8n workflow), a security issue arises: **you don't want your database credentials traveling over the network, nor do you want the LLM client to have direct access to the `SYSDBA` password.**

To solve this professionally, MCP Firebird introduces **Enterprise Managed Authorization (EMA)**.

## What is EMA?

EMA allows the MCP server to act as a secure intermediary. The server stores the real database password locally and instead requires external clients to provide a simple `--api-key` or Bearer Token.

When the client connects by providing the correct API Key, the MCP server authorizes the connection and internally "injects" the real database password to execute queries. This way, the remote client never knows the actual database password.

## How to Set Up EMA

### 1. Configure the Server

Start the MCP Firebird server by defining two vital things:
1. The REAL database password (using `--password` or `FIREBIRD_PASSWORD`).
2. The secret API Key that external clients will use (using `--api-key` or `FIREBIRD_API_KEY`).

```bash
# Recommended environment variables for secure deployments:
export FIREBIRD_PASSWORD=TheRealSecretPassword
export FIREBIRD_API_KEY=SuperSecureToken123

# Start the server
mcp-firebird --database /path/to/database.fdb --user SYSDBA
```

If you prefer command line arguments:
```bash
mcp-firebird --database /path/to/database.fdb --user SYSDBA --password "TheRealSecretPassword" --api-key "SuperSecureToken123"
```

### 2. Configure the External Client

Now, any client (n8n, a custom Python script, or another remote LLM) trying to connect to the server via HTTP/SSE will need to provide that token. They will not need the database password.

If you use the TypeScript SDK with `StreamableHTTPClientTransport`, you can pass the headers directly:

```typescript
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// The client MUST send the Authorization header with the token
const transport = new StreamableHTTPClientTransport(
    new URL("http://SERVER_IP:3003/mcp"),
    {
        headers: {
            "Authorization": "Bearer SuperSecureToken123"
        }
    }
);

// Connect normally
const client = new Client(...);
await client.connect(transport);
```

### Network Security

> [!CAUTION]
> If you are going to expose your MCP server to the Internet or a Wide Area Network, you should **ALWAYS** place a reverse proxy (like Nginx or Caddy) with SSL/TLS encryption (HTTPS) in front of the MCP server. The API Key will travel in plain text if the connection is standard HTTP.
