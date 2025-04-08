# Seguridad en MCP Firebird

Este documento describe las consideraciones de seguridad y opciones de configuración para MCP Firebird, incluyendo ejemplos detallados de todas las capacidades de seguridad implementadas.

## Consideraciones generales

MCP Firebird proporciona acceso a bases de datos Firebird, lo que implica ciertos riesgos de seguridad. Considera las siguientes recomendaciones:

1. **Privilegios mínimos**: Usa un usuario de base de datos con los privilegios mínimos necesarios.
2. **Aislamiento**: Ejecuta MCP Firebird en un entorno aislado, como un contenedor Docker.
3. **Firewall**: Limita el acceso a los puertos utilizados por MCP Firebird.
4. **HTTPS**: Usa HTTPS para conexiones SSE en producción.
5. **Validación de entrada**: MCP Firebird valida las consultas SQL para prevenir inyección, pero es una buena práctica validar también en el cliente.

## Capacidades de seguridad implementadas

MCP Firebird incluye un sistema de seguridad completo con las siguientes capacidades:

- **Restricción de tablas**: Limita qué tablas son accesibles
- **Limitación de operaciones SQL**: Controla qué tipos de operaciones SQL están permitidas
- **Enmascaramiento de datos sensibles**: Oculta información confidencial en los resultados
- **Filtrado de filas**: Aplica condiciones para limitar qué registros son visibles
- **Límites de recursos**: Previene consultas que consumen demasiados recursos
- **Integración con sistemas de autorización**: Soporte para OAuth2 y mapeo de roles a permisos
- **Auditoría**: Registro detallado de operaciones para fines de seguridad

## Restricción de acceso a tablas y vistas

Puedes restringir qué tablas y vistas están disponibles para el servidor MCP usando filtros de inclusión y exclusión:

```javascript
// En tu configuración personalizada (config.js)
module.exports = {
  // Configuración básica...

  security: {
    // Sólo permitir acceso a estas tablas
    allowedTables: [
      'CUSTOMERS',
      'PRODUCTS',
      'ORDERS',
      'ORDER_ITEMS'
    ],

    // Excluir estas tablas explícitamente (tiene precedencia sobre allowedTables)
    forbiddenTables: [
      'USERS',
      'USER_CREDENTIALS',
      'AUDIT_LOG'
    ],

    // Filtro de patrón de nombre (expresión regular)
    tableNamePattern: '^(?!TMP_|TEMP_|BAK_).*$'  // Excluir tablas temporales/backup
  }
};
```

Para usar esta configuración:

```bash
npx mcp-firebird --config ./config.js
```

## Limitación de operaciones SQL

Puedes restringir qué operaciones SQL están permitidas:

```javascript
// En tu configuración personalizada
module.exports = {
  // Configuración básica...

  security: {
    // Operaciones SQL permitidas
    allowedOperations: ['SELECT', 'EXECUTE'],  // Solo consultas y procedimientos almacenados

    // Bloquear estas operaciones específicamente
    forbiddenOperations: ['DROP', 'TRUNCATE', 'ALTER', 'GRANT', 'REVOKE'],

    // Número máximo de filas que se pueden devolver en una consulta
    maxRows: 1000,

    // Tiempo máximo de ejecución para consultas (en ms)
    queryTimeout: 5000
  }
};
```

## Enmascaramiento de datos sensibles

Puedes configurar reglas para enmascarar o filtrar datos sensibles:

```javascript
module.exports = {
  // Configuración básica...

  security: {
    dataMasking: [
      {
        // Enmascarar columnas específicas
        columns: ['CREDIT_CARD_NUMBER', 'SSN', 'PASSWORD'],
        pattern: /^.*/,
        replacement: '************'
      },
      {
        // Enmascarar parcialmente emails
        columns: ['EMAIL'],
        pattern: /^(.{3})(.*)(@.*)$/,
        replacement: '$1***$3'
      }
    ],

    // Filtros de línea para excluir datos sensibles
    rowFilters: {
      'CUSTOMERS': 'GDPR_CONSENT = 1',  // Solo mostrar clientes con consentimiento GDPR
      'EMPLOYEES': 'IS_PUBLIC_PROFILE = 1'  // Solo perfiles públicos de empleados
    }
  }
};
```

## Limitaciones de volumen de datos

Configura límites para prevenir consultas que consumen demasiados recursos:

```javascript
module.exports = {
  // Configuración básica...

  security: {
    resourceLimits: {
      // Límite de filas por consulta
      maxRowsPerQuery: 5000,

      // Límite de tamaño de resultado (en bytes)
      maxResponseSize: 1024 * 1024 * 5,  // 5 MB

      // Límite de tiempo de CPU por consulta (ms)
      maxQueryCpuTime: 10000,

      // Límite de consultas por sesión
      maxQueriesPerSession: 100,

      // Limitación de tasa (consultas por minuto)
      rateLimit: {
        queriesPerMinute: 60,
        burstLimit: 20
      }
    }
  }
};
```

## Integración con sistemas de autorización externos

MCP Firebird puede integrarse con sistemas de autorización externos para un control de acceso más preciso:

```javascript
module.exports = {
  // Configuración básica...

  security: {
    authorization: {
      // Usar un servicio de autorización externo
      type: 'oauth2',

      // Configuración para OAuth2
      oauth2: {
        tokenVerifyUrl: 'https://auth.example.com/verify',
        clientId: 'mcp-firebird-client',
        clientSecret: process.env.OAUTH_CLIENT_SECRET,
        scope: 'database:read'
      },

      // Mapeo de roles a permisos
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

## Ejemplos prácticos de seguridad

### Ejemplo 1: Servidor MCP para análisis de ventas

```javascript
// config-sales-analysis.js
module.exports = {
  database: process.env.FIREBIRD_DATABASE,
  user: process.env.FIREBIRD_USER,
  password: process.env.FIREBIRD_PASSWORD,

  security: {
    // Acceso limitado a tablas de ventas
    allowedTables: [
      'SALES', 'PRODUCTS', 'CUSTOMERS', 'REGIONS',
      'SALES_TARGETS', 'PRODUCT_CATEGORIES'
    ],

    // Solo permitir consultas SELECT
    allowedOperations: ['SELECT'],

    // Enmascarar datos sensibles de clientes
    dataMasking: [
      {
        columns: ['CUSTOMER_EMAIL', 'CUSTOMER_PHONE'],
        pattern: /^.*/,
        replacement: '[REDACTED]'
      }
    ],

    // Límites de recursos
    resourceLimits: {
      maxRowsPerQuery: 10000,
      maxQueryCpuTime: 5000
    }
  }
};
```

### Ejemplo 2: Servidor MCP para gestión de inventario

```javascript
// config-inventory.js
module.exports = {
  database: process.env.FIREBIRD_DATABASE,
  user: process.env.FIREBIRD_USER,
  password: process.env.FIREBIRD_PASSWORD,

  security: {
    // Acceso a tablas de inventario
    allowedTables: [
      'INVENTORY', 'PRODUCTS', 'WAREHOUSES',
      'STOCK_MOVEMENTS', 'SUPPLIERS'
    ],

    // Permitir operaciones de lectura y escritura limitadas
    allowedOperations: ['SELECT', 'INSERT', 'UPDATE'],

    // Prevenir modificación de registros históricos
    rowFilters: {
      'STOCK_MOVEMENTS': 'MOVEMENT_DATE > DATEADD(-30 DAY TO CURRENT_DATE)'
    },

    // Auditoría completa
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

### Ejemplo 3: Configuración para desarrollo y pruebas

```javascript
// config-development.js
module.exports = {
  database: process.env.FIREBIRD_DATABASE_DEV,
  user: process.env.FIREBIRD_USER_DEV,
  password: process.env.FIREBIRD_PASSWORD_DEV,

  security: {
    // En desarrollo, permitir más operaciones
    allowedOperations: ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE'],

    // Excluir solo tablas críticas
    forbiddenTables: ['SYSTEM_CONFIG', 'APP_SECRETS'],

    // Limitar impacto de consultas pesadas
    resourceLimits: {
      maxRowsPerQuery: 1000,
      maxQueryCpuTime: 3000,
      queriesPerMinute: 120
    },

    // Auditoría básica
    audit: {
      enabled: true,
      destination: 'file',
      auditFile: './logs/dev-audit.log',
      detailLevel: 'basic'
    }
  }
};
```

## Opciones de seguridad SQL

MCP Firebird proporciona opciones adicionales para controlar la seguridad de las consultas SQL:

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

Para usar esta configuración con Claude Desktop:

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
        "C:\\ruta\\a\\tu\\security-config.json"
    ],
    "command": "npx",
    "type": "stdio"
}
```

## Validación de consultas SQL

MCP Firebird incluye validación de consultas SQL para prevenir inyección SQL. Esta validación se realiza antes de ejecutar cualquier consulta.

```javascript
// Ejemplo de validación de consulta SQL
const isSafe = validateSql("SELECT * FROM EMPLOYEES WHERE ID = ?");
```

## Implementación del enmascaramiento de datos

El enmascaramiento de datos se implementa a nivel de aplicación, aplicando reglas de transformación a los resultados de las consultas antes de devolverlos al cliente:

```typescript
// Ejemplo de implementación de enmascaramiento de datos
function maskSensitiveData(results: any[]): any[] {
    if (!securityConfig.dataMasking || securityConfig.dataMasking.length === 0) {
        return results;
    }

    try {
        // Crear una copia profunda de los resultados para evitar modificar el original
        const maskedResults = JSON.parse(JSON.stringify(results));

        // Aplicar cada regla de enmascaramiento
        for (const rule of securityConfig.dataMasking) {
            const { columns, pattern, replacement } = rule;

            // Convertir patrón de string a RegExp si es necesario
            const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;

            // Aplicar la regla a cada fila
            for (const row of maskedResults) {
                for (const column of columns) {
                    if (column in row && row[column] !== null && row[column] !== undefined) {
                        // Aplicar el enmascaramiento
                        const originalValue = String(row[column]);
                        row[column] = originalValue.replace(regex, replacement);
                    }
                }
            }
        }

        return maskedResults;
    } catch (error) {
        logger.error(`Error al enmascarar datos sensibles: ${error.message}`);
        return results;
    }
}
```

## Mejores prácticas

1. **No exponer credenciales**: No incluyas credenciales de base de datos en el código fuente.
2. **Usar variables de entorno**: Almacena información sensible en variables de entorno o archivos `.env` que no se incluyan en el control de versiones.
3. **Actualizar regularmente**: Mantén MCP Firebird y sus dependencias actualizadas.
4. **Auditoría**: Implementa registro de auditoría para operaciones sensibles.
5. **Backup**: Realiza copias de seguridad regulares de tus bases de datos.
6. **Principio de mínimo privilegio**: Configura cada instancia de MCP Firebird con acceso solo a las tablas y operaciones que realmente necesita.
7. **Segmentación**: Usa diferentes instancias de MCP Firebird para diferentes casos de uso, cada una con su propia configuración de seguridad.

## Ejemplo de configuración segura

```bash
# Configuración de base de datos con usuario de privilegios limitados
export FIREBIRD_USER=app_user
export FIREBIRD_PASSWORD=strong_password
export FIREBIRD_DATABASE=/path/to/database.fdb

# Configuración de transporte seguro
export TRANSPORT_TYPE=sse
export SSE_PORT=3003
export SSL_CERT=/path/to/cert.pem
export SSL_KEY=/path/to/key.pem

# Configuración de seguridad
export SECURITY_CONFIG=/path/to/security-config.json

# Iniciar MCP Firebird
npx mcp-firebird
```
