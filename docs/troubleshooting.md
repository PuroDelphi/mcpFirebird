# Debugging and Troubleshooting in MCP Firebird

This document provides information for solving common problems with MCP Firebird.

## Common Issues

### Database Connection Error

**Symptom**: Error "Cannot connect to database" or "Connection refused".

**Possible solutions**:
1. Verify that the Firebird server is running.
2. Check that the database path is correct.
3. Verify the user credentials and password.
4. Make sure the host and port are correct.

```bash
# Verify the database connection
npx mcp-firebird --database /path/to/database.fdb --user SYSDBA --password masterkey --test-connection
```

### Error "No database specified" or "FIREBIRD_DATABASE is not set"

**Symptom**: Error "No database specified" or "FIREBIRD_DATABASE is not set" when running database tools or using Claude Desktop.

**Possible solutions**:

1. **When using Claude Desktop or Smithery**:
   - Make sure to include the database path in the configuration:
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

2. **When using command line**:
   - Provide the database path as a parameter:
   ```bash
   npx mcp-firebird --database /path/to/database.fdb
   ```

3. **When using environment variables**:
   - Set the `FIREBIRD_DATABASE` environment variable:
   ```bash
   # Windows
   set FIREBIRD_DATABASE=C:\path\to\database.fdb

   # Linux/macOS
   export FIREBIRD_DATABASE=/path/to/database.fdb
   ```

4. **Using a .env file**:
   - Create a `.env` file in the project root with:
   ```
   FIREBIRD_DATABASE=/path/to/database.fdb
   FIREBIRD_HOST=localhost
   FIREBIRD_PORT=3050
   FIREBIRD_USER=SYSDBA
   FIREBIRD_PASSWORD=masterkey
   ```

```bash
# Set the environment variable
export FIREBIRD_DATABASE=/path/to/database.fdb

# Or provide the path as a parameter
npx mcp-firebird --database /path/to/database.fdb
```

### Error "gbak not found" during backup/restore

**Symptom**: Error "spawn gbak ENOENT" when trying to backup or restore a database.

**Possible solutions**:
1. Install the Firebird client tools.
2. Add the Firebird bin directory to your PATH.
3. Specify the full path to gbak in your configuration.

```bash
# Install Firebird client tools (Debian/Ubuntu)
sudo apt-get install firebird3.0-utils

# Add to PATH (Windows)
set PATH=%PATH%;C:\Program Files\Firebird\Firebird_3_0\bin
```

### Claude Desktop Integration Issues

**Symptom**: Claude Desktop cannot connect to MCP Firebird or shows "Server transport closed" errors.

**Possible solutions**:
1. Verify that the configuration in `claude_desktop_config.json` is correct.
2. Make sure the database path is absolute and uses double backslashes on Windows.
3. Restart Claude Desktop after making changes to the configuration.

```json
{
  "mcpServers": {
    "mcp-firebird": {
      "command": "npx",
      "args": [
        "mcp-firebird",
        "--database",
        "C:\\absolute\\path\\to\\database.fdb"
      ],
      "type": "stdio"
    }
  }
}
```

### SSE Transport Issues

**Symptom**: Cannot connect to the SSE server or receiving CORS errors.

**Possible solutions**:
1. Verify that the SSE server is running on the correct port.
2. Check for CORS issues if connecting from a web browser.
3. Make sure the client is using the correct URL.

```bash
# Start with SSE transport and CORS enabled
npx mcp-firebird --transport-type sse --sse-port 3003 --cors-enabled --database /path/to/database.fdb --host localhost --port 3050 --user SYSDBA --password masterkey
```

## Debugging

### Enable Debug Logging

Set the `LOG_LEVEL` environment variable to `debug` for more detailed logs:

```bash
export LOG_LEVEL=debug
npx mcp-firebird
```

### Check Server Status

Use the `ping` method to check if the server is responding:

```bash
echo '{"id":1,"method":"ping","params":{}}' | npx mcp-firebird
```

### Inspect Database Schema

Use the `list-tables` and `describe-table` methods to inspect the database schema:

```bash
# List all tables
echo '{"id":1,"method":"list-tables","params":{}}' | npx mcp-firebird

# Describe a specific table
echo '{"id":1,"method":"describe-table","params":{"tableName":"EMPLOYEES"}}' | npx mcp-firebird
```

## Getting Help

If you continue to experience issues, you can:

1. Open an issue on the GitHub repository.
2. Check the Firebird SQL documentation for database-specific issues.
3. Use the MCP Inspector to debug the server:

```bash
npx @modelcontextprotocol/inspector http://localhost:3003
```
