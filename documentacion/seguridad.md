# Configuración de Seguridad en MCP Firebird

MCP Firebird incluye un sistema de seguridad configurable que permite controlar qué tipos de consultas SQL se pueden ejecutar. Esta documentación explica cómo configurar y utilizar estas opciones de seguridad.

## Opciones de Seguridad SQL

MCP Firebird proporciona varias opciones para controlar la seguridad de las consultas SQL:

- **allowSystemTables**: Permite o bloquea el acceso a tablas del sistema (tablas que comienzan con `RDB$`, `MON$` o `SYS.`).
- **allowedSystemTables**: Lista de tablas del sistema específicas a las que se permite el acceso.
- **allowDDL**: Permite o bloquea consultas DDL (CREATE, ALTER, DROP).
- **allowUnsafeQueries**: Permite o bloquea consultas potencialmente peligrosas.

## Archivo de Configuración de Seguridad

Para configurar estas opciones, puedes crear un archivo JSON con la siguiente estructura:

```json
{
  "sql": {
    "allowSystemTables": true,
    "allowedSystemTables": ["RDB$PROCEDURES", "RDB$PROCEDURE_PARAMETERS", "RDB$RELATIONS", "RDB$RELATION_FIELDS"],
    "allowDDL": true,
    "allowUnsafeQueries": false
  }
}
```

### Opciones Disponibles

#### allowSystemTables (boolean)
- **true**: Permite el acceso a tablas del sistema.
- **false**: Bloquea el acceso a tablas del sistema.
- **Valor predeterminado**: `false`

#### allowedSystemTables (array de strings)
- Lista de tablas del sistema específicas a las que se permite el acceso.
- Solo se aplica si `allowSystemTables` es `true`.
- **Valor predeterminado**: `[]` (array vacío)

#### allowDDL (boolean)
- **true**: Permite consultas DDL (CREATE, ALTER, DROP).
- **false**: Bloquea consultas DDL.
- **Valor predeterminado**: `false`

#### allowUnsafeQueries (boolean)
- **true**: Desactiva todas las validaciones de seguridad.
- **false**: Aplica validaciones de seguridad.
- **Valor predeterminado**: `false`

## Uso con Claude Desktop

Para usar esta configuración con Claude Desktop, debes modificar la configuración de Claude Desktop para incluir el parámetro `--security-config`:

```json
"mcp-firebird": {
    "args": [
        "mcp-firebird@beta",
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
        "C:\\ruta\\a\\tu\\security-config.json"
    ],
    "command": "npx",
    "type": "stdio"
}
```

## Ejemplos de Configuración

### Permitir Acceso a Tablas del Sistema Específicas

```json
{
  "sql": {
    "allowSystemTables": true,
    "allowedSystemTables": ["RDB$PROCEDURES", "RDB$PROCEDURE_PARAMETERS"]
  }
}
```

Esta configuración permite el acceso solo a las tablas del sistema `RDB$PROCEDURES` y `RDB$PROCEDURE_PARAMETERS`.

### Permitir Consultas DDL

```json
{
  "sql": {
    "allowDDL": true
  }
}
```

Esta configuración permite ejecutar consultas DDL (CREATE, ALTER, DROP).

### Configuración Completa

```json
{
  "sql": {
    "allowSystemTables": true,
    "allowedSystemTables": ["RDB$PROCEDURES", "RDB$PROCEDURE_PARAMETERS", "RDB$RELATIONS", "RDB$RELATION_FIELDS"],
    "allowDDL": true,
    "allowUnsafeQueries": false
  }
}
```

Esta configuración permite el acceso a tablas del sistema específicas y consultas DDL, pero mantiene otras validaciones de seguridad.

## Recomendaciones de Seguridad

- No habilites `allowUnsafeQueries` a menos que sea absolutamente necesario.
- Limita las tablas del sistema permitidas a solo las que necesitas.
- Si necesitas ejecutar consultas DDL, considera crear una configuración separada para esas operaciones y no usarla para consultas regulares.
