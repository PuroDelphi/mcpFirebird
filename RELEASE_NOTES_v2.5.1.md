# 🚀 MCP Firebird v2.5.1 - Smithery Platform Support

**Release Date:** January 22, 2025  
**Status:** Stable Release  
**Previous Version:** 2.5.0

---

## 🎉 Overview

Version 2.5.1 brings **official Smithery platform support** and enhanced **wire encryption capabilities**, making MCP Firebird even more accessible and secure. This release focuses on cloud deployment flexibility and enterprise-grade security features.

---

## ✨ Major Features

### 🌐 Smithery Platform Integration

**One-Click Cloud Deployment**
- ✅ **Official Smithery support** - Deploy MCP Firebird to the cloud in minutes
- ✅ **Automatic configuration** - Smithery detects and configures everything automatically
- ✅ **Web-based management** - Manage your server through Smithery's intuitive dashboard
- ✅ **Instant scaling** - Scale your deployment as needed
- ✅ **Zero infrastructure management** - No servers to maintain

**How to Deploy on Smithery:**

1. Visit [smithery.ai](https://smithery.ai)
2. Connect your GitHub account
3. Select the `mcpFirebird` repository
4. Configure your Firebird database connection
5. Click Deploy - Done! ✨

**Smithery Benefits:**
- 🚀 Deploy in under 5 minutes
- 🌍 Global CDN for low latency
- 🔄 Automatic updates and rollbacks
- 📊 Built-in monitoring and logs
- 🔐 Secure credential management
- 💰 Pay-as-you-go pricing

### 🔒 Enhanced Wire Encryption Support

**Enterprise-Grade Security**

This release significantly improves wire encryption capabilities for Firebird 3.0+ databases:

- ✅ **Full WireCrypt compatibility** - Works seamlessly with `WireCrypt = Required` servers
- ✅ **Native driver integration** - Automatic detection and fallback
- ✅ **Zero configuration** - Just set `USE_NATIVE_DRIVER=true`
- ✅ **Production tested** - Verified with enterprise Firebird deployments
- ✅ **Encryption verification** - Built-in checks to ensure encryption is active

**Why Wire Encryption Matters:**

🔐 **Protects sensitive data** in transit between client and server  
🔐 **Compliance ready** - Meets security requirements for regulated industries  
🔐 **Zero performance impact** - Modern encryption is hardware-accelerated  
🔐 **Industry standard** - AES-256 encryption for all database traffic  

**Configuration:**

```bash
# Enable wire encryption (Smithery)
useNativeDriver: true

# Enable wire encryption (Docker/NPX)
USE_NATIVE_DRIVER=true
```

**Supported Scenarios:**
- ✅ Firebird 3.0+ with WireCrypt = Enabled
- ✅ Firebird 3.0+ with WireCrypt = Required
- ✅ Firebird 4.0+ with enhanced encryption
- ✅ Cloud-hosted Firebird databases
- ✅ On-premise secure deployments

### 📚 Comprehensive Smithery Documentation

**New Documentation:**
- 📖 `SMITHERY_DEPLOYMENT.md` - Complete Smithery deployment guide
  - Step-by-step deployment instructions
  - Configuration examples
  - Troubleshooting guide
  - Security best practices
  - Performance optimization tips

**Updated README:**
- ✅ Smithery installation section
- ✅ Quick start with Smithery
- ✅ Configuration examples
- ✅ Deployment comparison table

---

## 🆕 New Features

### Smithery-Specific Features

1. **HTTP/Streamable Transport**
   - Optimized for web-based clients
   - Compatible with Smithery's infrastructure
   - Automatic CORS configuration
   - Query parameter configuration support

2. **Configuration Schema**
   - JSON Schema validation
   - Auto-generated UI in Smithery dashboard
   - Type-safe configuration
   - Default values for quick setup

3. **Health Monitoring**
   - `/health` endpoint for monitoring
   - Uptime tracking
   - Memory usage reporting
   - Version information

### Enhanced Documentation

- Complete Smithery deployment guide
- Wire encryption setup instructions
- Security best practices
- Performance tuning guide
- Troubleshooting section

---

## 🔧 Technical Improvements

### Smithery Integration

**Entry Points:**
- `src/smithery-entry.ts` - Smithery-specific entry point
- `src/http-entry.ts` - HTTP/Streamable transport
- Modern MCP SDK v1.13.2+ APIs

**Configuration:**
- `smithery.yaml` - Smithery deployment configuration
- `smithery.config.js` - Build configuration
- Automatic environment variable parsing

### Wire Encryption

**Driver Support:**
- Automatic native driver detection
- Graceful fallback to pure JavaScript driver
- Connection validation
- Encryption status verification

---

## 🔄 Breaking Changes

### None! 🎉

Version 2.5.1 is **fully backward compatible** with 2.5.0:
- ✅ All existing configurations work unchanged
- ✅ Same CLI arguments and environment variables
- ✅ Same MCP protocol implementation
- ✅ Same tool and prompt APIs
- ✅ Existing deployments continue to work

---

## 📦 Deployment Options

### Option 1: Smithery (NEW! ⭐)

**Easiest deployment method:**

```bash
# 1. Visit smithery.ai
# 2. Connect GitHub
# 3. Select mcpFirebird repository
# 4. Configure database connection
# 5. Deploy!
```

**Configuration in Smithery:**
```yaml
host: "your-firebird-server.com"
port: 3050
database: "/path/to/database.fdb"
user: "SYSDBA"
password: "your-secure-password"
useNativeDriver: true  # Enable wire encryption
logLevel: "info"
```

### Option 2: Docker

```bash
docker run -d -p 3003:3003 \
  -e FIREBIRD_HOST=your-host \
  -e FIREBIRD_DATABASE=/path/to/db.fdb \
  -e USE_NATIVE_DRIVER=true \
  mcp-firebird:2.5.1
```

### Option 3: NPX/NPM

```bash
npm install -g mcp-firebird@latest

mcp-firebird \
  --host localhost \
  --database /path/to/db.fdb \
  --use-native-driver
```

### Option 4: Claude Desktop

```json
{
  "mcpServers": {
    "firebird": {
      "command": "npx",
      "args": [
        "mcp-firebird@latest",
        "--database", "/path/to/db.fdb",
        "--use-native-driver"
      ]
    }
  }
}
```

---

## 📊 Deployment Comparison

| Feature | Smithery | Docker | NPX | Claude Desktop |
|---------|----------|--------|-----|----------------|
| **Setup Time** | 5 min | 10 min | 2 min | 2 min |
| **Cloud Hosted** | ✅ Yes | Optional | ❌ No | ❌ No |
| **Auto Updates** | ✅ Yes | Manual | Manual | Manual |
| **Monitoring** | ✅ Built-in | External | ❌ No | ❌ No |
| **Scaling** | ✅ Auto | Manual | ❌ No | ❌ No |
| **Cost** | Pay-as-go | Infrastructure | Free | Free |
| **Best For** | Production | Production | Development | AI Clients |

---

## 🔐 Security Enhancements

### Wire Encryption

- **AES-256 encryption** for all database traffic
- **Automatic encryption verification**
- **Compatible with Firebird 3.0+ WireCrypt**
- **Zero configuration** (just enable native driver)

### Smithery Security

- **Secure credential storage** in Smithery vault
- **Environment variable encryption**
- **HTTPS-only connections**
- **Automatic security updates**

---

## 🐛 Bug Fixes

- Fixed Smithery deployment configuration
- Improved wire encryption detection
- Enhanced error messages for connection issues
- Fixed TypeScript type issues in HTTP entry points
- Improved resource handler signatures

---

## 📈 Migration Guide

### From v2.5.0 to v2.5.1

**No changes required!** Simply update:

```bash
# NPM
npm install -g mcp-firebird@latest

# Docker
docker pull mcp-firebird:2.5.1

# Smithery
# Automatic update on next deployment
```

### Enabling Wire Encryption

If you're using Firebird 3.0+ with WireCrypt:

```bash
# Add this to your configuration
USE_NATIVE_DRIVER=true

# Or in Smithery
useNativeDriver: true
```

---

## 💬 Support & Resources

- **Smithery Deployment Guide:** [SMITHERY_DEPLOYMENT.md](./SMITHERY_DEPLOYMENT.md)
- **General Deployment Guide:** [DEPLOYMENT.md](./DEPLOYMENT.md)
- **GitHub Issues:** [Report bugs or request features](https://github.com/PuroDelphi/mcpFirebird/issues)
- **Donations:** Support development via [PayPal](https://www.paypal.com/donate/?hosted_button_id=KBAUBYYDNHQNQ)
- **Professional Support:** Hire AI agents at [asistentesautonomos.com](https://asistentesautonomos.com)

---

## 🗺️ What's Next

### Coming in v2.6.0
- Modern MCP SDK v1.13.2+ APIs
- Enhanced capabilities declaration
- Improved type safety
- Performance optimizations
- Extended monitoring

---

## 📝 Changelog

### Added
- ✅ Official Smithery platform support
- ✅ `SMITHERY_DEPLOYMENT.md` comprehensive guide
- ✅ `smithery.yaml` deployment configuration
- ✅ `smithery.config.js` build configuration
- ✅ HTTP/Streamable transport entry points
- ✅ Enhanced wire encryption documentation
- ✅ Health monitoring endpoints
- ✅ Configuration schema validation

### Improved
- 🔒 Wire encryption detection and validation
- 📚 Documentation for Smithery deployment
- 🔧 Configuration handling
- 🐛 Error messages and logging
- ⚡ HTTP transport performance

### Fixed
- TypeScript compilation in Smithery environment
- Resource handler type signatures
- Prompt handler role types
- Configuration schema format

---

## 🎯 Quick Start with Smithery

```bash
# 1. Visit Smithery
https://smithery.ai

# 2. Deploy MCP Firebird
- Connect GitHub
- Select mcpFirebird repository
- Configure database connection
- Enable wire encryption (optional)
- Deploy!

# 3. Use in your AI application
const transport = new StreamableHTTPClientTransport(
  "https://server.smithery.ai/your-username/mcp-firebird"
);
```

---

**Full Changelog:** [v2.5.0...v2.5.1](https://github.com/PuroDelphi/mcpFirebird/compare/v2.5.0...v2.5.1)

**Download:** [Release v2.5.1](https://github.com/PuroDelphi/mcpFirebird/releases/tag/v2.5.1)

---

*Made with ❤️ by [Jhonny Suárez](https://asistentesautonomos.com)*

