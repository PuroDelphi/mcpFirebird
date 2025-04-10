# Installing MCP Firebird

This document provides detailed instructions for installing MCP Firebird and its dependencies.

## Installing the Node.js Package

MCP Firebird is available as an npm package that can be installed globally or as a project dependency:

```bash
# Global installation
npm install -g mcp-firebird

# Project installation
npm install mcp-firebird
```

## Firebird Client Tools

For database management functions (backup, restore, validation), you need to install the Firebird client tools:

### Windows

1. Download Firebird from https://firebirdsql.org/en/downloads/
2. Run the installer and select "Client components" during installation
3. Add the Firebird bin directory to your PATH environment variable
   (typically C:\Program Files\Firebird\Firebird_X_X\bin)
4. Restart your terminal or application

### macOS

```bash
# Using Homebrew
brew install firebird
```

### Linux (Debian/Ubuntu)

```bash
sudo apt-get install firebird3.0-utils
```

### Linux (Fedora/RHEL)

```bash
sudo dnf install firebird-utils
```

### Alpine Linux

Alpine Linux doesn't include the Firebird client tools needed for backup/restore operations.
It's recommended to use Debian/Ubuntu for these operations.

## Verifying the Installation

To verify that MCP Firebird has been installed correctly, run:

```bash
npx mcp-firebird --version
```

You should see the current version of MCP Firebird.

## Next Steps

Once installed, you can:

1. [Configure MCP Firebird](./configuration.md)
2. [Run MCP Firebird with Docker](./docker.md)
3. [Explore the available tools](./tools.md)
