# MCP Firebird - Deployment Guide

This guide covers different deployment methods for the MCP Firebird server.

## 📋 Table of Contents

- [Smithery Deployment](#smithery-deployment)
- [Docker Deployment](#docker-deployment)
- [NPX/NPM Deployment](#npxnpm-deployment)
- [Configuration](#configuration)

---

## 🚀 Smithery Deployment

MCP Firebird is fully compatible with [Smithery](https://smithery.ai), a platform for deploying and managing MCP servers.

### Prerequisites

- A Smithery account
- Access to a Firebird database (can be remote)

### Deployment Steps

1. **Push your code to GitHub** (already done if you're reading this)

2. **Go to Smithery Dashboard**
   - Visit [smithery.ai](https://smithery.ai)
   - Connect your GitHub repository

3. **Configure the deployment**
   
   Smithery will automatically detect the `smithery.yaml` configuration file.
   
   You'll need to provide:
   - **Database Host**: IP or hostname of your Firebird server
   - **Database Port**: Usually `3050`
   - **Database Path**: Absolute path to your `.fdb` file
   - **User**: Database username (default: `SYSDBA`)
   - **Password**: Database password (default: `masterkey`)
   - **Use Native Driver**: `true` for wire encryption support
   - **Log Level**: `info`, `debug`, `warn`, or `error`

4. **Deploy**
   
   Smithery will:
   - Build a Docker container from the `Dockerfile`
   - Deploy it to their infrastructure
   - Provide you with an HTTPS endpoint

### Example Configuration

```yaml
host: "192.168.1.100"
port: 3050
database: "/var/firebird/data/MYDB.FDB"
user: "SYSDBA"
password: "your-secure-password"
useNativeDriver: false
logLevel: "info"
```

### Accessing Your Deployment

Once deployed, you'll get a URL like:
```
https://server.smithery.ai/[your-username]/mcp-firebird
```

You can connect to it using any MCP client with the Streamable HTTP transport.

---

## 🐳 Docker Deployment

You can deploy MCP Firebird using Docker on any platform that supports containers.

### Prerequisites

- Docker installed
- Access to a Firebird database

### Build the Image

```bash
docker build -t mcp-firebird .
```

### Run the Container

#### Basic Run

```bash
docker run -d \
  -p 3003:3003 \
  -e FIREBIRD_HOST=your-db-host \
  -e FIREBIRD_PORT=3050 \
  -e FIREBIRD_DATABASE=/path/to/database.fdb \
  -e FIREBIRD_USER=SYSDBA \
  -e FIREBIRD_PASSWORD=masterkey \
  --name mcp-firebird \
  mcp-firebird
```

#### With Wire Encryption Support

```bash
docker run -d \
  -p 3003:3003 \
  -e FIREBIRD_HOST=your-db-host \
  -e FIREBIRD_PORT=3050 \
  -e FIREBIRD_DATABASE=/path/to/database.fdb \
  -e FIREBIRD_USER=SYSDBA \
  -e FIREBIRD_PASSWORD=masterkey \
  -e USE_NATIVE_DRIVER=true \
  --name mcp-firebird \
  mcp-firebird
```

#### With Custom Port

```bash
docker run -d \
  -p 8080:3003 \
  -e PORT=3003 \
  -e FIREBIRD_HOST=your-db-host \
  -e FIREBIRD_DATABASE=/path/to/database.fdb \
  --name mcp-firebird \
  mcp-firebird
```

### Docker Compose

Create a `docker-compose.yml`:

```yaml
version: '3.8'

services:
  mcp-firebird:
    build: .
    ports:
      - "3003:3003"
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=info
      - TRANSPORT_TYPE=http
      - FIREBIRD_HOST=your-db-host
      - FIREBIRD_PORT=3050
      - FIREBIRD_DATABASE=/path/to/database.fdb
      - FIREBIRD_USER=SYSDBA
      - FIREBIRD_PASSWORD=masterkey
      - USE_NATIVE_DRIVER=false
    restart: unless-stopped
```

Run with:
```bash
docker-compose up -d
```

### Deployment Platforms

This Docker image works with:

- **Railway**: Connect GitHub repo, Railway auto-detects Dockerfile
- **Render**: Create new Web Service, select Docker runtime
- **Fly.io**: Use `fly launch` and `fly deploy`
- **Google Cloud Run**: `gcloud run deploy`
- **AWS ECS/Fargate**: Push to ECR and create service
- **Azure Container Instances**: Deploy from ACR
- **DigitalOcean App Platform**: Connect repo with Dockerfile

---

## 📦 NPX/NPM Deployment

For local development or server deployment without Docker.

### Global Installation

```bash
npm install -g mcp-firebird@alpha
```

### Run with STDIO (for Claude Desktop)

```bash
mcp-firebird \
  --host localhost \
  --port 3050 \
  --database /path/to/database.fdb \
  --user SYSDBA \
  --password masterkey
```

### Run with HTTP/SSE (for web clients)

```bash
SSE_PORT=3003 TRANSPORT_TYPE=http mcp-firebird \
  --host localhost \
  --database /path/to/database.fdb
```

### With Wire Encryption

```bash
# Install native driver globally
npm install -g node-firebird-driver-native

# Run with native driver
mcp-firebird \
  --host localhost \
  --database /path/to/database.fdb \
  --use-native-driver
```

---

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `FIREBIRD_HOST` | Database server hostname/IP | `localhost` |
| `FIREBIRD_PORT` | Database server port | `3050` |
| `FIREBIRD_DATABASE` | Path to .fdb file | Required |
| `FIREBIRD_USER` | Database username | `SYSDBA` |
| `FIREBIRD_PASSWORD` | Database password | `masterkey` |
| `USE_NATIVE_DRIVER` | Enable native driver for wire encryption | `false` |
| `LOG_LEVEL` | Logging level (debug/info/warn/error) | `info` |
| `TRANSPORT_TYPE` | Transport protocol (stdio/http) | `stdio` |
| `SSE_PORT` | HTTP server port | `3003` |
| `PORT` | Alternative port variable (Smithery uses this) | `3003` |

### Command Line Arguments

All environment variables can also be passed as CLI arguments:

```bash
mcp-firebird \
  --host localhost \
  --port 3050 \
  --database /path/to/db.fdb \
  --user SYSDBA \
  --password secret \
  --use-native-driver \
  --log-level debug
```

### Configuration Priority

1. Command line arguments (highest priority)
2. Environment variables
3. Default values (lowest priority)

---

## 🔒 Security Considerations

### For Production Deployments

1. **Never use default passwords** - Change `SYSDBA/masterkey`
2. **Use environment variables** - Don't hardcode credentials
3. **Enable wire encryption** - Use `USE_NATIVE_DRIVER=true` with Firebird 3.0+
4. **Use HTTPS** - Smithery provides this automatically
5. **Restrict database access** - Configure Firebird firewall rules
6. **Use secrets management** - For Docker/K8s deployments

### Wire Encryption Setup

For databases with `WireCrypt = Required`:

1. **Server-side** (Firebird server):
   ```
   # firebird.conf
   WireCrypt = Required
   ```

2. **Client-side** (MCP Firebird):
   ```bash
   USE_NATIVE_DRIVER=true
   ```

---

## 🆘 Troubleshooting

### Smithery Deployment Issues

**Problem**: Build fails with "Missing dependencies"
- **Solution**: Check that `package-lock.json` is committed to Git

**Problem**: Container starts but can't connect to database
- **Solution**: Verify database host is accessible from Smithery's network

### Docker Deployment Issues

**Problem**: `fbclient.dll` not found
- **Solution**: The Dockerfile installs `firebird3.0-utils` which includes the client library

**Problem**: Permission denied errors
- **Solution**: Check that the database file path is accessible

### NPX Deployment Issues

**Problem**: Native driver not loading
- **Solution**: Install globally: `npm install -g node-firebird-driver-native`

**Problem**: Wire encryption fails
- **Solution**: Ensure you have the correct architecture (x64) of fbclient.dll

---

## 📚 Additional Resources

- [Main README](./README.md)
- [Smithery Documentation](https://smithery.ai/docs)
- [Docker Documentation](https://docs.docker.com)
- [Firebird Documentation](https://firebirdsql.org/en/documentation/)

---

## 💬 Support

- **GitHub Issues**: [Report bugs or request features](https://github.com/PuroDelphi/mcpFirebird/issues)
- **Donations**: Support development via [PayPal](https://www.paypal.com/donate/?hosted_button_id=KBAUBYYDNHQNQ)
- **Professional Support**: Hire AI agents at [asistentesautonomos.com](https://asistentesautonomos.com)

