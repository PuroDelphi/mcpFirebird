# Database Metadata Tools

MCP Firebird provides comprehensive tools for inspecting database metadata including triggers, stored procedures, functions, and packages.

## Overview

These tools allow you to explore and understand the structure and logic of your Firebird database objects:

- **Triggers**: Automatic actions executed on table events
- **Stored Procedures**: Reusable server-side code with input/output parameters
- **Functions**: User-defined functions (UDFs and PSQL functions)
- **Packages**: Organized collections of procedures and functions (Firebird 3.0+)

## Security

All metadata tools respect the security configuration defined in your `.env` file or security configuration script. By default, these tools require the `EXECUTE` operation permission.

### Configuration Example

```env
# Allow metadata inspection
ALLOWED_OPERATIONS=SELECT,EXECUTE

# Or use role-based permissions
AUTHORIZATION_TYPE=basic
ROLE_PERMISSIONS_ADMIN_OPERATIONS=SELECT,INSERT,UPDATE,DELETE,EXECUTE
```

## Triggers

### list-triggers

Lists all triggers in the database with information about their associated tables, types, and status.

**Parameters:** None

**Returns:**
- Total number of triggers
- Array of trigger information:
  - `name`: Trigger name
  - `tableName`: Associated table (or "DATABASE" for database-level triggers)
  - `triggerType`: Human-readable trigger type (e.g., "BEFORE INSERT", "AFTER UPDATE")
  - `sequence`: Execution sequence number
  - `inactive`: Whether the trigger is inactive
  - `description`: Trigger description (if available)

**Example:**
```json
{
  "totalTriggers": 5,
  "triggers": [
    {
      "name": "TRG_AUDIT_INSERT",
      "tableName": "EMPLOYEES",
      "triggerType": "AFTER INSERT",
      "sequence": 0,
      "inactive": false,
      "description": "Audit trail for employee insertions"
    }
  ]
}
```

### describe-trigger

Gets detailed information about a specific trigger including its source code.

**Parameters:**
- `triggerName` (string, required): Name of the trigger to describe

**Returns:**
- Complete trigger information including:
  - All fields from `list-triggers`
  - `source`: Complete PSQL source code of the trigger

**Example:**
```json
{
  "name": "TRG_AUDIT_INSERT",
  "tableName": "EMPLOYEES",
  "triggerType": "AFTER INSERT",
  "sequence": 0,
  "inactive": false,
  "source": "BEGIN\n  INSERT INTO AUDIT_LOG (TABLE_NAME, OPERATION, USER_NAME)\n  VALUES ('EMPLOYEES', 'INSERT', CURRENT_USER);\nEND",
  "description": "Audit trail for employee insertions"
}
```

## Stored Procedures

### list-procedures

Lists all stored procedures in the database with parameter information.

**Parameters:** None

**Returns:**
- Total number of procedures
- Array of procedure information:
  - `name`: Procedure name
  - `inputParams`: Number of input parameters
  - `outputParams`: Number of output parameters
  - `description`: Procedure description (if available)
  - `validBlr`: Whether the BLR (Binary Language Representation) is valid

**Example:**
```json
{
  "totalProcedures": 3,
  "procedures": [
    {
      "name": "SP_GET_EMPLOYEE_SALARY",
      "inputParams": 1,
      "outputParams": 2,
      "description": "Returns employee salary information",
      "validBlr": true
    }
  ]
}
```

### describe-procedure

Gets detailed information about a specific stored procedure including its source code.

**Parameters:**
- `procedureName` (string, required): Name of the procedure to describe

**Returns:**
- Complete procedure information including:
  - All fields from `list-procedures`
  - `source`: Complete PSQL source code of the procedure

**Example:**
```json
{
  "name": "SP_GET_EMPLOYEE_SALARY",
  "inputParams": 1,
  "outputParams": 2,
  "source": "BEGIN\n  SELECT SALARY, BONUS\n  FROM EMPLOYEES\n  WHERE EMP_ID = :EMP_ID\n  INTO :SALARY, :BONUS;\nEND",
  "description": "Returns employee salary information",
  "validBlr": true
}
```

## Functions

### list-functions

Lists all functions in the database (both UDFs and PSQL functions).

**Parameters:** None

**Returns:**
- Total number of functions
- Array of function information:
  - `name`: Function name
  - `moduleName`: Module name (for UDFs)
  - `entryPoint`: Entry point (for UDFs)
  - `returnArgument`: Return argument position
  - `description`: Function description (if available)
  - `validBlr`: Whether the BLR is valid

**Example:**
```json
{
  "totalFunctions": 2,
  "functions": [
    {
      "name": "FN_CALCULATE_TAX",
      "moduleName": null,
      "entryPoint": null,
      "returnArgument": 0,
      "description": "Calculates tax based on salary",
      "validBlr": true
    }
  ]
}
```

### describe-function

Gets detailed information about a specific function including its source code (for PSQL functions).

**Parameters:**
- `functionName` (string, required): Name of the function to describe

**Returns:**
- Complete function information including:
  - All fields from `list-functions`
  - `source`: Complete PSQL source code (for PSQL functions, null for UDFs)

**Example:**
```json
{
  "name": "FN_CALCULATE_TAX",
  "moduleName": null,
  "entryPoint": null,
  "returnArgument": 0,
  "source": "BEGIN\n  RETURN SALARY * 0.15;\nEND",
  "description": "Calculates tax based on salary",
  "validBlr": true
}
```

## Packages

**Note:** Packages are available in Firebird 3.0 and later versions.

### list-packages

Lists all packages in the database.

**Parameters:** None

**Returns:**
- Total number of packages
- Array of package information:
  - `name`: Package name
  - `description`: Package description (if available)
  - `validBodyFlag`: Whether the package body is valid

**Example:**
```json
{
  "totalPackages": 1,
  "packages": [
    {
      "name": "PKG_EMPLOYEE_UTILS",
      "description": "Employee utility functions and procedures",
      "validBodyFlag": true
    }
  ]
}
```

### describe-package

Gets detailed information about a specific package including its header and body source code.

**Parameters:**
- `packageName` (string, required): Name of the package to describe

**Returns:**
- Complete package information including:
  - All fields from `list-packages`
  - `headerSource`: Package header source code (interface definition)
  - `bodySource`: Package body source code (implementation)

**Example:**
```json
{
  "name": "PKG_EMPLOYEE_UTILS",
  "headerSource": "CREATE PACKAGE PKG_EMPLOYEE_UTILS\nAS\nBEGIN\n  FUNCTION GET_FULL_NAME(EMP_ID INTEGER) RETURNS VARCHAR(100);\n  PROCEDURE UPDATE_SALARY(EMP_ID INTEGER, NEW_SALARY DECIMAL(10,2));\nEND",
  "bodySource": "CREATE PACKAGE BODY PKG_EMPLOYEE_UTILS\nAS\nBEGIN\n  FUNCTION GET_FULL_NAME(EMP_ID INTEGER) RETURNS VARCHAR(100)\n  AS\n  BEGIN\n    RETURN (SELECT FIRST_NAME || ' ' || LAST_NAME FROM EMPLOYEES WHERE ID = :EMP_ID);\n  END\n  \n  PROCEDURE UPDATE_SALARY(EMP_ID INTEGER, NEW_SALARY DECIMAL(10,2))\n  AS\n  BEGIN\n    UPDATE EMPLOYEES SET SALARY = :NEW_SALARY WHERE ID = :EMP_ID;\n  END\nEND",
  "description": "Employee utility functions and procedures",
  "validBodyFlag": true
}
```

## Trigger Types

The `triggerType` field in trigger information uses human-readable descriptions:

- **BEFORE INSERT**: Executed before inserting a row
- **AFTER INSERT**: Executed after inserting a row
- **BEFORE UPDATE**: Executed before updating a row
- **AFTER UPDATE**: Executed after updating a row
- **BEFORE DELETE**: Executed before deleting a row
- **AFTER DELETE**: Executed after deleting a row
- **BEFORE INSERT OR UPDATE**: Executed before insert or update
- **AFTER INSERT OR UPDATE**: Executed after insert or update
- **BEFORE INSERT OR DELETE**: Executed before insert or delete
- **AFTER INSERT OR DELETE**: Executed after insert or delete
- **BEFORE UPDATE OR DELETE**: Executed before update or delete
- **AFTER UPDATE OR DELETE**: Executed after update or delete
- **BEFORE INSERT OR UPDATE OR DELETE**: Executed before any DML operation
- **AFTER INSERT OR UPDATE OR DELETE**: Executed after any DML operation
- **ON CONNECT**: Database-level trigger on connection
- **ON DISCONNECT**: Database-level trigger on disconnection
- **ON TRANSACTION START**: Database-level trigger on transaction start
- **ON TRANSACTION COMMIT**: Database-level trigger on transaction commit
- **ON TRANSACTION ROLLBACK**: Database-level trigger on transaction rollback

## Use Cases

### 1. Understanding Database Logic

Use these tools to understand the business logic implemented in your database:

```javascript
// List all triggers to see what automatic actions are configured
const triggers = await client.callTool('list-triggers', {});

// Get the source code of a specific trigger
const triggerDetails = await client.callTool('describe-trigger', {
  triggerName: 'TRG_AUDIT_INSERT'
});
```

### 2. Documentation Generation

Generate documentation for your database objects:

```javascript
// Get all procedures and their descriptions
const procedures = await client.callTool('list-procedures', {});

// Get detailed information for each procedure
for (const proc of procedures.procedures) {
  const details = await client.callTool('describe-procedure', {
    procedureName: proc.name
  });
  // Generate documentation from details
}
```

### 3. Code Review and Analysis

Review stored procedure and function code for optimization or security issues:

```javascript
// Get all functions
const functions = await client.callTool('list-functions', {});

// Analyze each function's source code
for (const func of functions.functions) {
  const details = await client.callTool('describe-function', {
    functionName: func.name
  });
  // Analyze details.source for potential issues
}
```

### 4. Migration Planning

Understand dependencies before migrating or modifying database objects:

```javascript
// List all packages to understand code organization
const packages = await client.callTool('list-packages', {});

// Get package details to understand dependencies
const pkgDetails = await client.callTool('describe-package', {
  packageName: 'PKG_EMPLOYEE_UTILS'
});
```

## Error Handling

All metadata tools return structured error information when issues occur:

```json
{
  "error": "Trigger not found: INVALID_TRIGGER",
  "errorType": "NOT_FOUND",
  "success": false
}
```

Common error types:
- `NOT_FOUND`: The requested object doesn't exist
- `VALIDATION_ERROR`: Invalid object name provided
- `AUTHORIZATION_ERROR`: Insufficient permissions
- `METADATA_ERROR`: Error accessing database metadata

## Best Practices

1. **Check Permissions**: Ensure your security configuration allows EXECUTE operations
2. **Handle Missing Objects**: Always check for NOT_FOUND errors when describing specific objects
3. **Version Compatibility**: Packages are only available in Firebird 3.0+
4. **Large Source Code**: Some procedures/functions may have very large source code - handle appropriately
5. **Inactive Triggers**: Check the `inactive` flag to understand which triggers are currently disabled

## Related Documentation

- [Security Configuration](security.md)
- [Database Tools](tools.md)
- [Resources, Tools & Prompts](resources-tools-prompts.md)


