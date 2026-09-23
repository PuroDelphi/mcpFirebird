# Security in MCP Firebird

[Español](security.es.md)

This document describes security considerations and configuration options for MCP Firebird, including detailed examples of its security features.

## General considerations

### Loading a configuration file

Starting with `2.10.0-alpha.2`, all entry points resolve the configuration file in this order of precedence:

1. An explicit path passed programmatically to `initSecurity(path)` or `loadSecurityConfig(path)`.
2. `--security-config <path>` when using the CLI (sets `FIREBIRD_SECURITY_CONFIG`).
3. The `FIREBIRD_SECURITY_CONFIG` environment variable.
4. The `SECURITY_CONFIG` environment variable.
5. The `SECURITY_CONFIG_PATH` environment variable, retained for compatibility with `.env.example`.
6. Starting with `2.11.0-alpha.1`, `FIREBIRD_SECURITY_JSON` when no file path is specified.

Example `security-config.json`:

```json
{
  "security": {
    "allowedTables": ["EMPLOYEES", "DEPARTMENTS"],
    "allowedOperations": ["SELECT"],
    "maxRows": 100
  }
}
```

Starting through the CLI:

```bash
npx -y mcp-firebird@alpha --security-config /absolute/path/security-config.json
```

You can also set `FIREBIRD_SECURITY_CONFIG` in the server environment, in `.env`, or in your MCP client's `env` object. Keep your usual Firebird connection settings. Restart the server after changing the configuration.

JSON and CommonJS modules (`.cjs`, or `.js` in a CommonJS context) that export an object with a `security` property are supported. CommonJS modules execute code: use only trusted files. Absolute paths are recommended; relative paths are resolved from the process's working directory.

The log should show `Loaded security configuration from ...`. If no configuration source is specified, defaults are used. For compatibility, if a file does not exist, cannot be loaded, or fails validation, the problem is logged and defaults are used; check the successful-load message before assuming your policy has been applied.

<a id="configuración-json-sin-archivos"></a>

### Inline JSON configuration

Starting with `2.11.0-alpha.1`, you can provide the complete JSON object through `FIREBIRD_SECURITY_JSON` in the process environment. Example for your MCP client's `env` object:

```json
{
  "FIREBIRD_SECURITY_JSON": "{\"security\":{\"allowedTables\":[\"EMPLOYEES\",\"DEPARTMENTS\"],\"allowedOperations\":[\"SELECT\"],\"maxRows\":100}}"
}
```

In PowerShell:

```powershell
$env:FIREBIRD_SECURITY_JSON = '{"security":{"allowedTables":["EMPLOYEES"],"allowedOperations":["SELECT"],"maxRows":100}}'
npx -y mcp-firebird@alpha
```

Keep your usual connection settings. File paths supplied through the CLI, API, or environment variables take precedence; remove those settings to select inline JSON. The two sources are not merged. Fields omitted from a valid policy retain their default behavior. The object `{"security":{}}` explicitly selects the defaults.

The JSON must contain the `security` property and satisfy the configuration schema. Unknown keys at the root and directly inside `security` are rejected. The limit is **64 KiB in UTF-8**, also subject to the operating system's environment-variable limits. If the selected JSON source is empty, malformed, invalid, or oversized, initialization is rejected; the server does not silently continue with defaults. To disable this option, unset the variable instead of leaving it empty.

Restart the server after changing it and check for `Loaded security configuration from FIREBIRD_SECURITY_JSON`. The JSON contents are not included in the loader's logs or validation errors.

Only the administrator or trusted application launching the MCP process should set this variable. Remote HTTP/SSE clients cannot change it through requests. If you use `appsettings.json`, your application must read it, serialize the policy, and pass it as an environment variable when creating the process; the MCP does not read `appsettings.json` automatically. Protect any included secrets like other deployment credentials.

MCP Firebird provides access to Firebird databases, which involves security risks. Consider these recommendations:

1. **Least privilege**: Use a database user with only the permissions required.
2. **Isolation**: Run MCP Firebird in an isolated environment, such as a Docker container.
3. **Firewall**: Restrict access to the ports used by MCP Firebird.
4. **HTTPS**: Use HTTPS for SSE connections in production.
5. **Input validation**: MCP Firebird validates SQL queries to prevent injection; client-side validation is also good practice.

## Implemented security capabilities

MCP Firebird includes the following security capabilities:

- **Table restrictions**: Limit which tables are accessible
- **SQL operation restrictions**: Control which SQL operations are allowed
- **Sensitive data masking**: Hide confidential information in results
- **Row filtering**: Apply conditions to limit which records are visible
- **Resource limits**: Prevent queries from consuming excessive resources
- **Authorization integration**: Support OAuth2 and role-to-permission mappings
- **Enterprise-Managed Authorization (EMA)**: Protect HTTP/SSE network connections with Bearer tokens.
- **Auditing**: Record operations for security purposes.

## Enterprise-Managed Authorization (EMA)

For network deployments (Streamable HTTP / SSE), transport-level access control is critical. MCP Firebird supports EMA (Enterprise-Managed Authorization) using static API keys.

**Server configuration:**
```bash
export FIREBIRD_API_KEY=my_secret_token_123
# Or using a command-line argument:
npx -y mcp-firebird --transport-type sse --api-key my_secret_token_123 ...
```

**Client connection:**
Clients must send this token in an `Authorization: Bearer` header.
```typescript
const transport = new StreamableHTTPClientTransport(
    new URL("http://localhost:3003/mcp"),
    { headers: { "Authorization": "Bearer my_secret_token_123" } }
);
```

## CORS configuration

CORS only affects clients running inside a browser. STDIO clients, Claude Desktop, n8n, and other server-side clients do not depend on CORS.

For compatibility, the default allows any origin (`*`) and supports the `Authorization` header. Browser credentials (cookies or automatic HTTP authentication) remain disabled because browsers do not allow credentials with a wildcard origin.

To restrict access to one or more websites:

```bash
# A single origin
export MCP_ALLOWED_ORIGIN="https://app.example.com"

# Multiple comma-separated origins
export MCP_ALLOWED_ORIGIN="https://app.example.com,https://admin.example.com"
```

In Windows PowerShell:

```powershell
$env:MCP_ALLOWED_ORIGIN="https://app.example.com,https://admin.example.com"
```

Clients must send the key using `Authorization: Bearer <token>`, not as a cookie or URL parameter.

## SQL write queries

Query tools allow `SELECT` and authorized procedures by default. Direct SQL writes and DDL operations (`INSERT`, `UPDATE`, `DELETE`, `CREATE`, etc.) are disabled to reduce the risk of untrusted content inducing the LLM to modify the database.

In a controlled deployment that requires direct writes:

```bash
export ALLOW_RAW_SQL=true
```

In Windows PowerShell:

```powershell
$env:ALLOW_RAW_SQL="true"
```

Enable this option only with a least-privilege Firebird user. The `get-table-data` tool does not accept free-form SQL clauses: use structured `filters` and `orderBy` entries to parameterize values and validate column names.

Example:

```json
{
  "tableName": "CUSTOMERS",
  "first": 100,
  "filters": [
    { "column": "ACTIVE", "operator": "eq", "value": 1 },
    { "column": "NAME", "operator": "like", "value": "A%" }
  ],
  "orderBy": [
    { "column": "NAME", "direction": "ASC" }
  ]
}
```

Available operators: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `like`, `in`, `isNull`, and `isNotNull`.

## Restricting access to tables and views

You can restrict which tables and views are available to the MCP server using inclusion and exclusion filters:

```javascript
// In your custom configuration (config.js)
module.exports = {
  // Basic configuration...

  security: {
    // Only allow access to these tables
    allowedTables: [
      'CUSTOMERS',
      'PRODUCTS',
      'ORDERS',
      'ORDER_ITEMS'
    ],

    // Explicitly exclude these tables (takes precedence over allowedTables)
    forbiddenTables: [
      'USERS',
      'USER_CREDENTIALS',
      'AUDIT_LOG'
    ],

    // Name pattern filter (regular expression)
    tableNamePattern: '^(?!TMP_|TEMP_|BAK_).*$'  // Exclude temporary/backup tables
  }
};
```

To use this configuration:

```bash
npx -y mcp-firebird --config ./config.js
```

## Restricting SQL operations

You can restrict which SQL operations are allowed:

```javascript
// In your custom configuration
module.exports = {
  // Basic configuration...

  security: {
    // Allowed SQL operations
    allowedOperations: ['SELECT', 'EXECUTE'],  // Queries and stored procedures only

    // Specifically block these operations
    forbiddenOperations: ['DROP', 'TRUNCATE', 'ALTER', 'GRANT', 'REVOKE'],

    // Maximum number of rows a query can return
    maxRows: 1000,

    // Maximum query execution time (in ms)
    queryTimeout: 5000
  }
};
```

## Masking sensitive data

You can configure rules to mask or filter sensitive data:

```javascript
module.exports = {
  // Basic configuration...

  security: {
    dataMasking: [
      {
        // Mask specific columns
        columns: ['CREDIT_CARD_NUMBER', 'SSN', 'PASSWORD'],
        pattern: /^.*/,
        replacement: '************'
      },
      {
        // Partially mask email addresses
        columns: ['EMAIL'],
        pattern: /^(.{3})(.*)(@.*)$/,
        replacement: '$1***$3'
      }
    ],

    // Row filters to exclude sensitive data
    rowFilters: {
      'CUSTOMERS': 'GDPR_CONSENT = 1',  // Only show customers with GDPR consent
      'EMPLOYEES': 'IS_PUBLIC_PROFILE = 1'  // Public employee profiles only
    }
  }
};
```

## Data volume limits

Configure limits to prevent queries from consuming excessive resources:

```javascript
module.exports = {
  // Basic configuration...

  security: {
    resourceLimits: {
      // Row limit per query
      maxRowsPerQuery: 5000,

      // Result size limit (in bytes)
      maxResponseSize: 1024 * 1024 * 5,  // 5 MB

      // CPU time limit per query (ms)
      maxQueryCpuTime: 10000,

      // Query limit per session
      maxQueriesPerSession: 100,

      // Rate limiting (queries per minute)
      rateLimit: {
        queriesPerMinute: 60,
        burstLimit: 20
      }
    }
  }
};
```

## Integrating external authorization systems

MCP Firebird can integrate with external authorization systems for more granular access control:

```javascript
module.exports = {
  // Basic configuration...

  security: {
    authorization: {
      // Use an external authorization service
      type: 'oauth2',

      // OAuth2 configuration
      oauth2: {
        tokenVerifyUrl: 'https://auth.example.com/verify',
        clientId: 'mcp-firebird-client',
        clientSecret: process.env.OAUTH_CLIENT_SECRET,
        scope: 'database:read'
      },

      // Role-to-permission mapping
      rolePermissions: {
        'analyst': {
          tables: ['SALES', 'PRODUCTS', 'CUSTOMERS'],
          operations: ['SELECT']
        },
        'manager': {
          tables: ['SALES', 'PRODUCTS', 'CUSTOMERS', 'EMPLOYEES'],
          operations: ['SELECT', 'INSERT', 'UPDATE']
        },
        'admin': {
          allTablesAllowed: true,
          operations: ['SELECT', 'INSERT', 'UPDATE', 'DELETE']
        }
      }
    }
  }
};
```

## Practical security examples

### Example 1: MCP server for sales analysis

```javascript
// config-sales-analysis.js
module.exports = {
  database: process.env.FIREBIRD_DATABASE,
  user: process.env.FIREBIRD_USER,
  password: process.env.FIREBIRD_PASSWORD,

  security: {
    // Access limited to sales tables
    allowedTables: [
      'SALES', 'PRODUCTS', 'CUSTOMERS', 'REGIONS',
      'SALES_TARGETS', 'PRODUCT_CATEGORIES'
    ],

    // Only allow SELECT queries
    allowedOperations: ['SELECT'],

    // Mask sensitive customer data
    dataMasking: [
      {
        columns: ['CUSTOMER_EMAIL', 'CUSTOMER_PHONE'],
        pattern: /^.*/,
        replacement: '[REDACTED]'
      }
    ],

    // Resource limits
    resourceLimits: {
      maxRowsPerQuery: 10000,
      maxQueryCpuTime: 5000
    }
  }
};
```

### Example 2: MCP server for inventory management

```javascript
// config-inventory.js
module.exports = {
  database: process.env.FIREBIRD_DATABASE,
  user: process.env.FIREBIRD_USER,
  password: process.env.FIREBIRD_PASSWORD,

  security: {
    // Access to inventory tables
    allowedTables: [
      'INVENTORY', 'PRODUCTS', 'WAREHOUSES',
      'STOCK_MOVEMENTS', 'SUPPLIERS'
    ],

    // Allow limited read and write operations
    allowedOperations: ['SELECT', 'INSERT', 'UPDATE'],

    // Prevent modification of historical records
    rowFilters: {
      'STOCK_MOVEMENTS': 'MOVEMENT_DATE > DATEADD(-30 DAY TO CURRENT_DATE)'
    },

    // Full auditing
    audit: {
      enabled: true,
      destination: 'both',
      auditFile: 'C:\\logs\\inventory-audit.log',
      auditTable: 'MCP_INVENTORY_AUDIT',
      detailLevel: 'full'
    }
  }
};
```

### Example 3: Development and testing configuration

```javascript
// config-development.js
module.exports = {
  database: process.env.FIREBIRD_DATABASE_DEV,
  user: process.env.FIREBIRD_USER_DEV,
  password: process.env.FIREBIRD_PASSWORD_DEV,

  security: {
    // Allow more operations during development
    allowedOperations: ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE'],

    // Only exclude critical tables
    forbiddenTables: ['SYSTEM_CONFIG', 'APP_SECRETS'],

    // Limit the impact of expensive queries
    resourceLimits: {
      maxRowsPerQuery: 1000,
      maxQueryCpuTime: 3000,
      queriesPerMinute: 120
    },

    // Basic auditing
    audit: {
      enabled: true,
      destination: 'file',
      auditFile: './logs/dev-audit.log',
      detailLevel: 'basic'
    }
  }
};
```

## SQL security options

MCP Firebird provides additional options to control SQL query security:

```json
{
  "sql": {
    "allowSystemTables": false,
    "allowedSystemTables": ["RDB$PROCEDURES", "RDB$PROCEDURE_PARAMETERS"],
    "allowDDL": false,
    "allowUnsafeQueries": false
  }
}
```

To use this configuration with Claude Desktop:

```json
"mcp-firebird": {
    "args": [
        "mcp-firebird",
        "--database",
        "F:\\Proyectos\\SAI\\EMPLOYEE.FDB",
        "--user",
        "SYSDBA",
        "--password",
        "masterkey",
        "--host",
        "localhost",
        "--port",
        "3050",
        "--security-config",
        "C:\\path\\to\\your\\security-config.json"
    ],
    "command": "npx",
    "type": "stdio"
}
```

## SQL query validation

MCP Firebird includes SQL query validation to prevent SQL injection. Validation takes place before executing a query.

```javascript
// SQL query validation example
const isSafe = validateSql("SELECT * FROM EMPLOYEES WHERE ID = ?");
```

## Data masking implementation

Data masking is implemented at the application level by applying transformation rules to query results before returning them to the client:

```typescript
// Example data masking implementation
function maskSensitiveData(results: any[]): any[] {
    if (!securityConfig.dataMasking || securityConfig.dataMasking.length === 0) {
        return results;
    }

    try {
        // Make a deep copy of the results to avoid modifying the original
        const maskedResults = JSON.parse(JSON.stringify(results));

        // Apply each masking rule
        for (const rule of securityConfig.dataMasking) {
            const { columns, pattern, replacement } = rule;

            // Convert a string pattern to RegExp if needed
            const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;

            // Apply the rule to each row
            for (const row of maskedResults) {
                for (const column of columns) {
                    if (column in row && row[column] !== null && row[column] !== undefined) {
                        // Apply masking
                        const originalValue = String(row[column]);
                        row[column] = originalValue.replace(regex, replacement);
                    }
                }
            }
        }

        return maskedResults;
    } catch (error) {
        logger.error(`Error masking sensitive data: ${error.message}`);
        return results;
    }
}
```

## Best practices

1. **Do not expose credentials**: Do not include database credentials in source code.
2. **Use environment variables**: Store sensitive information in environment variables or `.env` files excluded from version control.
3. **Update regularly**: Keep MCP Firebird and its dependencies up to date.
4. **Auditing**: Enable audit logging for sensitive operations.
5. **Backups**: Back up your databases regularly.
6. **Least privilege**: Give each MCP Firebird instance access only to the tables and operations it needs.
7. **Segmentation**: Use separate MCP Firebird instances for different use cases, each with its own security configuration.

## Secure configuration example

```bash
# Database configuration with a limited-privilege user
export FIREBIRD_USER=app_user
export FIREBIRD_PASSWORD=strong_password
export FIREBIRD_DATABASE=/path/to/database.fdb

# Secure transport configuration
export TRANSPORT_TYPE=sse
export SSE_PORT=3003
export FIREBIRD_API_KEY=my_secret_token_123

# Start MCP Firebird
npx -y mcp-firebird
```
