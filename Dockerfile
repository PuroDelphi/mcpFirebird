# Multi-stage Dockerfile for MCP Firebird
# Stage 1: Build stage
FROM node:20-slim AS builder

# Install build dependencies
WORKDIR /app

# Copy package files first (for better caching)
COPY package*.json ./
COPY tsconfig.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci --include=dev

# Copy source code
COPY src/ ./src/

# Build TypeScript project with optimizations
ENV NODE_ENV=production
RUN npm run build && \
    chmod +x dist/cli.js

# Stage 2: Production stage
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

# Install ONLY production dependencies
RUN npm ci --omit=dev

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist

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

# Start the MCP server in HTTP mode
# Smithery will pass configuration via query parameters to /mcp endpoint
# The PORT environment variable will be set by Smithery (default: 3003)
CMD ["node", "dist/http-entry.js"]
