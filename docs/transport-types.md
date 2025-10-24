# Transport Types in MCP Firebird

This document provides comprehensive examples and configuration for the different transport types supported by MCP Firebird.

## Overview

MCP Firebird supports two transport types:

1. **STDIO (Standard Input/Output)** - For local integrations like Claude Desktop
2. **SSE (Server-Sent Events)** - For web applications and remote access

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

#### Example 3: Node.js/JavaScript Client

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

## Comparison: STDIO vs SSE

| Feature | STDIO | SSE |
|---------|-------|-----|
| **Use Case** | Local integration | Web/Remote access |
| **Clients** | Single (Claude Desktop) | Multiple concurrent |
| **Network** | Not required | HTTP/HTTPS |
| **Port** | None | Configurable (default 3003) |
| **Security** | Local only | Requires authentication/HTTPS |
| **Performance** | Fastest (no network) | Network overhead |
| **Debugging** | MCP Inspector (local) | MCP Inspector (remote) |
| **Scalability** | Single instance | Load balanceable |
| **Best For** | Development, Claude Desktop | Production, Web apps |

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

---

## Security Considerations

### STDIO
- ✅ Secure by default (local only)
- ✅ No network exposure
- ⚠️ Credentials in config file (use environment variables)

### SSE
- ⚠️ Network exposed (use firewall)
- ⚠️ No built-in authentication (add reverse proxy)
- ⚠️ Use HTTPS in production
- ✅ CORS headers included
- ✅ Session management with timeouts

### Recommendations

1. **For Development:**
   - STDIO for local testing
   - SSE with localhost only

2. **For Production:**
   - SSE behind reverse proxy (nginx, Apache)
   - HTTPS with valid certificates
   - Authentication layer (OAuth, JWT)
   - Firewall rules to restrict access
   - Wire encryption enabled on Firebird

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

