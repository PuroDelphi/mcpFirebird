# Transport Types in MCP Firebird

This document provides comprehensive examples and configuration for the different transport types supported by MCP Firebird.

## Overview

MCP Firebird supports **four transport modes**:

1. **STDIO (Standard Input/Output)** - For local integrations like Claude Desktop
2. **SSE (Server-Sent Events)** - Legacy web transport for backwards compatibility
3. **HTTP Streamable** - Modern MCP protocol (2025-03-26) with bidirectional communication
4. **Unified** - Supports both SSE and HTTP Streamable simultaneously with auto-detection

### Which Transport Should I Use?

| Transport | Use Case | Recommended For |
|-----------|----------|-----------------|
| **STDIO** | Local integration | Claude Desktop, CLI tools, single-user |
| **SSE** | Legacy web clients | Older MCP clients, backwards compatibility |
| **HTTP Streamable** | Modern web clients | New applications, production deployments |
| **Unified** | Mixed environments | Supporting both old and new clients |

**Recommendation:** Use **HTTP Streamable** or **Unified** for new projects. Use **STDIO** for Claude Desktop integration.

## STDIO Transport

### What is STDIO?

STDIO transport uses standard input/output streams for communication. This is the recommended transport for:
- Claude Desktop integration
- Local command-line tools
- Single-user scenarios
- Development and testing

### Configuration

#### Environment Variables

```bash
# .env file
TRANSPORT_TYPE=stdio
FIREBIRD_HOST=localhost
FIREBIRD_PORT=3050
FIREBIRD_DATABASE=/path/to/database.fdb
FIREBIRD_USER=SYSDBA
FIREBIRD_PASSWORD=masterkey
```

#### Command Line

```bash
# Basic STDIO usage
npx mcp-firebird@alpha \
  --transport-type stdio \
  --database /path/to/database.fdb \
  --host localhost \
  --port 3050 \
  --user SYSDBA \
  --password masterkey

# Windows example
npx mcp-firebird@alpha ^
  --transport-type stdio ^
  --database "F:\Proyectos\SAI\EMPLOYEE.FDB" ^
  --host localhost ^
  --port 3050 ^
  --user SYSDBA ^
  --password masterkey

# Linux/Unix example
npx mcp-firebird@alpha \
  --transport-type stdio \
  --database /var/lib/firebird/data/employee.fdb \
  --host localhost \
  --port 3050 \
  --user SYSDBA \
  --password masterkey
```

### Claude Desktop Integration

Add to your Claude Desktop configuration file:

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Linux:** `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "mcp-firebird": {
      "command": "npx",
      "args": [
        "mcp-firebird@alpha",
        "--transport-type", "stdio",
        "--database", "F:\\Proyectos\\SAI\\EMPLOYEE.FDB",
        "--host", "localhost",
        "--port", "3050",
        "--user", "SYSDBA",
        "--password", "masterkey"
      ]
    }
  }
}
```

### MCP Inspector with STDIO

```bash
# Run the inspector with STDIO transport
npm run inspector

# Or manually
npx @modelcontextprotocol/inspector node dist/index.js
```

### STDIO Examples

#### Example 1: Basic Query Execution

```bash
# Start the server
npx mcp-firebird@alpha --transport-type stdio --database /path/to/db.fdb

# The server will communicate via STDIO
# Claude Desktop or other MCP clients can now interact with it
```

#### Example 2: Using with Custom Scripts

```javascript
// custom-client.js
import { spawn } from 'child_process';

const mcpServer = spawn('npx', [
  'mcp-firebird@alpha',
  '--transport-type', 'stdio',
  '--database', '/path/to/database.fdb',
  '--host', 'localhost',
  '--port', '3050',
  '--user', 'SYSDBA',
  '--password', 'masterkey'
]);

// Send MCP messages via stdin
mcpServer.stdin.write(JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: {
    name: 'list-tables',
    arguments: {}
  }
}) + '\n');

// Receive responses via stdout
mcpServer.stdout.on('data', (data) => {
  console.log('Response:', data.toString());
});
```

---

## SSE Transport

### What is SSE?

SSE (Server-Sent Events) transport runs MCP Firebird as a web server. This is recommended for:
- Web application integration
- Remote database access
- Multi-client scenarios
- Development with MCP Inspector
- Load balancing and scaling

### Configuration

#### Environment Variables

```bash
# .env file
TRANSPORT_TYPE=sse
SSE_PORT=3003
FIREBIRD_HOST=localhost
FIREBIRD_PORT=3050
FIREBIRD_DATABASE=/path/to/database.fdb
FIREBIRD_USER=SYSDBA
FIREBIRD_PASSWORD=masterkey
```

#### Command Line

```bash
# Basic SSE server
npx mcp-firebird@alpha \
  --transport-type sse \
  --sse-port 3003 \
  --database /path/to/database.fdb \
  --host localhost \
  --port 3050 \
  --user SYSDBA \
  --password masterkey

# With custom port
npx mcp-firebird@alpha \
  --transport-type sse \
  --sse-port 8080 \
  --database /path/to/database.fdb

# Full configuration
npx mcp-firebird@alpha \
  --transport-type sse \
  --sse-port 3003 \
  --host 192.168.1.100 \
  --port 3050 \
  --database /firebird/data/database.fdb \
  --user SYSDBA \
  --password masterkey
```

### MCP Inspector with SSE

```bash
# Connect to SSE server
npx @modelcontextprotocol/inspector http://localhost:3003

# Connect to remote SSE server
npx @modelcontextprotocol/inspector http://192.168.1.100:3003
```

### SSE Examples

#### Example 1: Basic HTML/JavaScript Client

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>MCP Firebird SSE Client</title>
</head>
<body>
    <h1>MCP Firebird SSE Client</h1>
    <button onclick="listTables()">List Tables</button>
    <pre id="output"></pre>

    <script>
        const MCP_SERVER_URL = 'http://localhost:3003';
        
        async function listTables() {
            try {
                const response = await fetch(`${MCP_SERVER_URL}/messages`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        id: 1,
                        method: 'tools/call',
                        params: {
                            name: 'list-tables',
                            arguments: {}
                        }
                    })
                });
                
                const result = await response.json();
                document.getElementById('output').textContent = 
                    JSON.stringify(result, null, 2);
            } catch (error) {
                console.error('Error:', error);
                document.getElementById('output').textContent = 
                    'Error: ' + error.message;
            }
        }
    </script>
</body>
</html>
```

#### Example 2: Python Client

```python
import requests
import json

MCP_SERVER_URL = 'http://localhost:3003'

def call_mcp_tool(tool_name, arguments=None):
    """Call an MCP tool via SSE transport"""
    payload = {
        'jsonrpc': '2.0',
        'id': 1,
        'method': 'tools/call',
        'params': {
            'name': tool_name,
            'arguments': arguments or {}
        }
    }
    
    response = requests.post(
        f'{MCP_SERVER_URL}/messages',
        headers={'Content-Type': 'application/json'},
        json=payload
    )
    
    return response.json()

# Example: List tables
result = call_mcp_tool('list-tables')
print(json.dumps(result, indent=2))

# Example: Execute query
result = call_mcp_tool('execute-query', {
    'query': 'SELECT * FROM EMPLOYEES WHERE SALARY > 50000'
})
print(json.dumps(result, indent=2))

# Example: Get table data with filtering
result = call_mcp_tool('get-table-data', {
    'tableName': 'CUSTOMERS',
    'whereClause': 'COUNTRY = \'USA\'',
    'orderBy': 'CUSTOMER_NAME',
    'limit': 100
})
print(json.dumps(result, indent=2))
```

---

## HTTP Streamable Transport (Modern - Recommended)

### What is HTTP Streamable?

HTTP Streamable is the **modern MCP protocol (2025-03-26)** that provides bidirectional communication with improved performance and session management. This is the **recommended transport for new applications**.

**Key Features:**
- ✅ Modern MCP protocol specification
- ✅ Bidirectional communication
- ✅ Session management with automatic cleanup
- ✅ Stateful and stateless modes
- ✅ Better performance than SSE
- ✅ Full MCP SDK support

**Recommended for:**
- New web applications
- Production deployments
- Modern MCP clients
- High-performance scenarios
- Applications requiring session management

### HTTP Streamable Configuration

#### Environment Variables

```bash
# .env file
TRANSPORT_TYPE=http
HTTP_PORT=3003
FIREBIRD_HOST=localhost
FIREBIRD_PORT=3050
FIREBIRD_DATABASE=/path/to/database.fdb
FIREBIRD_USER=SYSDBA
FIREBIRD_PASSWORD=masterkey

# Optional: Session configuration
STREAMABLE_SESSION_TIMEOUT_MS=1800000  # 30 minutes
STREAMABLE_STATELESS_MODE=false        # Enable stateless mode
```

#### Command Line

```bash
# RECOMMENDED: Stateless mode (works with MCP Inspector)
STREAMABLE_STATELESS_MODE=true npx mcp-firebird@alpha \
  --transport-type http \
  --http-port 3003 \
  --database /path/to/database.fdb \
  --user SYSDBA \
  --password masterkey

# Windows example (Git Bash)
STREAMABLE_STATELESS_MODE=true npx mcp-firebird@alpha \
  --transport-type http \
  --http-port 3012 \
  --database "F:\\Proyectos\\SAI\\EMPLOYEE.FDB" \
  --user SYSDBA \
  --password masterkey

# Stateful mode (for custom clients with proper session management)
npx mcp-firebird@alpha \
  --transport-type http \
  --http-port 3003 \
  --database /path/to/database.fdb \
  --host localhost \
  --port 3050 \
  --user SYSDBA \
  --password masterkey

# With custom session timeout (stateful mode)
STREAMABLE_SESSION_TIMEOUT_MS=600000 npx mcp-firebird@alpha \
  --transport-type http \
  --http-port 3003 \
  --database /path/to/database.fdb
```

**Important Notes:**
- ⚠️ **Use stateless mode** (`STREAMABLE_STATELESS_MODE=true`) when testing with MCP Inspector
- ⚠️ Stateful mode requires clients to properly implement session initialization
- ✅ Stateless mode works with all clients but doesn't maintain session state

### MCP Inspector with HTTP Streamable

**Important:** MCP Inspector currently has compatibility issues with stateful HTTP Streamable mode. Use **stateless mode** for MCP Inspector:

```bash
# Start server in STATELESS mode for MCP Inspector
STREAMABLE_STATELESS_MODE=true npx mcp-firebird@alpha \
  --transport-type http \
  --http-port 3003 \
  --database /path/to/database.fdb

# Or using command line
npx mcp-firebird@alpha \
  --transport-type http \
  --http-port 3003 \
  --database "F:\\Proyectos\\SAI\\EMPLOYEE.FDB" \
  --user SYSDBA \
  --password masterkey

# Then connect with MCP Inspector
npx @modelcontextprotocol/inspector http://localhost:3003/mcp
```

**Note:** Set `STREAMABLE_STATELESS_MODE=true` environment variable before starting the server to avoid session-related errors with MCP Inspector.

### HTTP Streamable Examples

#### Example 1: TypeScript/JavaScript Client with MCP SDK

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// Create transport
const transport = new StreamableHTTPClientTransport(
  "http://localhost:3003/mcp"
);

// Create client
const client = new Client({
  name: "my-firebird-client",
  version: "1.0.0"
}, {
  capabilities: {}
});

// Connect
await client.connect(transport);

// List available tools
const tools = await client.listTools();
console.log('Available tools:', tools);

// Call a tool
const result = await client.callTool({
  name: 'list-tables',
  arguments: {}
});
console.log('Tables:', result);

// Execute a query
const queryResult = await client.callTool({
  name: 'execute-query',
  arguments: {
    query: 'SELECT * FROM EMPLOYEES WHERE SALARY > 50000'
  }
});
console.log('Query result:', queryResult);

// Access resources
const schema = await client.readResource({
  uri: '/schema'
});
console.log('Database schema:', schema);

// Use prompts
const healthCheck = await client.getPrompt({
  name: 'database-health-check',
  arguments: {
    focusAreas: ['performance', 'security']
  }
});
console.log('Health check guide:', healthCheck);

// Close connection
await client.close();
```

#### Example 2: Python Client with HTTP Streamable

```python
import requests
import json

class MCPStreamableClient:
    def __init__(self, base_url):
        self.base_url = base_url
        self.session_id = None
        self.session = requests.Session()

    def initialize(self):
        """Initialize MCP session"""
        response = self.session.post(
            f'{self.base_url}/mcp',
            headers={'Content-Type': 'application/json'},
            json={
                'jsonrpc': '2.0',
                'id': 1,
                'method': 'initialize',
                'params': {
                    'protocolVersion': '2024-11-05',
                    'capabilities': {},
                    'clientInfo': {
                        'name': 'python-mcp-client',
                        'version': '1.0.0'
                    }
                }
            }
        )

        # Extract session ID from response headers
        self.session_id = response.headers.get('mcp-session-id')
        return response.json()

    def call_tool(self, tool_name, arguments=None):
        """Call an MCP tool"""
        headers = {
            'Content-Type': 'application/json'
        }
        if self.session_id:
            headers['mcp-session-id'] = self.session_id

        response = self.session.post(
            f'{self.base_url}/mcp',
            headers=headers,
            json={
                'jsonrpc': '2.0',
                'id': 2,
                'method': 'tools/call',
                'params': {
                    'name': tool_name,
                    'arguments': arguments or {}
                }
            }
        )

        return response.json()

    def read_resource(self, uri):
        """Read an MCP resource"""
        headers = {
            'Content-Type': 'application/json'
        }
        if self.session_id:
            headers['mcp-session-id'] = self.session_id

        response = self.session.post(
            f'{self.base_url}/mcp',
            headers=headers,
            json={
                'jsonrpc': '2.0',
                'id': 3,
                'method': 'resources/read',
                'params': {
                    'uri': uri
                }
            }
        )

        return response.json()

# Usage example
client = MCPStreamableClient('http://localhost:3003')

# Initialize session
init_result = client.initialize()
print('Initialized:', json.dumps(init_result, indent=2))

# List tables
tables = client.call_tool('list-tables')
print('Tables:', json.dumps(tables, indent=2))

# Get database schema
schema = client.read_resource('/schema')
print('Schema:', json.dumps(schema, indent=2))

# Execute query
result = client.call_tool('execute-query', {
    'query': 'SELECT * FROM EMPLOYEES WHERE SALARY > 50000'
})
print('Query result:', json.dumps(result, indent=2))
```

---

## Unified Transport (Recommended for Production)

### What is Unified Transport?

Unified transport mode runs **both SSE and HTTP Streamable** protocols simultaneously with automatic protocol detection. This is the **recommended mode for production** as it supports both legacy and modern clients.

**Key Features:**
- ✅ Supports both SSE (legacy) and HTTP Streamable (modern)
- ✅ Automatic protocol detection
- ✅ Backwards compatibility
- ✅ Single server instance
- ✅ Flexible client support

**Endpoints:**
- `/sse` - SSE protocol (legacy)
- `/mcp` - HTTP Streamable protocol (modern)
- `/mcp-auto` - Auto-detection endpoint
- `/health` - Health check

### Unified Configuration

#### Environment Variables

```bash
# .env file
TRANSPORT_TYPE=unified
HTTP_PORT=3003
FIREBIRD_HOST=localhost
FIREBIRD_PORT=3050
FIREBIRD_DATABASE=/path/to/database.fdb
FIREBIRD_USER=SYSDBA
FIREBIRD_PASSWORD=masterkey
```

#### Command Line

```bash
# Start unified server (supports both SSE and HTTP Streamable)
npx mcp-firebird@alpha \
  --transport-type unified \
  --http-port 3003 \
  --database /path/to/database.fdb \
  --host localhost \
  --port 3050 \
  --user SYSDBA \
  --password masterkey
```

### Unified Server Usage

```bash
# Modern clients use HTTP Streamable
npx @modelcontextprotocol/inspector http://localhost:3003/mcp

# Legacy clients use SSE
npx @modelcontextprotocol/inspector http://localhost:3003/sse

# Auto-detection endpoint
curl http://localhost:3003/mcp-auto
```

### Unified Server Example

```typescript
// Modern client (HTTP Streamable)
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const modernTransport = new StreamableHTTPClientTransport(
  "http://localhost:3003/mcp"
);

const modernClient = new Client({
  name: "modern-client",
  version: "1.0.0"
}, {
  capabilities: {}
});

await modernClient.connect(modernTransport);

// Legacy client (SSE) - still works!
const legacyResponse = await fetch('http://localhost:3003/messages', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'list-tables',
      arguments: {}
    }
  })
});
```

---

#### Example 3: Node.js/JavaScript Client (SSE)

```javascript
// sse-client.js
import fetch from 'node-fetch';

const MCP_SERVER_URL = 'http://localhost:3003';

async function callMCPTool(toolName, args = {}) {
    const response = await fetch(`${MCP_SERVER_URL}/messages`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'tools/call',
            params: {
                name: toolName,
                arguments: args
            }
        })
    });

    return await response.json();
}

// Example usage
async function main() {
    // List all tables
    const tables = await callMCPTool('list-tables');
    console.log('Tables:', JSON.stringify(tables, null, 2));

    // Describe a table
    const schema = await callMCPTool('describe-table', {
        tableName: 'EMPLOYEES'
    });
    console.log('Schema:', JSON.stringify(schema, null, 2));

    // Execute a query
    const queryResult = await callMCPTool('execute-query', {
        query: 'SELECT * FROM EMPLOYEES WHERE SALARY > 50000'
    });
    console.log('Query Result:', JSON.stringify(queryResult, null, 2));

    // Use new v2.6.0 features

    // Get table data with filtering
    const filteredData = await callMCPTool('get-table-data', {
        tableName: 'ORDERS',
        whereClause: 'ORDER_DATE > \'2024-01-01\'',
        orderBy: 'ORDER_DATE DESC',
        limit: 50
    });
    console.log('Filtered Data:', JSON.stringify(filteredData, null, 2));

    // Analyze table statistics
    const stats = await callMCPTool('analyze-table-statistics', {
        tableName: 'CUSTOMERS'
    });
    console.log('Statistics:', JSON.stringify(stats, null, 2));

    // Analyze missing indexes
    const indexes = await callMCPTool('analyze-missing-indexes', {
        tableName: 'ORDERS'
    });
    console.log('Missing Indexes:', JSON.stringify(indexes, null, 2));
}

main().catch(console.error);
```

#### Example 4: Using Resources

```javascript
// Access MCP resources via SSE
async function getResource(resourceUri) {
    const response = await fetch(`${MCP_SERVER_URL}/messages`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'resources/read',
            params: {
                uri: resourceUri
            }
        })
    });

    return await response.json();
}

// Get complete database schema
const schema = await getResource('/schema');
console.log('Database Schema:', JSON.stringify(schema, null, 2));

// Get table indexes
const indexes = await getResource('/tables/EMPLOYEES/indexes');
console.log('Indexes:', JSON.stringify(indexes, null, 2));

// Get table constraints
const constraints = await getResource('/tables/EMPLOYEES/constraints');
console.log('Constraints:', JSON.stringify(constraints, null, 2));

// Get database statistics
const statistics = await getResource('/statistics');
console.log('Statistics:', JSON.stringify(statistics, null, 2));
```

#### Example 5: Using Template Prompts

```javascript
// Use template prompts for guided workflows
async function getPrompt(promptName, args = {}) {
    const response = await fetch(`${MCP_SERVER_URL}/messages`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'prompts/get',
            params: {
                name: promptName,
                arguments: args
            }
        })
    });

    return await response.json();
}

// Database health check
const healthCheck = await getPrompt('database-health-check', {
    focusAreas: ['performance', 'security']
});
console.log('Health Check Guide:', healthCheck);

// Query optimization guide
const optimizationGuide = await getPrompt('query-optimization-guide', {
    queryType: 'select'
});
console.log('Optimization Guide:', optimizationGuide);

// Migration planning
const migrationPlan = await getPrompt('migration-planning', {
    migrationType: 'schema-change',
    description: 'Add new customer loyalty program tables'
});
console.log('Migration Plan:', migrationPlan);
```

---

## Docker Configuration

### STDIO in Docker

```yaml
version: '3.8'

services:
  mcp-firebird-stdio:
    image: mcp-firebird:latest
    environment:
      TRANSPORT_TYPE: stdio
      FIREBIRD_HOST: firebird-db
      FIREBIRD_PORT: 3050
      FIREBIRD_DATABASE: /firebird/data/database.fdb
      FIREBIRD_USER: SYSDBA
      FIREBIRD_PASSWORD: masterkey
    depends_on:
      - firebird-db
    stdin_open: true
    tty: true
```

### SSE in Docker

```yaml
version: '3.8'

services:
  mcp-firebird-sse:
    image: mcp-firebird:latest
    environment:
      TRANSPORT_TYPE: sse
      SSE_PORT: 3003
      FIREBIRD_HOST: firebird-db
      FIREBIRD_PORT: 3050
      FIREBIRD_DATABASE: /firebird/data/database.fdb
      FIREBIRD_USER: SYSDBA
      FIREBIRD_PASSWORD: masterkey
    ports:
      - "3003:3003"
    depends_on:
      - firebird-db
```

---

## Transport Comparison

### Complete Comparison Table

| Feature | STDIO | SSE (Legacy) | HTTP Streamable | Unified |
|---------|-------|--------------|-----------------|---------|
| **Protocol** | Standard I/O | Server-Sent Events | Modern MCP (2025-03-26) | Both SSE + HTTP |
| **Use Case** | Local integration | Legacy web clients | Modern web clients | Mixed environments |
| **Clients** | Single | Multiple concurrent | Multiple concurrent | Multiple concurrent |
| **Network** | Not required | HTTP/HTTPS | HTTP/HTTPS | HTTP/HTTPS |
| **Port** | None | Configurable (3003) | Configurable (3003) | Configurable (3003) |
| **Session Management** | N/A | Basic | Advanced (stateful/stateless) | Advanced |
| **Bidirectional** | Yes | No (server→client only) | Yes | Yes |
| **Performance** | Fastest | Good | Better than SSE | Good |
| **MCP Protocol Version** | Latest | Legacy | Latest (2025-03-26) | Both |
| **Backwards Compatible** | N/A | Yes | No | Yes |
| **Security** | Local only | Requires auth/HTTPS | Requires auth/HTTPS | Requires auth/HTTPS |
| **Debugging** | MCP Inspector (local) | MCP Inspector (remote) | MCP Inspector (remote) | MCP Inspector (remote) |
| **Scalability** | Single instance | Load balanceable | Load balanceable | Load balanceable |
| **Best For** | Claude Desktop, CLI | Old clients | New applications | Production |
| **Recommended** | ✅ For local use | ⚠️ Legacy only | ✅ For new projects | ✅ For production |

### Quick Decision Guide

**Choose STDIO if:**
- ✅ Integrating with Claude Desktop
- ✅ Building CLI tools
- ✅ Single-user local application
- ✅ No network access needed

**Choose SSE if:**
- ⚠️ Supporting legacy MCP clients
- ⚠️ Backwards compatibility required
- ❌ Not recommended for new projects

**Choose HTTP Streamable if:**
- ✅ Building new web applications
- ✅ Need modern MCP features
- ✅ Want best performance
- ✅ Require session management
- ✅ Production deployment

**Choose Unified if:**
- ✅ Need to support both old and new clients
- ✅ Production environment with mixed clients
- ✅ Want maximum compatibility
- ✅ Migrating from SSE to HTTP Streamable

---

## Troubleshooting

### STDIO Issues

**Problem:** Claude Desktop can't connect to MCP server

**Solution:**
1. Check that the command in `claude_desktop_config.json` is correct
2. Verify database path is accessible
3. Check Firebird server is running
4. Review Claude Desktop logs

**Problem:** "spawn ENOENT" error

**Solution:**
1. Ensure `npx` is in your PATH
2. Try using full path to node: `"command": "C:\\Program Files\\nodejs\\npx.cmd"`
3. Install mcp-firebird globally: `npm install -g mcp-firebird@alpha`

### SSE Issues

**Problem:** Cannot connect to SSE server

**Solution:**
1. Verify server is running: `curl http://localhost:3003/health`
2. Check firewall settings
3. Ensure SSE_PORT is not in use
4. Review server logs

**Problem:** CORS errors in web browser

**Solution:**
SSE server includes CORS headers by default. If issues persist:
1. Check browser console for specific CORS error
2. Verify SSE_PORT matches client configuration
3. Use a proxy if needed for development

**Problem:** Connection timeout

**Solution:**
1. Increase session timeout: `SSE_SESSION_TIMEOUT_MS=600000` (10 minutes)
2. Check network connectivity
3. Verify Firebird server is accessible from MCP server

### HTTP Streamable Issues

**Problem:** "Bad Request: No valid session ID provided" error with MCP Inspector

**This is the most common issue!**

**Solution:**
Enable stateless mode before starting the server:

```bash
# Windows (Git Bash)
STREAMABLE_STATELESS_MODE=true npx mcp-firebird@alpha \
  --transport-type http \
  --http-port 3012 \
  --database "F:\\Proyectos\\SAI\\EMPLOYEE.FDB" \
  --user SYSDBA \
  --password masterkey

# Windows (PowerShell)
$env:STREAMABLE_STATELESS_MODE="true"
npx mcp-firebird@alpha --transport-type http --http-port 3012 --database "F:\Proyectos\SAI\EMPLOYEE.FDB"

# Linux/macOS
export STREAMABLE_STATELESS_MODE=true
npx mcp-firebird@alpha --transport-type http --http-port 3012 --database /path/to/database.fdb
```

**Why this happens:**
- MCP Inspector doesn't properly send the `initialize` request required for stateful sessions
- Stateless mode bypasses session management entirely
- Each request is independent (no session state)

**Problem:** Session not persisting between requests

**Solution:**
1. Ensure client sends `mcp-session-id` header
2. Check session timeout: `STREAMABLE_SESSION_TIMEOUT_MS`
3. Verify session is initialized with `initialize` request
4. Review server logs for session cleanup
5. **For MCP Inspector:** Use stateless mode instead

**Problem:** "No valid session ID" error (general)

**Solution:**
1. Send `initialize` request first to create session
2. Include `mcp-session-id` header in subsequent requests
3. Check if session expired (default 30 minutes)
4. Use stateless mode if sessions not needed: `STREAMABLE_STATELESS_MODE=true`
5. **Quick fix:** Always use stateless mode for testing

**Problem:** Performance issues with stateful mode

**Solution:**
1. Enable stateless mode: `STREAMABLE_STATELESS_MODE=true`
2. Reduce session timeout to free resources faster
3. Monitor active sessions count
4. Consider load balancing for high traffic

### Unified Transport Issues

**Problem:** Client connecting to wrong protocol

**Solution:**
1. Use specific endpoints: `/mcp` for HTTP Streamable, `/sse` for SSE
2. Check client MCP SDK version
3. Use `/mcp-auto` for automatic detection
4. Review client logs for protocol negotiation

**Problem:** Mixed protocol errors

**Solution:**
1. Ensure both protocols are enabled in configuration
2. Check that HTTP_PORT is accessible
3. Verify no port conflicts
4. Review unified server logs

---

## Security Considerations

### STDIO
- ✅ Secure by default (local only)
- ✅ No network exposure
- ⚠️ Credentials in config file (use environment variables)

**Security Level:** High (local only)

### SSE (Legacy)
- ⚠️ Network exposed (use firewall)
- ⚠️ No built-in authentication (add reverse proxy)
- ⚠️ Use HTTPS in production
- ✅ CORS headers included
- ✅ Session management with timeouts

**Security Level:** Medium (requires additional security layers)

### HTTP Streamable
- ⚠️ Network exposed (use firewall)
- ⚠️ No built-in authentication (add reverse proxy)
- ⚠️ Use HTTPS in production
- ✅ Session management with automatic cleanup
- ✅ Stateful and stateless modes
- ✅ Better session security than SSE

**Security Level:** Medium-High (modern protocol with better session management)

### Unified
- ⚠️ Network exposed (use firewall)
- ⚠️ No built-in authentication (add reverse proxy)
- ⚠️ Use HTTPS in production
- ✅ Supports both SSE and HTTP Streamable security features
- ✅ Protocol-specific security measures

**Security Level:** Medium-High (inherits security from both protocols)

### Security Recommendations by Environment

#### Development Environment

**STDIO:**
- ✅ Use for local testing
- ✅ No additional security needed
- ⚠️ Use environment variables for credentials

**SSE/HTTP Streamable/Unified:**
- ✅ Bind to localhost only: `--host 127.0.0.1`
- ✅ Use firewall to block external access
- ⚠️ Don't expose to internet

#### Production Environment

**All Network Transports (SSE/HTTP Streamable/Unified):**

1. **Use Reverse Proxy:**
   ```nginx
   # nginx example
   server {
       listen 443 ssl;
       server_name mcp.example.com;

       ssl_certificate /path/to/cert.pem;
       ssl_certificate_key /path/to/key.pem;

       location / {
           proxy_pass http://localhost:3003;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

2. **Add Authentication:**
   - OAuth 2.0 / OpenID Connect
   - JWT tokens
   - API keys
   - Basic Auth (over HTTPS only)

3. **Enable HTTPS:**
   - Valid SSL/TLS certificates
   - Strong cipher suites
   - HSTS headers

4. **Firewall Configuration:**
   - Restrict access by IP
   - Use VPN for remote access
   - Rate limiting

5. **Database Security:**
   - Enable Firebird wire encryption
   - Use strong passwords
   - Limit database user permissions
   - Regular security audits

6. **Monitoring:**
   - Log all access attempts
   - Monitor for suspicious activity
   - Set up alerts for anomalies

---

## Advanced Configuration

### Environment Variables

```bash
# Transport Configuration
TRANSPORT_TYPE=stdio|sse          # Transport type
SSE_PORT=3003                     # SSE server port
SSE_SESSION_TIMEOUT_MS=300000     # Session timeout (5 minutes)

# Database Configuration
FIREBIRD_HOST=localhost           # Firebird server host
FIREBIRD_PORT=3050               # Firebird server port
FIREBIRD_DATABASE=/path/to/db    # Database file path
FIREBIRD_USER=SYSDBA             # Database user
FIREBIRD_PASSWORD=masterkey      # Database password

# Security
ENABLE_WIRE_ENCRYPTION=true      # Enable wire encryption (Firebird 3.0+)

# Logging
LOG_LEVEL=info                   # Log level: debug, info, warn, error
```

### Performance Tuning

**STDIO:**
- No tuning needed (direct communication)

**SSE:**
- Adjust `SSE_SESSION_TIMEOUT_MS` based on usage patterns
- Use connection pooling for high-traffic scenarios
- Consider load balancer for multiple instances
- Monitor memory usage with long-running sessions

---

## Examples Repository

For more examples, see:
- `examples/sse-client.html` - Complete HTML/JavaScript client
- `examples/sse-client.js` - Node.js client example
- `examples/sse_client.py` - Python client example

---

## Next Steps

1. Choose the appropriate transport type for your use case
2. Configure environment variables or command-line parameters
3. Test connection with MCP Inspector
4. Implement your client application
5. Review security considerations for production deployment

For more information, see:
- [Docker Configuration](docker.md)
- [Security Guide](security.md)
- [Resources, Tools, and Prompts](resources-tools-prompts.md)
- [Troubleshooting](troubleshooting.md)

