# Herramientas disponibles en MCP Firebird

MCP Firebird proporciona varias herramientas para interactuar con bases de datos Firebird. Estas herramientas están disponibles a través del protocolo MCP.

## Herramientas de consulta

### 1. execute-query

Ejecuta una consulta SQL en la base de datos Firebird.

```json
{
  "sql": "SELECT * FROM EMPLOYEES WHERE DEPARTMENT_ID = ?",
  "params": [10]
}
```

### 2. list-tables

Lista todas las tablas de usuario en la base de datos actual.

```json
{}
```

### 3. describe-table

Obtiene el esquema detallado (columnas, tipos, etc.) de una tabla específica.

```json
{
  "tableName": "EMPLOYEES"
}
```

### 4. get-field-descriptions

Obtiene las descripciones almacenadas para los campos de una tabla específica (si existen).

```json
{
  "tableName": "EMPLOYEES"
}
```

## Herramientas de análisis

### 5. analyze-query-performance

Analiza el rendimiento de una consulta SQL ejecutándola varias veces y midiendo el tiempo de ejecución.

```json
{
  "sql": "SELECT * FROM EMPLOYEES WHERE DEPARTMENT_ID = ?",
  "params": [10],
  "iterations": 5
}
```

### 6. get-execution-plan

Obtiene el plan de ejecución para una consulta SQL para entender cómo la base de datos la ejecutará.

```json
{
  "sql": "SELECT * FROM EMPLOYEES WHERE DEPARTMENT_ID = ?"
}
```

### 7. analyze-missing-indexes

Analiza una consulta SQL para identificar índices faltantes que podrían mejorar el rendimiento.

```json
{
  "sql": "SELECT * FROM EMPLOYEES WHERE LAST_NAME = 'Smith'"
}
```

## Herramientas de gestión de bases de datos

### 8. backup-database

Crea una copia de seguridad de la base de datos Firebird.

```json
{
  "backupPath": "C:\\backups\\mydb_backup.fbk",
  "options": {
    "format": "gbak",  // "gbak" (copia de seguridad completa) o "nbackup" (incremental)
    "compress": true,  // Si se debe comprimir la copia de seguridad
    "metadata_only": false,  // Si solo se debe hacer copia de seguridad de los metadatos (sin datos)
    "verbose": true  // Si se debe mostrar progreso detallado
  }
}
```

### 9. restore-database

Restaura una base de datos Firebird desde una copia de seguridad.

```json
{
  "backupPath": "C:\\backups\\mydb_backup.fbk",
  "targetPath": "C:\\databases\\restored_db.fdb",
  "options": {
    "replace": true,  // Si se debe reemplazar la base de datos destino si existe
    "pageSize": 8192,  // Tamaño de página para la base de datos restaurada
    "verbose": true  // Si se debe mostrar progreso detallado
  }
}
```

### 10. validate-database

Valida la integridad de la base de datos Firebird.

```json
{
  "options": {
    "checkData": true,  // Si se debe validar la integridad de los datos
    "checkIndexes": true,  // Si se debe validar los índices
    "fixErrors": false,  // Si se debe intentar corregir errores
    "verbose": true  // Si se debe mostrar progreso detallado
  }
}
```

## Herramientas de utilidad

### 11. ping

Prueba la conectividad al servidor MCP Firebird.

```json
{}
```

### 12. echo

Devuelve el mensaje de entrada.

```json
{
  "message": "Hello, Firebird!"
}
```

### 13. get-methods

Devuelve una descripción de todas las herramientas MCP disponibles.

```json
{}
```

### 14. describe-method

Devuelve una descripción de una herramienta MCP específica.

```json
{
  "name": "execute-query"
}
```
