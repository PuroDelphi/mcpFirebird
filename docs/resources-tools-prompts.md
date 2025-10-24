# MCP Firebird Resources, Tools, and Prompts

This document provides a comprehensive guide to all resources, tools, and prompts available in MCP Firebird.

## Table of Contents

- [Resources](#resources)
- [Tools](#tools)
- [Prompts](#prompts)

---

## Resources

Resources in MCP are static or semi-static data that LLMs can read. They provide context about the database structure and metadata.

### Database Resources

#### `/schema`
**Description:** Complete database schema with all tables and their relationships.

**Returns:**
```json
{
  "database": "firebird",
  "tables": [
    {
      "tableName": "EMPLOYEES",
      "schema": { /* table schema */ }
    }
  ],
  "totalTables": 10
}
```

**Use Case:** Get a complete overview of the database structure.

---

#### `/tables`
**Description:** List of all user tables in the database.

**Returns:**
```json
{
  "tables": ["EMPLOYEES", "DEPARTMENTS", "PROJECTS"]
}
```

**Use Case:** Discover available tables in the database.

---

#### `/tables/{tableName}/schema`
**Description:** Detailed schema of a specific table.

**Parameters:**
- `tableName` - Name of the table

**Returns:** Table schema with columns, types, constraints, etc.

**Use Case:** Understand the structure of a specific table.

---

#### `/tables/{tableName}/description`
**Description:** Detailed description of a table including field descriptions.

**Parameters:**
- `tableName` - Name of the table

**Returns:** Table description with field-level documentation.

**Use Case:** Get human-readable descriptions of table fields.

---

#### `/tables/{tableName}/data`
**Description:** Table data with pagination support.

**Parameters:**
- `tableName` - Name of the table
- `first` (optional) - Number of rows to retrieve
- `skip` (optional) - Number of rows to skip

**Returns:** Paginated table data.

**Use Case:** Preview table data or retrieve specific rows.

---

#### `/tables/{tableName}/indexes`
**Description:** Indexes defined on a specific table.

**Parameters:**
- `tableName` - Name of the table

**Returns:**
```json
{
  "tableName": "EMPLOYEES",
  "indexes": [
    {
      "name": "IDX_EMP_NAME",
      "isUnique": false,
      "type": "ASCENDING",
      "segmentCount": 1
    }
  ]
}
```

**Use Case:** Analyze indexing strategy and performance optimization.

---

#### `/tables/{tableName}/constraints`
**Description:** Constraints (PRIMARY KEY, FOREIGN KEY, etc.) on a table.

**Parameters:**
- `tableName` - Name of the table

**Returns:**
```json
{
  "tableName": "EMPLOYEES",
  "constraints": [
    {
      "name": "PK_EMPLOYEES",
      "type": "PRIMARY KEY",
      "indexName": "RDB$PRIMARY1"
    }
  ]
}
```

**Use Case:** Understand data integrity rules and relationships.

---

#### `/tables/{tableName}/triggers`
**Description:** Triggers defined on a specific table.

**Parameters:**
- `tableName` - Name of the table

**Returns:**
```json
{
  "tableName": "EMPLOYEES",
  "triggers": [
    {
      "name": "TRG_EMP_AUDIT",
      "type": 1,
      "sequence": 0,
      "isActive": true,
      "source": "BEGIN ... END"
    }
  ]
}
```

**Use Case:** Review business logic implemented in triggers.

---

#### `/statistics`
**Description:** General database statistics including row counts.

**Returns:**
```json
{
  "totalTables": 10,
  "totalRows": 15000,
  "tables": [
    {
      "tableName": "EMPLOYEES",
      "rowCount": 500
    }
  ]
}
```

**Use Case:** Get database size and growth metrics.

---

## Tools

Tools in MCP are actions that can be executed. They perform operations on the database.

### Query Tools

#### `execute-query`
**Description:** Executes a SQL query in the Firebird database.

**Parameters:**
- `sql` (string, required) - SQL query to execute
- `params` (array, optional) - Parameters for parameterized queries

**Example:**
```json
{
  "sql": "SELECT * FROM EMPLOYEES WHERE DEPT_ID = ?",
  "params": [10]
}
```

**Use Case:** Execute custom SQL queries.

---

#### `get-table-data`
**Description:** Retrieves data from a specific table with filtering and pagination.

**Parameters:**
- `tableName` (string, required) - Name of the table
- `first` (number, optional) - Number of rows to retrieve
- `skip` (number, optional) - Number of rows to skip
- `where` (string, optional) - WHERE clause (without WHERE keyword)
- `orderBy` (string, optional) - ORDER BY clause (without ORDER BY keyword)

**Example:**
```json
{
  "tableName": "EMPLOYEES",
  "first": 10,
  "where": "SALARY > 50000",
  "orderBy": "HIRE_DATE DESC"
}
```

**Use Case:** Retrieve filtered and sorted table data.

---

### Schema Tools

#### `list-tables`
**Description:** Lists all user tables in the database.

**Parameters:** None

**Use Case:** Discover available tables.

---

#### `describe-table`
**Description:** Gets detailed schema of a specific table.

**Parameters:**
- `tableName` (string, required) - Name of the table

**Use Case:** Understand table structure.

---

#### `describe-batch-tables`
**Description:** Describes multiple tables in parallel for better performance.

**Parameters:**
- `tableNames` (array, required) - Array of table names (max 20)
- `maxConcurrent` (number, optional) - Max concurrent operations (default: 5)

**Example:**
```json
{
  "tableNames": ["EMPLOYEES", "DEPARTMENTS", "PROJECTS"],
  "maxConcurrent": 3
}
```

**Use Case:** Efficiently retrieve schemas for multiple tables.

---

#### `get-field-descriptions`
**Description:** Gets stored descriptions for table fields.

**Parameters:**
- `tableName` (string, required) - Name of the table

**Use Case:** Get human-readable field documentation.

---

### Analysis Tools

#### `analyze-table-statistics`
**Description:** Analyzes statistical information about a table.

**Parameters:**
- `tableName` (string, required) - Name of the table

**Returns:**
```json
{
  "tableName": "EMPLOYEES",
  "rowCount": 500,
  "columnCount": 15,
  "sampleSize": 100,
  "columns": [...]
}
```

**Use Case:** Understand table size and structure.

---

#### `analyze-query-performance`
**Description:** Analyzes query performance by running it multiple times.

**Parameters:**
- `sql` (string, required) - SQL query to analyze
- `params` (array, optional) - Query parameters
- `iterations` (number, optional) - Number of iterations (default: 3)

**Use Case:** Measure and optimize query performance.

---

#### `get-execution-plan`
**Description:** Gets the execution plan for a SQL query.

**Parameters:**
- `sql` (string, required) - SQL query to analyze
- `params` (array, optional) - Query parameters

**Use Case:** Understand how Firebird executes a query.

---

#### `analyze-missing-indexes`
**Description:** Analyzes a query to identify missing indexes.

**Parameters:**
- `sql` (string, required) - SQL query to analyze

**Use Case:** Optimize query performance by identifying index opportunities.

---

### Database Management Tools

#### `backup-database`
**Description:** Creates a backup of the database.

**Parameters:**
- `backupPath` (string, required) - Path for the backup file
- `options` (object, optional):
  - `format` - 'gbak' or 'nbackup' (default: 'gbak')
  - `compress` - Compress backup (default: false)
  - `metadata_only` - Backup only metadata (default: false)
  - `verbose` - Show detailed progress (default: false)

**Use Case:** Create database backups.

---

#### `restore-database`
**Description:** Restores a database from backup.

**Parameters:**
- `backupPath` (string, required) - Path to backup file
- `targetPath` (string, required) - Path for restored database
- `options` (object, optional):
  - `replace` - Replace existing database (default: false)
  - `pageSize` - Page size (default: 4096)
  - `verbose` - Show detailed progress (default: false)

**Use Case:** Restore database from backup.

---

#### `validate-database`
**Description:** Validates database integrity.

**Parameters:**
- `options` (object, optional):
  - `checkData` - Validate data integrity (default: true)
  - `checkIndexes` - Validate indexes (default: true)
  - `fixErrors` - Attempt to fix errors (default: false)
  - `verbose` - Show detailed progress (default: false)

**Use Case:** Check database health and integrity.

---

#### `verify-wire-encryption`
**Description:** Verifies if wire encryption is enabled.

**Parameters:** None

**Returns:**
```json
{
  "hasNativeDriver": true,
  "wireEncryptionEnabled": true,
  "driverType": "native",
  "recommendation": "..."
}
```

**Use Case:** Verify security configuration.

---

#### `get-database-info`
**Description:** Gets general database information.

**Parameters:** None

**Returns:**
```json
{
  "database": "EMPLOYEE.FDB",
  "host": "localhost",
  "port": 3050,
  "totalTables": 10,
  "driverType": "native",
  "wireEncryption": "Enabled"
}
```

**Use Case:** Get database configuration overview.

---

## Prompts

Prompts in MCP are templates that guide the LLM to perform complex tasks. They are NOT executable actions but rather structured guides.

### Analysis Prompts

#### `database-health-check`
**Description:** Comprehensive guide for analyzing database health.

**Parameters:**
- `focusAreas` (array, optional) - Areas to focus on: 'performance', 'integrity', 'security', 'structure', 'all'

**Use Case:** Perform a complete database health assessment.

**What it does:** Provides a step-by-step guide for the LLM to:
- Analyze database structure
- Check performance metrics
- Verify data integrity
- Review security configuration
- Generate recommendations

---

#### `query-optimization-guide`
**Description:** Step-by-step guide for optimizing SQL queries.

**Parameters:**
- `queryType` (string, optional) - Type of query: 'select', 'insert', 'update', 'delete', 'general'

**Use Case:** Optimize slow or inefficient queries.

**What it does:** Guides the LLM through:
- Performance analysis
- Execution plan review
- Index optimization
- Firebird-specific optimizations
- Testing and validation

---

#### `schema-design-review`
**Description:** Comprehensive guide for reviewing database schema design.

**Parameters:**
- `tableName` (string, optional) - Specific table to review (or entire schema)

**Use Case:** Review and improve database design.

**What it does:** Guides the LLM to review:
- Normalization
- Data types
- Constraints and integrity
- Indexing strategy
- Naming conventions
- Performance considerations

---

### Advanced Prompts

#### `migration-planning`
**Description:** Guide for planning database migrations.

**Parameters:**
- `migrationType` (string, required) - Type: 'schema-change', 'data-migration', 'version-upgrade', 'platform-migration'
- `description` (string, optional) - Migration goal description

**Use Case:** Plan complex database migrations.

**What it does:** Provides a complete migration framework:
- Assessment and analysis
- Migration strategy
- Implementation plan
- Validation and testing
- Rollback procedures
- Documentation

---

#### `security-audit`
**Description:** Comprehensive security audit guide.

**Parameters:**
- `auditScope` (array, optional) - Scope: 'encryption', 'access-control', 'data-protection', 'compliance', 'all'

**Use Case:** Conduct security audits.

**What it does:** Guides the LLM through:
- Encryption verification
- Access control review
- Data protection assessment
- Compliance checking
- Vulnerability assessment
- Security recommendations

---

## Legacy Prompts (Compatibility)

The following prompts are kept for backward compatibility with existing MCP clients. They execute actions directly instead of providing guidance templates.

### Database Structure Prompts
- `analyze-table` - Analyzes table structure
- `list-tables` - Lists all tables
- `analyze-table-relationships` - Analyzes table relationships
- `database-schema-overview` - Provides schema overview
- `analyze-table-data` - Analyzes table data statistics

### SQL Prompts
- `query-data` - Executes and analyzes SQL queries
- `optimize-query` - Analyzes and suggests query optimizations
- `generate-sql` - Generates SQL based on requirements
- `explain-sql` - Explains SQL query functionality
- `sql-tutorial` - Provides SQL tutorials

**Note:** These legacy prompts will continue to work but it's recommended to use the new template prompts combined with appropriate tools for better results.

---

## Best Practices

### When to Use Resources
- Getting database metadata
- Understanding schema structure
- Reviewing indexes, constraints, triggers
- Getting database statistics

### When to Use Tools
- Executing queries
- Retrieving data
- Analyzing performance
- Managing backups
- Validating database

### When to Use Prompts
- Complex analysis tasks
- Multi-step procedures
- Planning and strategy
- Comprehensive reviews
- Security audits

---

## Examples

### Example 1: Analyze Database Performance

1. Use prompt: `database-health-check` with `focusAreas: ['performance']`
2. The LLM will use tools like:
   - `analyze-query-performance`
   - `get-execution-plan`
   - `analyze-missing-indexes`
3. And resources like:
   - `/tables/{tableName}/indexes`
   - `/statistics`

### Example 2: Optimize a Slow Query

1. Use prompt: `query-optimization-guide` with `queryType: 'select'`
2. The LLM will:
   - Analyze current performance with `analyze-query-performance`
   - Review execution plan with `get-execution-plan`
   - Check indexes using `/tables/{tableName}/indexes`
   - Suggest optimizations

### Example 3: Plan a Schema Migration

1. Use prompt: `migration-planning` with `migrationType: 'schema-change'`
2. The LLM will guide you through:
   - Current state analysis using resources
   - Backup creation with `backup-database`
   - Validation with `validate-database`
   - Testing procedures

---

## Summary

- **9 Resources** - Static database metadata
- **18+ Tools** - Executable database operations
- **5 Template Prompts** - Structured guidance for complex tasks
- **10 Legacy Prompts** - Backward compatibility

All components work together to provide comprehensive database management capabilities through the Model Context Protocol.

