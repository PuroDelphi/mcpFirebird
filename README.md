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
- **Dual Driver Support**: Choose between simple installation (default) or native driver with wire encryption support

## 🚀 Quick Start with Smithery (Recommended for Cloud Deployment)

**Deploy MCP Firebird to the cloud in under 5 minutes!**

[![smithery badge](https://smithery.ai/badge/@PuroDelphi/mcpFirebird)](https://smithery.ai/server/@PuroDelphi/mcpFirebird)

[Smithery](https://smithery.ai) is the easiest way to deploy MCP Firebird to production:

✅ **One-click deployment** - No infrastructure setup required
✅ **Automatic scaling** - Handles traffic spikes automatically
✅ **Built-in monitoring** - Track usage and performance
✅ **Secure credentials** - Encrypted environment variables
✅ **Auto-updates** - Always running the latest version
✅ **Global CDN** - Low latency worldwide

### How to Deploy on Smithery

1. **Visit** [smithery.ai](https://smithery.ai)
2. **Connect** your GitHub account
3. **Select** the `mcpFirebird` repository
4. **Configure** your Firebird database connection:
   ```yaml
   host: "your-firebird-server.com"
   port: 3050
   database: "/path/to/database.fdb"
   user: "SYSDBA"
   password: "your-secure-password"
   useNativeDriver: true  # Enable wire encryption (optional)
   logLevel: "info"
   ```
5. **Click Deploy** - Done! ✨

Your MCP Firebird server will be available at:
```
https://server.smithery.ai/your-username/mcp-firebird
```

### Using with AI Clients

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const transport = new StreamableHTTPClientTransport(
  "https://server.smithery.ai/your-username/mcp-firebird"
);

const client = new Client({
  name: "my-ai-app",
  version: "1.0.0"
});

await client.connect(transport);
```

**📚 For detailed Smithery deployment instructions, see [SMITHERY_DEPLOYMENT.md](./SMITHERY_DEPLOYMENT.md)**

## 🔒 Wire Encryption Support

MCP Firebird supports **two driver options**:

| Driver | Installation | Wire Encryption | Use Case |
|--------|--------------|-----------------|----------|
| **Pure JavaScript** (default) | ✅ Simple (`npx`) | ❌ No | Most users, quick setup |
| **Native Driver** (optional) | ⚠️ Complex (requires build tools) | ✅ Yes | Enterprise, security required |

### Quick Start (Default - No Wire Encryption)

```bash
npx mcp-firebird@alpha --database=/path/to/database.fdb
```

### Advanced (With Wire Encryption Support)

⚠️ **CRITICAL**: `npx` does NOT work with the native driver. You MUST install globally.

⚠️ **IMPORTANT**: Wire encryption must be configured on the **Firebird server** (`firebird.conf`), not on the client.

**Server Configuration** (required first):
```conf
# In firebird.conf on the server
WireCrypt = Required  # or Enabled
```

**Client Installation** (MUST be global):
```bash
# Step 1: Install build tools
# Windows: Visual Studio Build Tools (https://visualstudio.microsoft.com/downloads/)
# Linux: sudo apt-get install build-essential python3 firebird-dev
# macOS: xcode-select --install && brew install firebird

# Step 2: Install MCP Firebird globally
npm install -g mcp-firebird@alpha

# Step 3: Install native driver globally
npm install -g node-firebird-driver-native

# Step 4: Run directly (WITHOUT npx)
mcp-firebird --use-native-driver \
  --database=/path/to/database.fdb \
  --host=localhost \
  --user=SYSDBA \
  --password=masterkey
```

**Why not npx?** When `npx` runs a package from its temporary cache, it cannot access globally installed modules like `node-firebird-driver-native`. Both packages must be installed globally in the same location.

**📚 For detailed installation instructions, see:**
- [Native Driver Installation Guide](./docs/native-driver-installation.md) - **Step-by-step for Windows/Linux/macOS**
- [Wire Encryption Guide](./docs/wire-encryption-limitation.md)
- [Advanced Installation Guide](./docs/advanced-installation.md)

### Manual Installation

#### Stable Version
```bash
# Global installation (stable)
npm install -g mcp-firebird

# Run the server
npx mcp-firebird --database /path/to/database.fdb

# Or use specific stable version
npm install -g mcp-firebird@2.2.3
```

**Stable Features (v2.2.3):**
- 🐛 **FIXED**: SSE JSON parsing bug - resolves "Invalid message: [object Object]" errors
- ✨ Streamable HTTP transport support (MCP 2025-03-26)
- 🔄 Unified server with automatic protocol detection
- 📊 Enhanced session management and monitoring
- 🛠️ Modern MCP SDK integration (v1.13.2)
- 🔧 Improved error handling and logging
- 🧪 Comprehensive test suite with 9+ tests for SSE functionality

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

### Troubleshooting

#### Firebird Connection Issues

1. **Wire Encryption Incompatibility (Firebird 3.0+)** ⚠️ **CRITICAL**

   **Error**: `Incompatible wire encryption levels requested on client and server`

   **IMPORTANT**: The `node-firebird` library does NOT support Firebird 3.0+ wire encryption. The `--wire-crypt` parameter does NOT work.

   **ONLY Solution**: You MUST disable wire encryption on the Firebird server:

   For Firebird 3.0, add to `firebird.conf`:
   ```conf
   WireCrypt = Disabled
   AuthServer = Srp, Legacy_Auth
   ```

   For Firebird 4.0+, add to `firebird.conf`:
   ```conf
   WireCrypt = Disabled
   AuthServer = Srp256, Srp, Legacy_Auth
   ```

   For Firebird 5.0 Docker:
   ```yaml
   environment:
     FIREBIRD_CONF_WireCrypt: Disabled
     FIREBIRD_CONF_AuthServer: Srp256, Srp
   ```

   **If you cannot change server configuration**, see [Wire Encryption Limitation](./docs/wire-encryption-limitation.md) for alternatives.

2. **Database Path Issues on Linux/Unix**

   **Problem**: Remote connection strings or Unix paths not working

   **Solution**: This is fixed in v2.4.0-alpha.1+. The following paths now work correctly:
   - Remote: `server:/path/to/database.fdb`
   - Unix absolute: `/var/lib/firebird/database.fdb`
   - IP-based: `192.168.1.100:/data/db.fdb`

3. **I/O Error with Mixed-Case Paths on Windows**

   **Error**: `I/O error during CreateFile (open) operation`

   **Problem**: Database path with mixed case (e.g., `C:\MyData\database.fdb`) causes errors

   **Workarounds**:
   - Use all-uppercase paths: `C:\MYDATA\DATABASE.FDB`
   - Use forward slashes: `C:/MyData/database.fdb`
   - See [Wire Encryption Fix Documentation](./docs/wire-encryption-fix.md#error-io-error-in-windows-with-mixed-case-paths) for more details

#### SSE Connection Issues

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
   middleware handling for 