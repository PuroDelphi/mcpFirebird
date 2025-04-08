# Seguridad en MCP Firebird

Este documento describe las consideraciones de seguridad y opciones de configuración para MCP Firebird.

## Consideraciones generales

MCP Firebird proporciona acceso a bases de datos Firebird, lo que implica ciertos riesgos de seguridad. Considera las siguientes recomendaciones:

1. **Privilegios mínimos**: Usa un usuario de base de datos con los privilegios mínimos necesarios.
2. **Aislamiento**: Ejecuta MCP Firebird en un entorno aislado, como un contenedor Docker.
3. **Firewall**: Limita el acceso a los puertos utilizados por MCP Firebird.
4. **HTTPS**: Usa HTTPS para conexiones SSE en producción.
5. **Validación de entrada**: MCP Firebird valida las consultas SQL para prevenir inyección, pero es una buena práctica validar también en el cliente.

## Configuración de seguridad

Puedes configurar opciones de seguridad adicionales mediante un archivo de configuración:

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

## Validación de consultas SQL

MCP Firebird incluye validación de consultas SQL para prevenir inyección SQL. Esta validación se realiza antes de ejecutar cualquier consulta.

```javascript
// Ejemplo de validación de consulta SQL
const isSafe = validateSql("SELECT * FROM EMPLOYEES WHERE ID = ?");
```

## Mejores prácticas

1. **No exponer credenciales**: No incluyas credenciales de base de datos en el código fuente.
2. **Usar variables de entorno**: Almacena información sensible en variables de entorno o archivos `.env` que no se incluyan en el control de versiones.
3. **Actualizar regularmente**: Mantén MCP Firebird y sus dependencias actualizadas.
4. **Auditoría**: Implementa registro de auditoría para operaciones sensibles.
5. **Backup**: Realiza copias de seguridad regulares de tus bases de datos.

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

# Iniciar MCP Firebird
npx mcp-firebird
```
