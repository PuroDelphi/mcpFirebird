# Seguridad en MCP Firebird

Este documento describe las consideraciones de seguridad y opciones de configuración para MCP Firebird, incluyendo ejemplos detallados de todas las capacidades de seguridad implementadas.

## Consideraciones generales

### Cargar un archivo de configuración

Desde `2.10.0-alpha.2`, todos los puntos de entrada resuelven el archivo con esta prioridad:

1. Ruta explícita pasada a `initSecurity(ruta)` o `loadSecurityConfig(ruta)` por código.
2. `--security-config <ruta>` al usar la CLI (establece `FIREBIRD_SECURITY_CONFIG`).
3. Variable `FIREBIRD_SECURITY_CONFIG`.
4. Variable `SECURITY_CONFIG`.
5. Variable `SECURITY_CONFIG_PATH`, conservada por compatibilidad con `.env.example`.
6. Desde `2.11.0-alpha.1`, `FIREBIRD_SECURITY_JSON` si no se indica ninguna ruta de archivo.

Ejemplo de `security-config.json`:

```json
{
  "security": {
    "allowedTables": ["EMPLOYEES", "DEPARTMENTS"],
    "allowedOperations": ["SELECT"],
    "maxRows": 100
  }
}
```

Arranque por CLI:

```bash
npx -y mcp-firebird@alpha --security-config /absolute/path/security-config.json
```

También puedes definir `FIREBIRD_SECURITY_CONFIG` en el entorno del servidor, en `.env` o en el objeto `env` de tu cliente MCP. Conserva los parámetros habituales de conexión a Firebird. Reinicia el servidor después de cambiar la configuración.

Se admiten JSON y módulos CommonJS (`.cjs`, o `.js` en un contexto CommonJS) que exporten un objeto con la propiedad `security`. Los módulos CommonJS ejecutan código: usa únicamente archivos de confianza. Se recomiendan rutas absolutas; las relativas se resuelven desde el directorio de trabajo del proceso.

El registro debe mostrar `Loaded security configuration from ...`. Si no se indica archivo, se mantienen los valores predeterminados. Por compatibilidad, si el archivo no existe, no puede cargarse o no supera la validación, se registra el problema y se usan los valores predeterminados; comprueba el mensaje de carga antes de dar por aplicada tu política.

### Configuración JSON sin archivos

Desde `2.11.0-alpha.1`, puedes suministrar el objeto JSON completo mediante `FIREBIRD_SECURITY_JSON` en el entorno del proceso. Ejemplo para el objeto `env` de tu cliente MCP:

```json
{
  "FIREBIRD_SECURITY_JSON": "{\"security\":{\"allowedTables\":[\"EMPLOYEES\",\"DEPARTMENTS\"],\"allowedOperations\":[\"SELECT\"],\"maxRows\":100}}"
}
```

En PowerShell:

```powershell
$env:FIREBIRD_SECURITY_JSON = '{"security":{"allowedTables":["EMPLOYEES"],"allowedOperations":["SELECT"],"maxRows":100}}'
npx -y mcp-firebird@alpha
```

Conserva los parámetros habituales de conexión. Las rutas de archivo indicadas mediante CLI, API o variables de entorno tienen prioridad; elimina esas variables si quieres seleccionar el JSON. Las dos fuentes no se combinan. Los campos omitidos de una política válida conservan el comportamiento predeterminado. El objeto `{"security":{}}` selecciona explícitamente los valores predeterminados.

El JSON debe contener la propiedad `security` y cumplir el esquema de configuración. Se rechazan claves desconocidas en la raíz y en el objeto `security`. El límite es **64 KiB en UTF-8**, sujeto además a los límites de variables de entorno del sistema operativo. Si la fuente seleccionada es JSON vacío, mal formado, inválido o demasiado grande, se rechaza la inicialización; no se continúa silenciosamente con los valores predeterminados. Para no usar esta opción, elimina la variable en lugar de dejarla vacía.

Reinicia el servidor después de cambiarla y comprueba el mensaje `Loaded security configuration from FIREBIRD_SECURITY_JSON`. El contenido del JSON no se incluye en los registros ni en los errores de validación.

Solo debe definir esta variable el administrador o la aplicación de confianza que arranca el proceso MCP. Los clientes HTTP/SSE remotos no pueden modificarla mediante peticiones. Si utilizas `appsettings.json`, tu aplicación debe leerlo, serializar la política y pasarla como variable de entorno al crear el proceso; el MCP no lee `appsettings.json` automáticamente. Protege cualquier secreto incluido como el resto de credenciales del despliegue.

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
- **Autorización Gestionada (EMA)**: Protege las conexiones de red HTTP/SSE con tokens Bearer.
- **Auditoría**: Registro detallado de operaciones para fines de seguridad.

## Autorización Gestionada (EMA)

Para implementaciones en red (Streamable HTTP / SSE), la seguridad de acceso a nivel de transporte es crítica. MCP Firebird soporta EMA (Enterprise Managed Authorization) mediante claves de API estáticas.

**Configuración en el servidor:**
```bash
export FIREBIRD_API_KEY=mi_super_secreto_123
# O por argumento:
npx -y mcp-firebird --transport-type sse --api-key mi_super_secreto_123 ...
```

**Conexión desde el cliente:**
Los clientes deben enviar este token como un header `Authorization: Bearer`.
```typescript
const transport = new StreamableHTTPClientTransport(
    new URL("http://localhost:3003/mcp"),
    { headers: { "Authorization": "Bearer mi_super_secreto_123" } }
);
```

## Configuración de CORS

CORS solo afecta a clientes ejecutados dentro de un navegador. Los clientes STDIO, Claude Desktop, n8n y otros clientes de servidor no dependen de CORS.

Por compatibilidad, el valor predeterminado permite cualquier origen (`*`) y admite el encabezado `Authorization`. Las credenciales del navegador (cookies o autenticación HTTP automática) permanecen desactivadas, porque los navegadores no permiten combinar credenciales con un origen comodín.

Para restringir el acceso a uno o varios sitios web:

```bash
# Un solo origen
export MCP_ALLOWED_ORIGIN="https://app.example.com"

# Varios orígenes separados por comas
export MCP_ALLOWED_ORIGIN="https://app.example.com,https://admin.example.com"
```

En Windows PowerShell:

```powershell
$env:MCP_ALLOWED_ORIGIN="https://app.example.com,https://admin.example.com"
```

Los clientes deben enviar la clave mediante `Authorization: Bearer <token>`; no deben enviarla como cookie ni como parámetro de la URL.

## Consultas SQL de escritura

Las herramientas de consulta permiten `SELECT` y procedimientos autorizados de forma predeterminada. Las operaciones SQL directas de escritura o DDL (`INSERT`, `UPDATE`, `DELETE`, `CREATE`, etc.) están desactivadas para reducir el riesgo de que contenido no confiable induzca al LLM a modificar la base de datos.

En una instalación controlada que necesite conservar las escrituras directas:

```bash
export ALLOW_RAW_SQL=true
```

En Windows PowerShell:

```powershell
$env:ALLOW_RAW_SQL="true"
```

Activa esta opción únicamente con un usuario Firebird de privilegios mínimos. La herramienta `get-table-data` no acepta cláusulas SQL libres: usa `filters` y `orderBy` estructurados para parametrizar valores y validar nombres de columnas.

Ejemplo:

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

Operadores disponibles: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `like`, `in`, `isNull` e `isNotNull`.

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
npx -y mcp-firebird --config ./config.js
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
export FIREBIRD_API_KEY=mi_super_secreto_123

# Iniciar MCP Firebird
npx -y mcp-firebird
```
