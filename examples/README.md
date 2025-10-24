# MCP Firebird Examples

This directory contains examples for using the MCP Firebird server with different transport types and clients.

## 📁 Directory Structure

```
examples/
├── README.md                          # This file
├── ExampleClaudeV2.mp4               # Video demonstration
├── config/                           # Configuration examples
│   ├── claude-desktop.json          # Claude Desktop configuration
│   ├── vscode-mcp.json              # VS Code MCP configuration
│   └── environment-variables.env    # Environment variables example
├── clients/                          # Client examples
│   ├── typescript/                  # TypeScript client examples
│   │   ├── streamable-http-client.ts
│   │   └── stdio-client.ts
│   ├── python/                      # Python client examples
│   │   ├── streamable_http_client.py
│   │   └── requirements.txt
│   └── javascript/                  # JavaScript client examples
│       └── streamable-http-client.js
└── legacy/                           # Legacy SSE examples (deprecated)
    ├── sse-client.html
    ├── sse-client.js
    └── sse_client.py

```

## 🚀 Quick Start

### 1. Claude Desktop Integration (Recommended)

Copy the configuration from `config/claude-desktop.json` to your Claude Desktop config file:

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Linux:** `~/.config/Claude/claude_desktop_config.json`

### 2. VS Code Integration

Copy the configuration from `config/vscode-mcp.json` to your VS Code settings.

### 3. Custom Client

See the examples in the `clients/` directory for TypeScript, Python, and JavaScript implementations.

## 📚 Transport Types

MCP Firebird supports 4 transport types:

1. **STDIO** (Recommended for local integrations like Claude Desktop)
2. **HTTP Streamable** (Recommended for web/remote access) - **Default stateless mode**
3. **SSE** (Legacy, deprecated)
4. **Unified** (Supports both HTTP Streamable and SSE)

See [docs/transport-types.md](../docs/transport-types.md) for detailed information.

## 🎥 Video Tutorial

Watch `ExampleClaudeV2.mp4` for a complete demonstration of using MCP Firebird with Claude Desktop.

## 📖 Documentation

For more information, see:
- [Installation Guide](../docs/installation.md)
- [Configuration Guide](../docs/configuration.md)
- [Transport Types](../docs/transport-types.md)
- [Tools Reference](../docs/tools.md)

## 💡 Need Help?

- Check the [Troubleshooting Guide](../docs/troubleshooting.md)
- Open an issue on [GitHub](https://github.com/PuroDelphi/mcpFirebird/issues)
- Support the project: [Donate via PayPal](https://www.paypal.com/donate/?hosted_button_id=KBAUBYYDNHQNQ)

