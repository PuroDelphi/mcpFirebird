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
COPY run-all-stdio.js ./
COPY start-mcp-stdio.js ./

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

To use the MCP Inspector with the Dockerized server in SSE mode:

```bash
npx @modelcontextprotocol/inspector http://localhost:3003
```

For STDIO mode with the MCP Inspector, you can add a new service to your docker-compose.yml:

```yaml
  # MCP Inspector with STDIO transport
  mcp-inspector-stdio:
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      FIREBIRD_HOST: firebird-db
      FIREBIRD_PORT: 3050
      FIREBIRD_USER: SYSDBA
      FIREBIRD_PASSWORD: masterkey
      FIREBIRD_DATABASE: /firebird/data/database.fdb
    ports:
      - "6274:6274"
    depends_on:
      - firebird-db
    networks:
      - mcp-network
    command: node run-all-stdio.js
```

This will start both the MCP Inspector and the MCP Firebird server with the correct configuration.

## Using MCP Firebird Features in Docker

### Resources (Static/Semi-Static Data)

MCP Firebird provides 8 resources for accessing database metadata:

#### 1. Get Complete Database Schema

```bash
# Access the /schema resource
docker exec -i mcp-firebird-stdio node -e "
const client = require('./dist/index.js');
// The /schema resource provides complete database structure
"
```

**Available Resources:**
- `/tables` - List of all tables
- `/schema` - Complete database schema with all tables and relationships
- `/tables/{tableName}/schema` - Schema for a specific table
- `/tables/{tableName}/description` - Table description with field documentation
- `/tables/{tableName}/indexes` - All indexes for a table
- `/tables/{tableName}/constraints` - All constraints (PK, FK, UNIQUE, CHECK)
- `/tables/{tableName}/triggers` - All triggers on a table
- `/statistics` - Database statistics (row counts, table counts)

### Tools (Executable Actions)

MCP Firebird provides 18+ tools for database operations:

#### 1. Execute Queries

```bash
# Execute a SQL query
docker exec -i mcp-firebird-stdio node dist/cli.js execute-query \
  --query "SELECT * FROM EMPLOYEES WHERE SALARY > 50000"
```

#### 2. Analyze Query Performance

```bash
# Analyze query performance
docker exec -i mcp-firebird-stdio node dist/cli.js analyze-query-performance \
  --query "SELECT * FROM ORDERS WHERE ORDER_DATE > '2024-01-01'"
```

#### 3. Get Table Data with Filtering

```bash
# Get table data with WHERE clause and pagination
docker exec -i mcp-firebird-stdio node dist/cli.js get-table-data \
  --tableName "CUSTOMERS" \
  --whereClause "COUNTRY = 'USA'" \
  --orderBy "CUSTOMER_NAME" \
  --limit 100
```

#### 4. Analyze Table Statistics

```bash
# Get detailed statistics for a table
docker exec -i mcp-firebird-stdio node dist/cli.js analyze-table-statistics \
  --tableName "ORDERS"
```

#### 5. Analyze Missing Indexes

```bash
# Identify missing indexes for optimization
docker exec -i mcp-firebird-stdio node dist/cli.js analyze-missing-indexes \
  --tableName "ORDERS"
```

#### 6. Get Execution Plan

```bash
# Get query execution plan
docker exec -i mcp-firebird-stdio node dist/cli.js get-execution-plan \
  --query "SELECT o.*, c.CUSTOMER_NAME FROM ORDERS o JOIN CUSTOMERS c ON o.CUSTOMER_ID = c.ID"
```

#### 7. Batch Operations

```bash
# Execute multiple queries in parallel
docker exec -i mcp-firebird-stdio node dist/cli.js execute-batch-queries \
  --queries '["SELECT COUNT(*) FROM ORDERS", "SELECT COUNT(*) FROM CUSTOMERS"]'

# Describe multiple tables in parallel
docker exec -i mcp-firebird-stdio node dist/cli.js describe-batch-tables \
  --tableNames '["ORDERS", "CUSTOMERS", "PRODUCTS"]' \
  --maxConcurrent 5
```

#### 8. Database Management

```bash
# Backup database
docker exec -i mcp-firebird-stdio node dist/cli.js backup-database \
  --backupPath "/firebird/backups/database_backup.fbk"

# Restore database
docker exec -i mcp-firebird-stdio node dist/cli.js restore-database \
  --backupPath "/firebird/backups/database_backup.fbk" \
  --databasePath "/firebird/data/restored.fdb"

# Validate database
docker exec -i mcp-firebird-stdio node dist/cli.js validate-database
```

**Available Tools:**
- `execute-query` - Execute SQL queries
- `list-tables` - List all tables
- `describe-table` - Get table schema
- `describe-batch-tables` - Get multiple table schemas in parallel
- `get-field-descriptions` - Get field descriptions for a table
- `get-table-data` - Get table data with filtering and pagination
- `analyze-query-performance` - Analyze query performance
- `get-execution-plan` - Get query execution plan
- `analyze-missing-indexes` - Identify missing indexes
- `analyze-table-statistics` - Get table statistics
- `backup-database` - Backup database
- `restore-database` - Restore database
- `validate-database` - Validate database integrity
- `execute-batch-queries` - Execute multiple queries in parallel
- `get-database-info` - Get database configuration
- `verify-wire-encryption` - Verify wire encryption status

### Template Prompts (Guidance for LLMs)

MCP Firebird provides 5 template prompts that guide LLMs through complex tasks:

#### 1. Database Health Check

```javascript
// In your MCP client (e.g., Claude Desktop, web client)
const result = await client.getPrompt('database-health-check', {
  focusAreas: ['performance', 'security']
});

// The LLM will follow a structured guide to:
// - Analyze database structure using /schema resource
// - Check performance with analyze-query-performance tool
// - Review security with verify-wire-encryption tool
// - Generate comprehensive recommendations
```

#### 2. Query Optimization Guide

```javascript
const result = await client.getPrompt('query-optimization-guide', {
  queryType: 'select'
});

// The LLM will guide you through:
// - Performance analysis with analyze-query-performance
// - Execution plan review with get-execution-plan
// - Index analysis using /tables/{tableName}/indexes resource
// - Firebird-specific optimization tips
```

#### 3. Schema Design Review

```javascript
const result = await client.getPrompt('schema-design-review', {
  tableName: 'ORDERS'  // Optional: review specific table or entire schema
});

// The LLM will review:
// - Table structure and relationships
// - Normalization and denormalization
// - Index strategy using /tables/{tableName}/indexes
// - Constraint design using /tables/{tableName}/constraints
```

#### 4. Migration Planning

```javascript
const result = await client.getPrompt('migration-planning', {
  migrationType: 'schema-change',
  description: 'Add new customer loyalty program tables'
});

// The LLM will guide you through:
// - Current state analysis using /schema resource
// - Backup creation with backup-database tool
// - Migration steps and rollback plan
// - Validation with validate-database tool
```

#### 5. Security Audit

```javascript
const result = await client.getPrompt('security-audit');

// The LLM will perform:
// - Wire encryption verification
// - User permissions review
// - SQL injection vulnerability check
// - Security best practices assessment
```

**Available Prompts:**
- `database-health-check` - Comprehensive database health analysis
- `query-optimization-guide` - Step-by-step query optimization
- `schema-design-review` - Database schema design review
- `migration-planning` - Database migration planning
- `security-audit` - Security audit guide

## Complete Docker Example with New Features

Here's a complete example using Docker Compose with all new features:

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
      - firebird-backups:/firebird/backups
    ports:
      - "3050:3050"
    networks:
      - mcp-network

  # MCP Firebird server with all features
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
      LOG_LEVEL: info
    ports:
      - "3003:3003"
    volumes:
      - firebird-backups:/firebird/backups
    depends_on:
      - firebird-db
    networks:
      - mcp-network
    command: node run-sse-server.js

networks:
  mcp-network:
    driver: bridge

volumes:
  firebird-data:
  firebird-backups:
```

### Testing the New Features

```bash
# 1. Start services
docker compose up -d

# 2. Test resources (via MCP Inspector or client)
npx @modelcontextprotocol/inspector http://localhost:3003

# 3. In the inspector, try:
# - Access /schema resource to see complete database structure
# - Access /tables/{tableName}/indexes to see table indexes
# - Access /statistics to see database statistics

# 4. Test tools:
# - Use get-table-data to retrieve filtered data
# - Use analyze-query-performance to analyze a query
# - Use analyze-missing-indexes to find optimization opportunities

# 5. Test prompts:
# - Use database-health-check prompt for comprehensive analysis
# - Use query-optimization-guide for query optimization
# - Use migration-planning for migration planning
```

## Environment Variables Reference

All environment variables supported in Docker:

```bash
# Database Connection
FIREBIRD_HOST=localhost          # Firebird server host
FIREBIRD_PORT=3050              # Firebird server port
FIREBIRD_USER=SYSDBA            # Database user
FIREBIRD_PASSWORD=masterkey     # Database password
FIREBIRD_DATABASE=/path/to/db   # Database file path

# Transport Configuration
TRANSPORT_TYPE=stdio            # Transport type: stdio or sse
SSE_PORT=3003                   # Port for SSE transport

# Logging
LOG_LEVEL=info                  # Log level: debug, info, warn, error

# Security (Optional)
ENABLE_WIRE_ENCRYPTION=true     # Enable wire encryption (Firebird 3.0+)
```

## Best Practices for Docker Deployment

1. **Use volumes for data persistence:**
   ```yaml
   volumes:
     - firebird-data:/firebird/data
     - firebird-backups:/firebird/backups
   ```

2. **Enable wire encryption for production:**
   ```yaml
   environment:
     ENABLE_WIRE_ENCRYPTION: "true"
   ```

3. **Use health checks:**
   ```yaml
   healthcheck:
     test: ["CMD", "node", "-e", "require('./dist/index.js')"]
     interval: 30s
     timeout: 10s
     retries: 3
   ```

4. **Limit resources:**
   ```yaml
   deploy:
     resources:
       limits:
         cpus: '2'
         memory: 2G
   ```

5. **Use secrets for sensitive data:**
   ```yaml
   secrets:
     - firebird_password
   environment:
     FIREBIRD_PASSWORD_FILE: /run/secrets/firebird_password
   ```
