# Smithery-compatible Dockerfile for MCP Firebird
# Uses Node.js LTS with Debian as base image
FROM node:20-slim

# Install Firebird client tools
RUN apt-get update && \
    apt-get install -y --no-install-recommends firebird3.0-utils && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY src/ ./src/

# Build TypeScript project
RUN npm run build

# Expose port (Smithery will set PORT environment variable)
EXPOSE 3003

# Default environment variables
# These can be overridden by Smithery configuration
ENV NODE_ENV=production
ENV LOG_LEVEL=info
ENV TRANSPORT_TYPE=http

# Firebird connection defaults (will be overridden by query parameters)
ENV FIREBIRD_HOST=localhost
ENV FIREBIRD_PORT=3050
ENV FIREBIRD_USER=SYSDBA
ENV FIREBIRD_PASSWORD=masterkey
ENV FIREBIRD_DATABASE=/firebird/data/database.fdb

# Create directory for database files
RUN mkdir -p /firebird/data && \
    chown -R node:node /firebird

# Switch to node user for security
USER node

# Start the MCP server
# Smithery will pass configuration via query parameters to /mcp endpoint
# The PORT environment variable will be set by Smithery
CMD ["sh", "-c", "SSE_PORT=${PORT:-3003} node dist/index.js"]
