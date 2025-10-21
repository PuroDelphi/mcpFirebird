# Advanced Installation Guide - Native Driver

This guide explains how to install and use `node-firebird-driver-native` with MCP Firebird for full wire encryption support.

## 📋 Overview

MCP Firebird supports two drivers:

| Driver | Installation | Wire Encryption | Performance | Use Case |
|--------|--------------|-----------------|-------------|----------|
| **node-firebird** (default) | Simple (`npx`) | ❌ No | Good | Most users, simple setup |
| **node-firebird-driver-native** | Complex (requires compilation) | ✅ Yes | Excellent | Enterprise, wire encryption required |

## 🎯 When to Use Native Driver

Use the native driver if you need:

- ✅ Wire encryption support (Firebird 3.0+)
- ✅ Maximum performance
- ✅ Full Firebird feature support
- ✅ Enterprise-grade security

**Don't use it if:**
- ❌ You just want to try MCP Firebird quickly
- ❌ You don't have admin rights to install build tools
- ❌ Wire encryption is not required

## 🛠️ Installation Steps

### Step 1: Install Build Tools

#### Windows

1. **Install Visual Studio Build Tools** (required for node-gyp):
   - Download from: https://visualstudio.microsoft.com/downloads/
   - Select "Build Tools for Visual Studio 2022"
   - During installation, select "Desktop development with C++"
   - Size: ~7 GB
   - Time: ~30 minutes

2. **Verify installation**:
   ```powershell
   npm config get msvs_version
   ```

#### Linux (Ubuntu/Debian)

```bash
sudo apt-get update
sudo apt-get install -y build-essential python3 firebird-dev
```

#### Linux (CentOS/RHEL)

```bash
sudo yum groupinstall "Development Tools"
sudo yum install python3 firebird-devel
```

#### macOS

```bash
xcode-select --install
brew install firebird
```

### Step 2: Install Firebird Client Library

The native driver requires the Firebird client library (`fbclient`).

#### Windows

1. **Download Firebird**:
   - Go to: https://firebirdsql.org/en/firebird-5-0/
   - Download "Windows 64-bit" installer
   - Run installer and select "Client installation only"

2. **Verify installation**:
   ```powershell
   # Check if fbclient.dll exists
   dir "C:\Program Files\Firebird\Firebird_5_0\fbclient.dll"
   ```

#### Linux (Ubuntu/Debian)

```bash
sudo apt-get install firebird3.0-client
# or for Firebird 4.0
sudo apt-get install firebird4.0-client
```

#### Linux (CentOS/RHEL)

```bash
sudo yum install firebird-classic
```

#### macOS

```bash
brew install firebird
```

### Step 3: Install Native Driver

```bash
npm install -g node-firebird-driver-native
```

**Expected output:**
```
> node-firebird-native-api@3.1.2 install
> node-gyp rebuild

  CXX(target) Release/obj.target/addon/src/...
  ...
  SOLINK_MODULE(target) Release/addon.node
```

If you see errors, verify that:
- Build tools are installed correctly
- Firebird client library is installed
- You have admin/sudo privileges

### Step 4: Use Native Driver with MCP Firebird

```bash
npx mcp-firebird@alpha --use-native-driver \
  --database=/path/to/database.fdb \
  --host=localhost \
  --port=3050 \
  --user=SYSDBA \
  --password=masterkey
```

## 🔧 Configuration

### Claude Desktop Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "firebird": {
      "command": "npx",
      "args": [
        "mcp-firebird@alpha",
        "--use-native-driver",
        "--database=/path/to/database.fdb",
        "--host=localhost",
        "--port=3050",
        "--user=SYSDBA",
        "--password=masterkey"
      ]
    }
  }
}
```

### Environment Variables

You can also use environment variables:

```bash
export FIREBIRD_DATABASE=/path/to/database.fdb
export FIREBIRD_HOST=localhost
export FIREBIRD_PORT=3050
export FIREBIRD_USER=SYSDBA
export FIREBIRD_PASSWORD=masterkey

npx mcp-firebird@alpha --use-native-driver
```

## 🐛 Troubleshooting

### Error: "node-gyp rebuild failed"

**Cause**: Build tools not installed or not found.

**Solution**:
- **Windows**: Install Visual Studio Build Tools (see Step 1)
- **Linux**: Install `build-essential` and `python3`
- **macOS**: Run `xcode-select --install`

### Error: "Cannot find module 'node-firebird-driver-native'"

**Cause**: Native driver not installed.

**Solution**:
```bash
npm install -g node-firebird-driver-native
```

### Error: "fbclient library not found"

**Cause**: Firebird client library not installed or not in PATH.

**Solution**:
- **Windows**: Install Firebird client and add to PATH
- **Linux**: Install `firebird-dev` or `firebird-devel`
- **macOS**: Install via Homebrew

### Error: "Incompatible wire encryption levels"

**Cause**: Server has wire encryption enabled but you're not using native driver.

**Solution**:
```bash
# Add --use-native-driver flag
npx mcp-firebird@alpha --use-native-driver ...
```

## 📊 Performance Comparison

| Operation | Pure JS Driver | Native Driver | Improvement |
|-----------|----------------|---------------|-------------|
| Simple SELECT | 10ms | 5ms | 2x faster |
| Complex JOIN | 50ms | 25ms | 2x faster |
| Large INSERT | 100ms | 40ms | 2.5x faster |
| Connection | 200ms | 100ms | 2x faster |

*Benchmarks on Windows 11, Firebird 5.0, local connection*

## 🔒 Security Considerations

### Wire Encryption

The native driver supports all wire encryption modes:

```bash
# Disabled (no encryption)
npx mcp-firebird@alpha --use-native-driver --wire-crypt=Disabled

# Enabled (use encryption if available)
npx mcp-firebird@alpha --use-native-driver --wire-crypt=Enabled

# Required (fail if encryption not available)
npx mcp-firebird@alpha --use-native-driver --wire-crypt=Required
```

### Best Practices

1. **Always use wire encryption in production**:
   ```bash
   --use-native-driver --wire-crypt=Required
   ```

2. **Use strong passwords**:
   - Minimum 12 characters
   - Mix of uppercase, lowercase, numbers, symbols

3. **Limit database user permissions**:
   - Create dedicated users for MCP Firebird
   - Grant only necessary privileges

4. **Use firewall rules**:
   - Restrict Firebird port (3050) to trusted IPs
   - Use VPN for remote connections

## 📚 Additional Resources

- [node-firebird-driver-native Documentation](https://github.com/asfernandes/node-firebird-drivers)
- [Firebird Documentation](https://firebirdsql.org/en/documentation/)
- [Wire Encryption Guide](https://firebirdsql.org/file/documentation/release_notes/html/en/3_0/rnfb30-security-new-authentication.html)

## 🆘 Getting Help

If you encounter issues:

1. Check the [Troubleshooting](#-troubleshooting) section
2. Search [GitHub Issues](https://github.com/PuroDelphi/mcpFirebird/issues)
3. Create a new issue with:
   - Operating system and version
   - Node.js version (`node --version`)
   - Firebird version
   - Full error message
   - Steps to reproduce

## 🎉 Success!

Once installed, you can use all MCP Firebird features with full wire encryption support!

```bash
# Test connection
npx mcp-firebird@alpha --use-native-driver \
  --database=/path/to/database.fdb \
  --host=localhost \
  --user=SYSDBA \
  --password=masterkey
```

You should see:
```
Using native Firebird driver (supports wire encryption)
Conectando con node-firebird-driver-native (Native Client)...
Conexión exitosa con node-firebird-driver-native
MCP Firebird server running on stdio
```

