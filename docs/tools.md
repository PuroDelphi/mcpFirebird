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

## Analysis Tools

### 5. analyze-query-performance

Analyzes the performance of a SQL query by executing it multiple times and measuring execution time.

```json
{
  "sql": "SELECT * FROM EMPLOYEES WHERE DEPARTMENT_ID = ?",
  "params": [10],
  "iterations": 5
}
```

### 6. get-execution-plan

Gets the execution plan for a SQL query to understand how the database will execute it.

```json
{
  "sql": "SELECT * FROM EMPLOYEES WHERE DEPARTMENT_ID = ?"
}
```

### 7. analyze-missing-indexes

Analyzes a SQL query to identify missing indexes that could improve performance.

```json
{
  "sql": "SELECT * FROM EMPLOYEES WHERE LAST_NAME = 'Smith'"
}
```

## Database Management Tools

### 8. backup-database

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

### 9. restore-database

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

### 10. validate-database

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

## Utility Tools

### 11. ping

Tests connectivity to the MCP Firebird server.

```json
{}
```

### 12. echo

Echoes back the input message.

```json
{
  "message": "Hello, Firebird!"
}
```

### 13. get-methods

Returns a description of all available MCP tools.

```json
{}
```

### 14. describe-method

Returns a description of a specific MCP tool.

```json
{
  "name": "execute-query"
}
```
