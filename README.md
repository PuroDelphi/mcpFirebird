# MCP Firebird

Implementation of Anthropic's MCP (Model Context Protocol) for Firebird databases.

## What is MCP Firebird?

MCP Firebird is a server that implements Anthropic's [Model Context Protocol (MCP)](https://github.com/anthropics/anthropic-cookbook/tree/main/model_context_protocol) for [Firebird SQL databases](https://firebirdsql.org/). It allows Large Language Models (LLMs) like Claude to access, analyze, and manipulate data in Firebird databases securely and in a controlled manner.

## Key Features

- **SQL Queries**: Execute SQL queries on Firebird databases
- **Schema Analysis**: Get detailed information about tables, columns, and relationships
- **Database Management**: Perform backup, restore, and validation operations
- **Performance Analysis**: Analyze query performance and suggest optimizations
- **Multiple Transports**: Supports STDIO and SSE (Server-Sent Events) transports
- **Claude Integration**: Works seamlessly with Claude Desktop and other MCP clients
- **Security**: Includes SQL query validation and security configuration options

## Quick Installation

```bash
# Global installation
npm install -g mcp-firebird

# Run the server
npx mcp-firebird --database /path/to/database.fdb
```

For backup/restore operations, you'll need to install the Firebird client tools. See [Complete Installation](./docs/installation.md) for more details.

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
           "--database",
           "C:\\path\\to\\database.fdb"
         ],
         "type": "stdio"
       }
     }
   }
   ```

3. Restart Claude Desktop

### With SSE Transport

```bash
# Start with SSE transport
npx mcp-firebird --transport-type sse --sse-port 3003 --database /path/to/database.fdb
```

## Documentation

For more detailed information, check the following documents:

- [Complete Installation](./docs/installation.md)
- [Configuration Options](./docs/configuration.md)
- [Available Tools](./docs/tools.md)
- [Docker Configuration](./docs/docker.md)
- [Usage from Different Languages](./docs/clients.md)
- [Security](./docs/security.md)
- [Troubleshooting](./docs/troubleshooting.md)
- [Use Cases and Examples](./docs/use-cases.md)

## Recent Versions

### Version 2.0.7-alpha.5

- Improved detection of Firebird client tools
- Updated Dockerfile to use Debian instead of Alpine
- Fixed issues with backup/restore operations
- Improved documentation and organization
- Expanded security documentation with detailed examples
- Translated documentation to English

### Version 2.0.5-alpha.27

- Added support for SSE transport
- Improved compatibility with Claude Desktop
- Added performance analysis tools
- Fixed database connection issues

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
