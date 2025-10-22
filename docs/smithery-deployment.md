# Smithery Deployment Guide for MCP Firebird

This guide explains how to deploy MCP Firebird to Smithery platform.

## 📋 Prerequisites

- GitHub account
- Smithery account (https://smithery.ai)
- Firebird database accessible from the internet (or use Smithery's network)

## 🚀 Deployment Steps

### 1. Connect GitHub Repository

1. Go to https://smithery.ai
2. Click "Deploy" or "New Server"
3. Connect your GitHub account
4. Select the `mcpFirebird` repository
5. Select the `smithery/config-u9cv` branch

### 2. Configure Server

Smithery will automatically detect the `smithery.yaml` configuration file.

You'll need to provide the following configuration parameters:

#### Required Parameters

- **Database Path** (`database`): Absolute path to your Firebird database file
  - Example: `/firebird/data/employee.fdb`
  - Example: `/path/to/your/database.fdb`

#### Optional Parameters

- **Host** (`host`): Firebird server hostname or IP
  - Default: `localhost`
  - Example: `192.168.1.100`

- **Port** (`port`): Firebird server port
  - Default: `3050`

- **User** (`user`): Database username
  - Default: `SYSDBA`

- **Password** (`password`): Database password
  - Default: `masterkey`
  - ⚠️ **Important**: Use a strong password in production!

- **Use Native Driver** (`useNativeDriver`): Enable wire encryption
  - Default: `false`
  - Set to `true` for Firebird 3.0+ with wire encryption

- **Log Level** (`logLevel`): Logging verbosity
  - Default: `info`
  - Options: `debug`, `info`, `warn`, `error`

### 3. Deploy

1. Click "Deploy" button
2. Wait for the build to complete (usually 2-5 minutes)
3. Once deployed, you'll get a server URL like:
   ```
   https://server.smithery.ai/your-username/mcp-firebird
   ```

### 4. Test Connection

Use the Smithery playground or connect from your AI client:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const transport = new StreamableHTTPClientTransport(
  "https://server.smithery.ai/your-username/mcp-firebird"
);

const client = new Client({
  name: "my-client",
  version: "1.0.0"
});

await client.connect(transport);

// List available tools
const tools = await client.listTools();
console.log(tools);
```

## 🔧 Configuration Examples

### Example 1: Local Development Database

```yaml
host: "localhost"
port: 3050
database: "/firebird/data/employee.fdb"
user: "SYSDBA"
password: "masterkey"
useNativeDriver: false
logLevel: "debug"
```

### Example 2: Remote Production Database

```yaml
host: "192.168.1.100"
port: 3050
database: "/opt/firebird/data/production.fdb"
user: "APP_USER"
password: "your-secure-password"
useNativeDriver: true
logLevel: "info"
```

### Example 3: Cloud Database with Wire Encryption

```yaml
host: "firebird.example.com"
port: 3050
database: "/data/secure.fdb"
user: "CLOUD_USER"
password: "very-secure-password"
useNativeDriver: true
logLevel: "warn"
```

## 📊 Available Tools

Once deployed, your MCP server will provide these tools:

### Database Operations
- `execute-query` - Execute SQL queries
- `list-tables` - List all tables
- `describe-table` - Get table schema
- `get-field-descriptions` - Get field descriptions

### Performance Analysis
- `analyze-query-performance` - Analyze query performance
- `get-execution-plan` - Get query execution plan
- `analyze-missing-indexes` - Find missing indexes

### Batch Operations
- `execute-batch-queries` - Execute multiple queries in parallel
- `describe-batch-tables` - Get multiple table schemas

### Database Management
- `backup-database` - Create database backup
- `restore-database` - Restore from backup
- `validate-database` - Validate database integrity

## 🐛 Troubleshooting

### Build Fails

**Problem**: TypeScript compilation errors

**Solution**: 
- Check that all dependencies are listed in `package.json`
- Verify that `smithery.config.js` has correct external packages
- Check build logs for specific errors

### Connection Fails

**Problem**: Cannot connect to database

**Solution**:
- Verify database path is correct and accessible
- Check firewall rules allow connection to Firebird port
- Verify credentials are correct
- Check database is running

### Slow Performance

**Problem**: Queries are slow

**Solution**:
- Use `analyze-query-performance` tool to identify bottlenecks
- Use `analyze-missing-indexes` to find optimization opportunities
- Check network latency between Smithery and your database
- Consider using a database closer to Smithery's servers

### Wire Encryption Issues

**Problem**: Wire encryption not working

**Solution**:
- Ensure `useNativeDriver: true` is set
- Verify Firebird server is 3.0+ with WireCrypt enabled
- Check that native driver dependencies are available
- Review server logs for specific errors

## 📚 Additional Resources

- **Smithery Documentation**: https://smithery.ai/docs
- **MCP Protocol**: https://modelcontextprotocol.io
- **Firebird Documentation**: https://firebirdsql.org/en/documentation/
- **GitHub Repository**: https://github.com/PuroDelphi/mcpFirebird

## 💬 Support

- **GitHub Issues**: https://github.com/PuroDelphi/mcpFirebird/issues
- **Donations**: https://www.paypal.com/donate/?hosted_button_id=KBAUBYYDNHQNQ
- **Professional Support**: https://asistentesautonomos.com

## 🔄 Updates

To update your deployment:

1. Push changes to the `smithery/config-u9cv` branch
2. Smithery will automatically rebuild and redeploy
3. No downtime during updates

## 🔐 Security Best Practices

1. **Never commit passwords** to the repository
2. Use **strong passwords** for production databases
3. Enable **wire encryption** for sensitive data
4. Restrict **database access** to specific IPs
5. Use **read-only users** when possible
6. Enable **audit logging** on the database
7. Regularly **backup** your database

---

**Made with ❤️ by [Jhonny Suárez](https://asistentesautonomos.com)**

