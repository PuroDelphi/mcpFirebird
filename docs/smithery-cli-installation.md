# Smithery CLI - Local Installation Guide

This guide explains how to install and configure MCP Firebird locally using the Smithery CLI. This is ideal for users who want to use MCP Firebird with local AI clients like Claude Desktop, Cursor, or other MCP-compatible applications.

---

## 📋 Table of Contents

- [What is Smithery CLI?](#what-is-smithery-cli)
- [Prerequisites](#prerequisites)
- [Installation Methods](#installation-methods)
- [Configuration](#configuration)
- [Usage Examples](#usage-examples)
- [Troubleshooting](#troubleshooting)

---

## 🤔 What is Smithery CLI?

The Smithery CLI is a registry installer and manager for Model Context Protocol (MCP) servers. It provides:

- ✅ **Easy installation** - Install MCP servers from the registry with one command
- ✅ **Client-agnostic** - Works with Claude Desktop, Cursor, and other MCP clients
- ✅ **Configuration management** - Handles server configuration automatically
- ✅ **Interactive setup** - Prompts for required configuration values
- ✅ **Multiple clients** - Manage servers across different AI clients

---

## 📦 Prerequisites

Before installing MCP Firebird with Smithery CLI, ensure you have:

1. **Node.js** (v18 or higher)
   ```bash
   node --version  # Should be v18.0.0 or higher
   ```

2. **npm** (comes with Node.js)
   ```bash
   npm --version
   ```

3. **Firebird Database** (2.5+ or 3.0+ for wire encryption)
   - Database file path
   - Host and port (if remote)
   - Username and password

4. **AI Client** (one of the following):
   - Claude Desktop
   - Cursor
   - Any MCP-compatible client

---

## 🚀 Installation Methods

### Method 1: Interactive Installation (Recommended)

This method will prompt you for all required configuration:

```bash
npx -y @smithery/cli@latest install mcp-firebird --client claude
```

**What happens:**
1. Smithery CLI downloads the latest version
2. Prompts for configuration (database path, host, credentials, etc.)
3. Automatically configures your AI client
4. Server is ready to use!

**Example interaction:**
```
? Database host: localhost
? Database port: 3050
? Database path: /path/to/your/database.fdb
? Username: SYSDBA
? Password: ********
? Use native driver (for wire encryption)? Yes
? Log level: info
✓ MCP Firebird installed successfully!
```

### Method 2: Pre-configured Installation

Skip prompts by providing configuration upfront:

```bash
npx -y @smithery/cli@latest install mcp-firebird --client claude --config '{
  "host": "localhost",
  "port": 3050,
  "database": "/path/to/database.fdb",
  "user": "SYSDBA",
  "password": "masterkey",
  "useNativeDriver": true,
  "logLevel": "info"
}'
```

### Method 3: Installation for Multiple Clients

Install for different AI clients:

```bash
# For Claude Desktop
npx -y @smithery/cli@latest install mcp-firebird --client claude

# For Cursor
npx -y @smithery/cli@latest install mcp-firebird --client cursor

# For other clients
npx -y @smithery/cli@latest install mcp-firebird --client <client-name>
```

---

## ⚙️ Configuration

### Basic Configuration

Minimum required configuration:

```json
{
  "database": "/path/to/database.fdb",
  "user": "SYSDBA",
  "password": "masterkey"
}
```

### Full Configuration Options

All available configuration options:

```json
{
  "host": "localhost",
  "port": 3050,
  "database": "/path/to/database.fdb",
  "user": "SYSDBA",
  "password": "masterkey",
  "useNativeDriver": true,
  "logLevel": "info"
}
```

**Configuration Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `database` | string | ✅ Yes | - | Path to Firebird database file |
| `user` | string | ✅ Yes | - | Database username |
| `password` | string | ✅ Yes | - | Database password |
| `host` | string | ❌ No | `localhost` | Database server host |
| `port` | number | ❌ No | `3050` | Database server port |
| `useNativeDriver` | boolean | ❌ No | `false` | Enable native driver for wire encryption |
| `logLevel` | string | ❌ No | `info` | Logging level (error, warn, info, debug) |

### Wire Encryption Configuration

For Firebird 3.0+ with wire encryption:

```bash
npx -y @smithery/cli@latest install mcp-firebird --client claude --config '{
  "host": "your-server.com",
  "port": 3050,
  "database": "/path/to/database.fdb",
  "user": "SYSDBA",
  "password": "masterkey",
  "useNativeDriver": true
}'
```

**Requirements for Wire Encryption:**
- Firebird 3.0 or higher
- Server configured with `WireCrypt = Enabled` or `WireCrypt = Required`
- Native driver enabled (`useNativeDriver: true`)

---

## 💡 Usage Examples

### Example 1: Local Database

```bash
npx -y @smithery/cli@latest install mcp-firebird --client claude --config '{
  "database": "C:/Databases/myapp.fdb",
  "user": "SYSDBA",
  "password": "masterkey"
}'
```

### Example 2: Remote Database

```bash
npx -y @smithery/cli@latest install mcp-firebird --client claude --config '{
  "host": "192.168.1.100",
  "port": 3050,
  "database": "/opt/firebird/data/production.fdb",
  "user": "SYSDBA",
  "password": "securepassword"
}'
```

### Example 3: Secure Connection with Wire Encryption

```bash
npx -y @smithery/cli@latest install mcp-firebird --client claude --config '{
  "host": "db.company.com",
  "port": 3050,
  "database": "/data/enterprise.fdb",
  "user": "SYSDBA",
  "password": "enterprise_password",
  "useNativeDriver": true,
  "logLevel": "debug"
}'
```

### Example 4: Multiple Databases

Install separate instances for different databases:

```bash
# Development database
npx -y @smithery/cli@latest install mcp-firebird --client claude --config '{
  "database": "/data/dev.fdb",
  "user": "DEV_USER",
  "password": "dev123"
}'

# Production database (different client or profile)
npx -y @smithery/cli@latest install mcp-firebird --client cursor --config '{
  "database": "/data/prod.fdb",
  "user": "PROD_USER",
  "password": "prod_secure_pass",
  "useNativeDriver": true
}'
```

---

## 🔧 Management Commands

### List Installed Servers

```bash
# List all servers for Claude Desktop
npx @smithery/cli list servers --client claude

# List all servers for Cursor
npx @smithery/cli list servers --client cursor
```

### Inspect Server Configuration

```bash
npx @smithery/cli inspect mcp-firebird
```

### Uninstall Server

```bash
# Remove from Claude Desktop
npx @smithery/cli uninstall mcp-firebird --client claude

# Remove from Cursor
npx @smithery/cli uninstall mcp-firebird --client cursor
```

### Run Server Manually

Test the server with custom configuration:

```bash
npx @smithery/cli run mcp-firebird --config '{
  "database": "/path/to/test.fdb",
  "user": "SYSDBA",
  "password": "masterkey"
}'
```

---

## 🐛 Troubleshooting

### Issue: "Command not found"

**Solution:** Ensure Node.js and npm are installed:
```bash
node --version
npm --version
```

### Issue: "Failed to connect to database"

**Possible causes:**
1. Incorrect database path
2. Wrong credentials
3. Firebird server not running
4. Firewall blocking connection

**Solution:**
```bash
# Test connection manually
npx mcp-firebird --database /path/to/db.fdb --user SYSDBA --password masterkey
```

### Issue: "Wire encryption not working"

**Solution:**
1. Verify Firebird 3.0+ is installed
2. Check server configuration:
   ```
   # In firebird.conf
   WireCrypt = Enabled  # or Required
   ```
3. Ensure native driver is enabled:
   ```json
   {
     "useNativeDriver": true
   }
   ```

### Issue: "Client not found"

**Solution:** List available clients:
```bash
npx @smithery/cli list clients
```

### Issue: "Configuration not saved"

**Solution:** Restart your AI client after installation:
- **Claude Desktop**: Quit and reopen the application
- **Cursor**: Restart the editor
- **Other clients**: Check client-specific documentation

---

## 📚 Additional Resources

- **Smithery CLI Documentation**: https://smithery.ai/docs/concepts/cli
- **MCP Firebird GitHub**: https://github.com/PuroDelphi/mcpFirebird
- **Smithery Registry**: https://smithery.ai/server/mcp-firebird
- **Issue Tracker**: https://github.com/PuroDelphi/mcpFirebird/issues

---

## 🆘 Getting Help

If you encounter issues:

1. **Check the logs**: Enable debug logging with `"logLevel": "debug"`
2. **Verify configuration**: Use `npx @smithery/cli inspect mcp-firebird`
3. **Test manually**: Run the server directly with `npx mcp-firebird`
4. **Report issues**: https://github.com/PuroDelphi/mcpFirebird/issues

---

**Made with ❤️ by [Jhonny Suárez](https://asistentesautonomos.com)**

