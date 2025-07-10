[![Verified on MseeP](https://mseep.ai/badge.svg)](https://mseep.ai/app/1cb2bb07-00f4-4579-b535-1b9de9b451e9)

# MCP Firebird

[![smithery badge](https://smithery.ai/badge/@PuroDelphi/mcpFirebird)](https://smithery.ai/server/@PuroDelphi/mcpFirebird)

Implementation of Anthropic's MCP (Model Context Protocol) for Firebird databases.

## Example Usage

https://github.com/user-attachments/assets/e68e873f-f87b-4afd-874f-157086e223af

## What is MCP Firebird?

MCP Firebird is a server that implements Anthropic's [Model Context Protocol (MCP)](https://github.com/anthropics/anthropic-cookbook/tree/main/model_context_protocol) for [Firebird SQL databases](https://firebirdsql.org/). It allows Large Language Models (LLMs) like Claude to access, analyze, and manipulate data in Firebird databases securely and in a controlled manner.

## Key Features

- **SQL Queries**: Execute SQL queries on Firebird databases
- **Schema Analysis**: Get detailed information about tables, columns, and relationships
- **Database Management**: Perform backup, restore, and validation operations
- **Performance Analysis**: Analyze query performance and suggest optimizations
- **Multiple Transports**: Supports STDIO, SSE (Server-Sent Events), and Streamable HTTP transports
- **Modern Protocol Support**: Full support for MCP Streamable HTTP (2025-03-26) and legacy SSE
- **Unified Server**: Automatic protocol detection and backwards compatibility
- **Claude Integration**: Works seamlessly with Claude Desktop and other MCP clients
- **VSCode Integration**: Works with GitHub Copilot in Visual Studio Code
- **Session Management**: Robust session handling with automatic cleanup and configurable timeouts
- **Security**: Includes SQL query validation and security configuration options

### Manual Installation

#### Stable Version
```bash
# Global installation (stable)
npm install -g mcp-firebird

# Run the server
npx mcp-firebird --database /path/to/database.fdb
```

#### Alpha Version (Latest Features)
```bash
# Install alpha version with latest features
npm install -g mcp-firebird@alpha

# Or use specific alpha version
npm install -g mcp-firebird@2.4.0-alpha.0
```

**Alpha Features (v2.4.0-alpha.0):**
- � **NEW**: Ready for next development cycle
- ✨ All stable features from v2.2.3 included
- 🔄 Unified server with automatic protocol detection
- 📊 Enhanced session management and monitoring
- 🛠️ Modern MCP SDK integration (v1.13.2)
- 🔧 Improved error handling and logging
- 🧪 Comprehensive test suite with 9+ tests for SSE functionality
- 📚 Enhanced documentation with troubleshooting guides

**Note**: The SSE JSON parsing bug fix is now available in stable v2.2.3

For backup/restore operations, you'll need to install the Firebird client tools. See [Complete Installation](./docs/installation.md) for more details.

For VSCode and GitHub Copilot integration, see [VSCode Integration](./docs/vscode-integration.md).

## Basic Usage

### With Claude Desktop

1. Edit the Claude Desktop configuration:
   ```bash
   code $env:AppData\Claude\claude_desktop_config.json  # Windows
   code ~/Library/Application\ Support/Claude/claude_desktop_config.json  # macOS
   ```

2. Add the MCP Firebird configuration:
   ```json
   {
     "mcpServers": {
       "mcp-firebird": {
         "command": "npx",
         "args": [
           "mcp-firebird",
           "--host",
           "localhost",
           "--port",
           "3050",
           "--database",
           "C:\\path\\to\\database.fdb",
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

3. Restart Claude Desktop

## Transport Configuration

MCP Firebird supports multiple transport protocols to accommodate different client needs and deployment scenarios.

### STDIO Transport (Default)

The STDIO transport is the standard method for Claude Desktop integration:

```json
{
  "mcpServers": {
    "mcp-firebird": {
      "command": "npx",
      "args": [
        "mcp-firebird",
        "--database", "C:\\path\\to\\database.fdb",
        "--user", "SYSDBA",
        "--password", "masterkey"
      ],
      "type": "stdio"
    }
  }
}
```

### SSE Transport (Server-Sent Events)

SSE transport allows the server to run as a web service, useful for web applications and remote access:

#### Basic SSE Configuration

```bash
# Start SSE server on default port 3003
npx mcp-firebird --transport-type sse --database /path/to/database.fdb

# Custom port and full configuration
npx mcp-firebird \
  --transport-type sse \
  --sse-port 3003 \
  --database /path/to/database.fdb \
  --host localhost \
  --port 3050 \
  --user SYSDBA \
  --password masterkey
```

#### Environment Variables for SSE

```bash
# Set environment variables
export TRANSPORT_TYPE=sse
export SSE_PORT=3003
export DB_HOST=localhost
export DB_PORT=3050
export DB_DATABASE=/path/to/database.fdb
export DB_USER=SYSDBA
export DB_PASSWORD=masterkey

# Start server
npx mcp-firebird
```

#### SSE Client Connection

Once the SSE server is running, clients can connect to:
- **SSE Endpoint**: `http://localhost:3003/sse`
- **Messages Endpoint**: `http://localhost:3003/messages`
- **Health Check**: `http://localhost:3003/health`

### Streamable HTTP Transport (Modern)

The latest MCP protocol supporting bidirectional communication:

```bash
# Start with Streamable HTTP
npx mcp-firebird --transport-type http --http-port 3003 --database /path/to/database.fdb
```

### Unified Transport (Recommended)

Supports both SSE and Streamable HTTP protocols simultaneously with automatic detection:

```bash
# Start unified server (supports both SSE and Streamable HTTP)
npx mcp-firebird --transport-type unified --http-port 3003 --database /path/to/database.fdb
```

#### Unified Server Endpoints

- **SSE (Legacy)**: `http://localhost:3003/sse`
- **Streamable HTTP (Modern)**: `http://localhost:3003/mcp`
- **Auto-Detection**: `http://localhost:3003/mcp-auto`
- **Health Check**: `http://localhost:3003/health`

### Configuration Examples

#### Development Setup (SSE)
```bash
npx mcp-firebird \
  --transport-type sse \
  --sse-port 3003 \
  --database ./dev-database.fdb \
  --user SYSDBA \
  --password masterkey
```

#### Production Setup (Unified)
```bash
npx mcp-firebird \
  --transport-type unified \
  --http-port 3003 \
  --database /var/lib/firebird/production.fdb \
  --host db-server \
  --port 3050 \
  --user APP_USER \
  --password $DB_PASSWORD
```

#### Docker with SSE
```bash
docker run -d \
  --name mcp-firebird \
  -p 3003:3003 \
  -e TRANSPORT_TYPE=sse \
  -e SSE_PORT=3003 \
  -e DB_DATABASE=/data/database.fdb \
  -v /path/to/database:/data \
  purodelhi/mcp-firebird:latest
```

### Advanced SSE Configuration

#### Session Management

Configure session timeouts and limits:

```bash
# Environment variables for session management
export SSE_SESSION_TIMEOUT_MS=1800000    # 30 minutes
export MAX_SESSIONS=1000                 # Maximum concurrent sessions
export SESSION_CLEANUP_INTERVAL_MS=60000 # Cleanup every minute

npx mcp-firebird --transport-type sse
```

#### CORS Configuration

For web applications, configure CORS settings:

```bash
# Allow specific origins
export CORS_ORIGIN="https://myapp.com,https://localhost:3000"
export CORS_METHODS="GET,POST,OPTIONS"
export CORS_HEADERS="Content-Type,mcp-session-id"

npx mcp-firebird --transport-type sse
```

#### SSL/TLS Support

For production deployments, use a reverse proxy like nginx:

```nginx
server {
    listen 443 ssl;
    server_name mcp-firebird.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Troubleshooting SSE

#### Common Issues

1. **Connection Refused**
   ```bash
   # Check if server is running
   curl http://localhost:3003/health

   # Check port availability
   netstat -an | grep 3003
   ```

2. **Session Timeout**
   ```bash
   # Increase session timeout
   export SSE_SESSION_TIMEOUT_MS=3600000  # 1 hour
   ```

3. **CORS Errors**
   ```bash
   # Allow all origins (development only)
   export CORS_ORIGIN="*"
   ```

4. **Memory Issues**
   ```bash
   # Reduce max sessions
   export MAX_SESSIONS=100

   # Enable more frequent cleanup
   export SESSION_CLEANUP_INTERVAL_MS=30000
   ```

5. **JSON Parsing Issues (Fixed in v2.3.0-alpha.1+)**
   ```bash
   # If experiencing "Invalid message: [object Object]" errors,
   # upgrade to the latest alpha version:
   npm install mcp-firebird@alpha

   # Or use the latest alpha directly:
   npx mcp-firebird@alpha --transport-type sse
   ```

   **Note**: Versions prior to 2.3.0-alpha.1 had a bug where POST requests to `/messages`
   endpoint failed to parse JSON body correctly. This has been fixed with improved
   middleware handling for both `application/json` and `text/plain` content types.

#### Monitoring and Logging

```bash
# Enable debug logging
export LOG_LEVEL=debug

# Monitor server health
curl http://localhost:3003/health | jq

# Check active sessions
curl http://localhost:3003/health | jq '.sessions'
```

## Quick Installation via Smithery

To install MCP Firebird for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@PuroDelphi/mcpFirebird):

```bash
npx -y @smithery/cli install @PuroDelphi/mcpFirebird --client claude
```


## Documentation

For more detailed information, check the following documents:

### Getting Started
- [Complete Installation](./docs/installation.md)
- [Configuration Options](./docs/configuration.md)
- [Available Tools](./docs/tools.md)

### Transport Protocols
- [SSE Transport Configuration](./docs/sse-transport.md)
- [Streamable HTTP Setup](./docs/streamable-http.md)
- [Transport Comparison](./docs/transport-comparison.md)

### Integration Guides
- [Claude Desktop Integration](./docs/claude-integration.md)
- [VSCode Integration](./docs/vscode-integration.md)
- [Docker Configuration](./docs/docker.md)
- [Usage from Different Languages](./docs/clients.md)

### Advanced Topics
- [Session Management](./docs/session-management.md)
- [Security](./docs/security.md)
- [Performance Tuning](./docs/performance.md)
- [Troubleshooting](./docs/troubleshooting.md)
- [SSE JSON Parsing Fix](./docs/sse-json-parsing-fix.md) - Details about the v2.3.0-alpha.1 bug fix

### Examples and Use Cases
- [Use Cases and Examples](./docs/use-cases.md)
- [MCP Updates Summary](./docs/mcp-updates-summary.md)


## Support the Project

### Donations

If you find MCP Firebird useful for your work or projects, please consider supporting its development through a donation. Your contributions help maintain and improve this tool.

- **GitHub Sponsors**: [Sponsor @PuroDelphi](https://github.com/sponsors/PuroDelphi)
- **PayPal**: [Donate via PayPal](https://www.paypal.com/donate/?hosted_button_id=KBAUBYYDNHQNQ)

![image](https://github.com/user-attachments/assets/d04cf0eb-32a8-48a7-9324-c02af5269370)


### Hire Our AI Agents

Another great way to support this project is by hiring our AI agents through [Asistentes Autónomos](https://asistentesautonomos.com). We offer specialized AI assistants for various business needs, helping you automate tasks and improve productivity.

### Priority Support

⭐ **Donors, sponsors, and clients receive priority support and assistance** with issues, feature requests, and implementation guidance. While we strive to help all users, those who support the project financially will receive faster response times and dedicated assistance.

Your support is greatly appreciated and helps ensure the continued development of MCP Firebird!

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
