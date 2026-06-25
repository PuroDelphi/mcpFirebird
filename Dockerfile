# Multi-stage Dockerfile for MCP Firebird
# Stage 1: Build stage
FROM node:20-slim AS builder

# Install build dependencies for the native driver
RUN apt-get update && \
    apt-get install -y --no-install-recommends build-essential python3 firebird-dev && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first (for better caching)
COPY package*.json ./
COPY tsconfig.json ./
COPY tsconfig.build.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Install the native driver explicitly to ensure compilation in builder
RUN npm install node-firebird-driver-native

# Copy source code
COPY src/ ./src/

# Build TypeScript project with optimizations
ENV NODE_ENV=production
RUN npm run build && \
    chmod +x dist/cli.js

# Stage 2: Production stage
FROM node:20-slim

# Install Firebird client tools and dependencies for the native driver to run
RUN apt-get update && \
    apt-get install -y --no-install-recommends firebird3.0-utils firebird3.0-client && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# We copy the compiled node_modules from builder so we get the native driver 
# without needing build tools in the production image.
COPY --from=builder /app/node_modules ./node_modules

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist

# Expose port
EXPOSE 3003

# Default environment variables for Streamable HTTP (Recommended)
ENV NODE_ENV=production
ENV LOG_LEVEL=info
ENV TRANSPORT_TYPE=http
ENV HTTP_PORT=3003

# Firebird connection defaults
ENV FIREBIRD_HOST=localhost
ENV FIREBIRD_PORT=3050
ENV FIREBIRD_USER=SYSDBA
ENV FIREBIRD_PASSWORD=masterkey
ENV FIREBIRD_DATABASE=/firebird/data/database.fdb
ENV FIREBIRD_API_KEY=""

# Create directory for database files
RUN mkdir -p /firebird/data && \
    chown -R node:node /firebird

# Switch to node user for security
USER node

# Start the MCP server using the unified CLI with native driver by default
CMD ["node", "dist/cli.js", "--use-native-driver"]
