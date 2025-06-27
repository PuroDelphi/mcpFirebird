# MCP Firebird v2.0.9 Release Notes

## Overview

This release focuses on fixing environment variable handling in STDIO mode, particularly when using the MCP Inspector. The changes ensure that the MCP Firebird server can properly connect to the database even when environment variables are not properly passed between processes.

## Key Changes

### Fixed Environment Variable Handling

- Fixed environment variable handling in STDIO mode with MCP Inspector
- Added hardcoded default database path as fallback when environment variables are not set
- Improved batch file creation for running MCP Firebird with Inspector

### New Scripts for STDIO Mode

- Added `run-all-stdio.js` script to run both the MCP Inspector and MCP Firebird server
- Added `start-mcp-stdio.js` script to run the MCP Firebird server with proper environment variables

## Compatibility

This version is compatible with:
- Claude Desktop
- MCP Inspector
- Node.js 18+
- Firebird 2.5+

## Installation

```bash
npm install -g mcp-firebird@2.0.9
```

## Usage with Claude Desktop

1. Install the package globally
2. Configure Claude Desktop to use MCP Firebird as the MCP server
3. Use the command `npx mcp-firebird` to start the server

## Usage with MCP Inspector

```bash
node run-all-stdio.js
```

This will start both the MCP Inspector and the MCP Firebird server with the correct configuration.

## Documentation

For more information, please refer to the documentation in the `docs` folder.
