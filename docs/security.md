# Security in MCP Firebird

This document describes the security considerations and configuration options for MCP Firebird, including detailed examples of all implemented security capabilities.

## General Considerations

MCP Firebird provides access to Firebird databases, which implies certain security risks. Consider the following recommendations:

1. **Minimum Privileges**: Use a database user with the minimum necessary privileges.
2. **Isolation**: Run MCP Firebird in an isolated environment, such as a Docker container.
3. **Firewall**: Limit access to the ports used by MCP Firebird.
4. **HTTPS**: Use HTTPS for SSE connections in production.
5. **Input Validation**: MCP Firebird validates SQL queries to prevent injection, but it's good practice to validate on the client side as well.

## Implemented Security Capabilities

MCP Firebird includes a comprehensive security system with the following capabilities:

- **Table Restriction**: Limits which tables are accessible
- **SQL Operation Limitation**: Controls which types of SQL operations are allowed
- **Sensitive Data Masking**: Hides confidential information in results
- **Row Filtering**: Applies conditions to limit which records are visible
- **Resource Limits**: Prevents queries that consume too many resources
- **Integration with Authorization Systems**: Support for OAuth2 and role-to-permission mapping
- **Auditing**: Detailed logging of operations for security purposes

## Restricting Access to Tables and Views

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
npx mcp-firebird --config ./config.js
```

## Limiting SQL Operations

You can restrict which SQL operations are allowed:

```javascript
// In your custom configuration
module.exports = {
  // Basic configuration...

  security: {
    // Allowed SQL operations
    allowedOperations: ['SELECT', 'EXECUTE'],  // Only queries and stored procedures

    // Specifically block these operations
    forbiddenOperations: ['DROP', 'TRUNCATE', 'ALTER', 'GRANT', 'REVOKE'],

    // Maximum number of rows that can be returned in a query
    maxRows: 1000,

    // Maximum execution time for queries (in ms)
    queryTimeout: 5000
  }
};
```

## Sensitive Data Masking

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
        // Partially mask emails
        columns: ['EMAIL'],
        pattern: /^(.{3})(.*)(@.*)$/,
        replacement: '$1***$3'
      }
    ],

    // Row filters to exclude sensitive data
    rowFilters: {
      'CUSTOMERS': 'GDPR_CONSENT = 1',  // Only show customers with GDPR consent
      'EMPLOYEES': 'IS_PUBLIC_PROFILE = 1'  // Only public employee profiles
    }
  }
};
```

## Data Volume Limitations

Configure limits to prevent queries that consume too many resources:

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

## Integration with External Authorization Systems

MCP Firebird can integrate with external authorization systems for more precise access control:

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

      // Role to permission mapping
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

## Practical Security Examples

### Example 1: MCP Server for Sales Analysis

```javascript
// config-sales-analysis.js
module.exports = {
  database: process.env.FIREBIRD_DATABASE,
  user: process.env.FIREBIRD_USER,
  password: process.env.FIREBIRD_PASSWORD,

  security: {
    // Limited access to sales tables
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

### Example 2: MCP Server for Inventory Management

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

### Example 3: Configuration for Development and Testing

```javascript
// config-development.js
module.exports = {
  database: process.env.FIREBIRD_DATABASE_DEV,
  user: process.env.FIREBIRD_USER_DEV,
  password: process.env.FIREBIRD_PASSWORD_DEV,

  security: {
    // In development, allow more operations
    allowedOperations: ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE'],

    // Exclude only critical tables
    forbiddenTables: ['SYSTEM_CONFIG', 'APP_SECRETS'],

    // Limit impact of heavy queries
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

## SQL Security Options

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

## SQL Query Validation

MCP Firebird includes SQL query validation to prevent SQL injection. This validation is performed before executing any query.

```javascript
// Example of SQL query validation
const isSafe = validateSql("SELECT * FROM EMPLOYEES WHERE ID = ?");
```

## Data Masking Implementation

Data masking is implemented at the application level, applying transformation rules to query results before returning them to the client:

```typescript
// Example of data masking implementation
function maskSensitiveData(results: any[]): any[] {
    if (!securityConfig.dataMasking || securityConfig.dataMasking.length === 0) {
        return results;
    }

    try {
        // Create a deep copy of the results to avoid modifying the original
        const maskedResults = JSON.parse(JSON.stringify(results));

        // Apply each masking rule
        for (const rule of securityConfig.dataMasking) {
            const { columns, pattern, replacement } = rule;

            // Convert pattern from string to RegExp if necessary
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

## Best Practices

1. **Don't Expose Credentials**: Don't include database credentials in source code.
2. **Use Environment Variables**: Store sensitive information in environment variables or `.env` files that aren't included in version control.
3. **Update Regularly**: Keep MCP Firebird and its dependencies updated.
4. **Auditing**: Implement audit logging for sensitive operations.
5. **Backup**: Perform regular backups of your databases.
6. **Principle of Least Privilege**: Configure each MCP Firebird instance with access only to the tables and operations it actually needs.
7. **Segmentation**: Use different MCP Firebird instances for different use cases, each with its own security configuration.

## Secure Configuration Example

```bash
# Database configuration with limited privilege user
export FIREBIRD_USER=app_user
export FIREBIRD_PASSWORD=strong_password
export FIREBIRD_DATABASE=/path/to/database.fdb

# Secure transport configuration
export TRANSPORT_TYPE=sse
export SSE_PORT=3003
export SSL_CERT=/path/to/cert.pem
export SSL_KEY=/path/to/key.pem

# Security configuration
export SECURITY_CONFIG=/path/to/security-config.json

# Start MCP Firebird
npx mcp-firebird
```
