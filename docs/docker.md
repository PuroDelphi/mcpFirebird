# Docker Configuration for MCP Firebird (2.7+)

This document describes how to run the modern MCP Firebird server in a Docker container using the Unified Architecture (HTTP Streamable / SSE).

## Dockerfile

You can run the MCP Firebird server in a Docker container using the recommended HTTP Streamable (SSE) transport.

```dockerfile
# Use Node.js LTS with Debian as base image
FROM node:20-slim

# Install Firebird client tools
RUN apt-get update && \
    apt-get install -y --no-install-recommends firebird3.0-utils firebird3.0-client && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create working directory
WORKDIR /app

# Copy configuration files and dependencies
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY src/ ./src/

# Compile the TypeScript project
RUN npm run build

# Expose port for SSE
EXPOSE 3003

# Default environment variables
ENV FIREBIRD_HOST=localhost
ENV FIREBIRD_PORT=3050
ENV FIREBIRD_USER=SYSDBA
ENV FIREBIRD_PASSWORD=masterkey
ENV FIREBIRD_DATABASE=/firebird/data/database.fdb
ENV TRANSPORT_TYPE=sse
ENV SSE_PORT=3003
ENV LOG_LEVEL=info
# Add EMA protection by default (Change this in production!)
ENV FIREBIRD_API_KEY=change_me_123

# Create directory for the database
RUN mkdir -p /firebird/data && \
    chown -R node:node /firebird

# Switch to node user for security
USER node

# Command to start the modern unified server
CMD ["node", "dist/cli.js"]
```

## Docker Compose

Here is a modern Docker Compose setup for MCP Firebird 2.7+. This uses the unified server in SSE mode and protects it with an API Key (EMA).

```yaml
version: '3.8'

services:
  # Firebird database server
  firebird-db:
    image: jacobalberty/firebird:3.0
    environment:
      ISC_PASSWORD: masterkey
      FIREBIRD_DATABASE: database.fdb
      FIREBIRD_USER: SYSDBA
    volumes:
      - firebird-data:/firebird/data
    ports:
      - "3050:3050"
    networks:
      - mcp-network

  # MCP Firebird server (Unified Architecture, SSE)
  mcp-firebird:
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      FIREBIRD_HOST: firebird-db
      FIREBIRD_PORT: 3050
      FIREBIRD_USER: SYSDBA
      FIREBIRD_PASSWORD: masterkey
      FIREBIRD_DATABASE: /firebird/data/database.fdb
      TRANSPORT_TYPE: sse
      SSE_PORT: 3003
      # Secure the server with an API key
      FIREBIRD_API_KEY: my_super_secret_api_key
    ports:
      - "3003:3003"
    depends_on:
      - firebird-db
    networks:
      - mcp-network
    command: node dist/cli.js

networks:
  mcp-network:
    driver: bridge

volumes:
  firebird-data:
```

## Running with Docker

```bash
# Build and run with Docker Compose
docker compose up -d

# Check logs
docker compose logs -f mcp-firebird

# Stop services
docker compose down
```

## Connecting to the Dockerized MCP Server

To connect from a web client, n8n, or Claude Desktop (via an HTTP transport), use the SSE server URL along with the Bearer token for authorization.

```javascript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const transport = new StreamableHTTPClientTransport(
    new URL("http://localhost:3003/mcp"),
    {
        headers: {
            "Authorization": "Bearer my_super_secret_api_key"
        }
    }
);

const client = new Client({ name: "my-client", version: "1.0.0" }, { capabilities: {} });
await client.connect(transport);
```

## Using MCP Firebird Features in Docker

You can use the MCP Inspector to test the Dockerized server:

```bash
npx @modelcontextprotocol/inspector http://localhost:3003
```
*(Note: If the inspector does not support custom Authorization headers natively, you may need to temporarily disable `FIREBIRD_API_KEY` to test with it).*

### Proactive Events (`POST_EVENT`)

If your database uses triggers that run `POST_EVENT`, the Docker container must be able to use the `node-firebird-driver-native` to intercept them.
Make sure you build the image with the necessary C++ build tools if you want to explicitly compile the native driver, or rely on the pre-built binaries downloaded via npm during the Docker build.

## Environment Variables Reference

All environment variables supported in Docker:

```bash
# Database Connection
FIREBIRD_HOST=localhost          # Firebird server host
FIREBIRD_PORT=3050               # Firebird server port
FIREBIRD_USER=SYSDBA             # Database user
FIREBIRD_PASSWORD=masterkey      # Database password
FIREBIRD_DATABASE=/path/to/db    # Database file path

# Transport Configuration
TRANSPORT_TYPE=sse               # Recommended: sse (HTTP Streamable)
SSE_PORT=3003                    # Port for SSE transport

# Security (EMA)
FIREBIRD_API_KEY=token           # API Key for Enterprise Managed Authorization

# Logging
LOG_LEVEL=info                   # Log level: debug, info, warn, error
```
