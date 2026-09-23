# Available Tools in MCP Firebird

MCP Firebird provides several tools for interacting with Firebird databases. These tools are available through the MCP protocol.

## Query Tools

### 1. execute-query

Executes a SQL query in the Firebird database.

```json
{
  "sql": "SELECT * FROM EMPLOYEES WHERE DEPARTMENT_ID = ?",
  "params": [10]
}
```

### 2. list-tables

Lists all user tables in the current database.

```json
{}
```

### 3. describe-table

Gets the detailed schema (columns, types, etc.) of a specific table.

```json
{
  "tableName": "EMPLOYEES"
}
```

### 4. get-field-descriptions

Gets the stored descriptions for fields of a specific table (if they exist).

```json
{
  "tableName": "EMPLOYEES"
}
```

### 5. get-table-indexes

Gets the indexes for one table, including their ordered columns, uniqueness, direction, and segment count.

```json
{
  "tableName": "EMPLOYEES"
}
```

### 6. get-table-constraints

Gets PRIMARY KEY, FOREIGN KEY, UNIQUE, NOT NULL, and CHECK constraints. Foreign keys include the referenced table and ordered columns.

```json
{
  "tableName": "EMPLOYEES"
}
```

### 7. get-table-triggers

Gets the triggers associated with one table, including their type, sequence, active state, source, and description.

```json
{
  "tableName": "EMPLOYEES"
}
```

### 8. execute-batch-queries

Executes multiple SQL queries in parallel for improved performance.

```json
{
  "queries": [
    {
      "sql": "SELECT * FROM EMPLOYEES WHERE DEPARTMENT_ID = ?",
      "params": [10]
    },
    {
      "sql": "SELECT * FROM DEPARTMENTS WHERE LOCATION_ID = ?",
      "params": [1700]
    },
    {
      "sql": "SELECT COUNT(*) FROM JOB_HISTORY"
    }
  ],
  "maxConcurrent": 3  // Maximum number of concurrent queries (default: 5, max: 10)
}
```

### 9. describe-batch-tables

Gets the detailed schema of multiple tables in parallel for improved performance.

```json
{
  "tableNames": ["EMPLOYEES", "DEPARTMENTS", "JOB_HISTORY"],
  "maxConcurrent": 3  // Maximum number of concurrent operations (default: 5, max: 10)
}
```

## Analysis Tools

### 10. analyze-query-performance

Analyzes the performance of a SQL query by executing it multiple times and measuring execution time.

```json
{
  "sql": "SELECT * FROM EMPLOYEES WHERE DEPARTMENT_ID = ?",
  "params": [10],
  "iterations": 5
}
```

### 11. get-execution-plan

Gets the execution plan for a SQL query to understand how the database will execute it.

```json
{
  "sql": "SELECT * FROM EMPLOYEES WHERE DEPARTMENT_ID = ?"
}
```

### 12. analyze-missing-indexes

Analyzes a SQL query to identify missing indexes that could improve performance.

```json
{
  "sql": "SELECT * FROM EMPLOYEES WHERE LAST_NAME = 'Smith'"
}
```

## Database Management Tools

### 13. backup-database

Creates a backup of the Firebird database.

```json
{
  "backupPath": "C:\\backups\\mydb_backup.fbk",
  "options": {
    "format": "gbak",  // "gbak" (full backup) or "nbackup" (incremental)
    "compress": true,  // Whether to compress the backup
    "metadata_only": false,  // Whether to backup only metadata (no data)
    "verbose": true  // Whether to show detailed progress
  }
}
```

### 14. restore-database

Restores a Firebird database from a backup.

```json
{
  "backupPath": "C:\\backups\\mydb_backup.fbk",
  "targetPath": "C:\\databases\\restored_db.fdb",
  "options": {
    "replace": true,  // Whether to replace the target database if it exists
    "pageSize": 8192,  // Page size for the restored database
    "verbose": true  // Whether to show detailed progress
  }
}
```

### 15. validate-database

Validates the integrity of the Firebird database.

```json
{
  "options": {
    "checkData": true,  // Whether to validate data integrity
    "checkIndexes": true,  // Whether to validate indexes
    "fixErrors": false,  // Whether to attempt to fix errors
    "verbose": true  // Whether to show detailed progress
  }
}
```

## Proactive Event Tools

### 16. subscribe_to_event

Subscribes the current connection to a Firebird `POST_EVENT` trigger.
*(Requires Streamable HTTP/SSE transport and the native Firebird driver).*

```json
{
  "eventName": "NEW_ORDER"
}
```

## Utility Tools

### 17. ping

Tests connectivity to the MCP Firebird server.

```json
{}
```

### 18. echo

Echoes back the input message.

```json
{
  "message": "Hello, Firebird!"
}
```

### 19. get-methods

Returns a description of all available MCP tools.

```json
{}
```

### 20. describe-method

Returns a description of a specific MCP tool.

```json
{
  "name": "execute-query"
}
```
