# Docker Configuration for MCP Firebird

This document describes how to run MCP Firebird in a Docker container.

## Dockerfile

You can run the MCP Firebird server in a Docker container with support for STDIO and SSE transports:

```dockerfile
# Use Node.js LTS with Debian as base image
FROM node:20-slim

# Install Firebird client tools for backup/restore operations
RUN apt-get update && \
    apt-get install -y --no-install-recommends firebird3.0-utils && \
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
COPY run-sse-server.js ./
COPY run-sse-proxy.js ./
COPY run-inspector.cjs ./
COPY run-inspector.js ./

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
ENV TRANSPORT_TYPE=stdio
ENV SSE_PORT=3003
ENV LOG_LEVEL=info

# Create directory for the database
RUN mkdir -p /firebird/data && \
    chown -R node:node /firebird

# Switch to node user for security
USER node

# Command to start the server (can be overridden in docker-compose)
CMD ["node", "dist/index.js"]
```

## Docker Compose

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

  # MCP Firebird server with STDIO transport (for Claude Desktop)
  mcp-firebird-stdio:
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      FIREBIRD_HOST: firebird-db
      FIREBIRD_PORT: 3050
      FIREBIRD_USER: SYSDBA
      FIREBIRD_PASSWORD: masterkey
      FIREBIRD_DATABASE: /firebird/data/database.fdb
      TRANSPORT_TYPE: stdio
    depends_on:
      - firebird-db
    networks:
      - mcp-network
    # For use with Claude Desktop, expose STDIO
    stdin_open: true
    tty: true

  # MCP Firebird server with SSE transport (for web clients)
  mcp-firebird-sse:
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
    ports:
      - "3003:3003"
    depends_on:
      - firebird-db
    networks:
      - mcp-network
    command: node run-sse-server.js

  # SSE Proxy (optional, for clients that need proxy support)
  mcp-sse-proxy:
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      MCP_SERVER_URL: http://mcp-firebird-sse:3003
      PORT: 3005
    ports:
      - "3005:3005"
    depends_on:
      - mcp-firebird-sse
    networks:
      - mcp-network
    command: node run-sse-proxy.js

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

# Run only the STDIO version (for Claude Desktop)
docker compose up -d mcp-firebird-stdio

# Run only the SSE version (for web clients)
docker compose up -d mcp-firebird-sse

# Run the SSE version with proxy (for clients that need proxy support)
docker compose up -d mcp-firebird-sse mcp-sse-proxy

# Check logs
docker compose logs -f mcp-firebird-sse

# Stop services
docker compose down
```

## Connecting to the Dockerized MCP Server

### With Claude Desktop

Update your Claude Desktop configuration to use the Docker container:

```json
{
  "mcpServers": {
    "mcp-firebird": {
      "command": "docker",
      "args": ["exec", "-i", "mcp-firebird-stdio", "node", "dist/index.js"],
      "type": "stdio"
    }
  }
}
```

### With Web Clients

To connect from a web client, use the SSE server URL:

```javascript
const eventSource = new EventSource('http://localhost:3003');
```

### With MCP Inspector

To use the MCP Inspector with the Dockerized server:

```bash
npx @modelcontextprotocol/inspector http://localhost:3003
```
