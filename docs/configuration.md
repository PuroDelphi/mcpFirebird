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

# Transport configuration
TRANSPORT_TYPE=stdio  # Options: stdio, sse
SSE_PORT=3003
```

## Using with npx

You can run the server directly with npx:

```bash
npx mcp-firebird --host localhost --port 3050 --database /path/to/database.fdb --user SYSDBA --password masterkey
```

## SSE (Server-Sent Events) Transport

MCP Firebird supports SSE transport for communication with web clients:

```bash
# Run with SSE transport
export TRANSPORT_TYPE=sse
export SSE_PORT=3003
npx mcp-firebird
```

Or using command line parameters:

```bash
npx mcp-firebird --transport-type sse --sse-port 3003 --database /path/to/database.fdb --host localhost --port 3050 --user SYSDBA --password masterkey
```

### SSE Client Examples

```javascript
// JavaScript client
const eventSource = new EventSource('http://localhost:3003');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
};

// Send request
fetch('http://localhost:3003', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    id: '1',
    method: 'execute-query',
    params: {
      sql: 'SELECT * FROM RDB$RELATIONS'
    }
  })
});
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
        "mcp-firebird",
        "--database",
        "C:\\path\\to\\database.fdb",
        "--host",
        "localhost",
        "--port",
        "3050",
        "--database",
        "/path/to/database.fdb",
        "--user",
        "SYSDBA",
        "--password",
        "masterkey"
      ],
      "type": "stdio"
    }
  }
}
```

> **Note**: Make sure to use absolute paths in the configuration.

After saving the file, you need to completely restart Claude Desktop.
