# MCP Firebird Configuration

This document describes the different configuration options available for MCP Firebird.

## Environment Variables

You can configure the server using environment variables:

```bash
# Basic configuration
export FIREBIRD_HOST=localhost
export FIREBIRD_PORT=3050
export FIREBIRD_DATABASE=/path/to/database.fdb
export FIREBIRD_USER=SYSDBA
export FIREBIRD_PASSWORD=masterkey
export FIREBIRD_ROLE=undefined  # Optional

# Directory configuration (alternative)
export FIREBIRD_DATABASE_DIR=/path/to/databases  # Directory with databases

# Enterprise Managed Authorization (EMA)
export FIREBIRD_API_KEY=my_secret_token_123

# Logging configuration
export LOG_LEVEL=info  # Options: debug, info, warn, error
```

You can create a `.env` file in the project root to set these variables. A `.env.example` file is provided as a template.

## Example .env file

```
FIREBIRD_HOST=localhost
FIREBIRD_PORT=3050
FIREBIRD_DATABASE=F:\Proyectos\SAI\EMPLOYEE.FDB
FIREBIRD_USER=SYSDBA
FIREBIRD_PASSWORD=masterkey
FIREBIRD_ROLE=

# Enterprise Managed Authorization (EMA)
FIREBIRD_API_KEY=my_secret_token_123

# Transport configuration
TRANSPORT_TYPE=sse  # Recommended: sse (HTTP Streamable). Legacy: stdio
SSE_PORT=3003
```

## Using with npx

You can run the server directly with npx:

```bash
npx mcp-firebird --host localhost --port 3050 --database /path/to/database.fdb --user SYSDBA --password masterkey
```

## Streamable HTTP (SSE) Transport [RECOMMENDED]

MCP Firebird fully supports **Streamable HTTP (SSE)** for communication with network clients (like n8n or remote Claude deployments). This is the recommended transport mode.

```bash
# Run with Streamable HTTP transport
export TRANSPORT_TYPE=sse
export SSE_PORT=3003
npx -y mcp-firebird
```

Or using command line parameters:

```bash
npx -y mcp-firebird --transport-type sse --sse-port 3003 --database /path/to/database.fdb --host localhost --port 3050 --user SYSDBA --password masterkey --api-key my_secret_token_123
```

### HTTP Client Examples (EMA Authorization)

```javascript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// Connect using the Streamable HTTP protocol with EMA Bearer Token
const transport = new StreamableHTTPClientTransport(
    new URL("http://localhost:3003/mcp"),
    {
        headers: {
            "Authorization": "Bearer my_secret_token_123"
        }
    }
);

const client = new Client(
    { name: "my-client", version: "1.0.0" },
    { capabilities: { resources: { subscribe: true } } }
);

await client.connect(transport);
console.log("Successfully connected!");
```

## Configuration with Claude Desktop

To use the MCP Firebird server with Claude Desktop:

### Windows
```powershell
code $env:AppData\Claude\claude_desktop_config.json
```

### macOS/Linux
```bash
code ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

Add the following configuration:

```json
{
  "mcpServers": {
    "mcp-firebird": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-firebird",
        "--database",
        "C:\\path\\to\\database.fdb",
        "--host",
        "localhost",
        "--port",
        "3050",
        "--user",
        "SYSDBA",
        "--password",
        "masterkey"
      ]
    }
  }
}
```

> **Note**: Make sure to use absolute paths in the configuration.

After saving the file, you need to completely restart Claude Desktop.
