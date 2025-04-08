# Configuración de MCP Firebird

Este documento describe las diferentes opciones de configuración disponibles para MCP Firebird.

## Variables de entorno

Puedes configurar el servidor usando variables de entorno:

```bash
# Configuración básica
export FIREBIRD_HOST=localhost
export FIREBIRD_PORT=3050
export FIREBIRD_DATABASE=/path/to/database.fdb
export FIREBIRD_USER=SYSDBA
export FIREBIRD_PASSWORD=masterkey
export FIREBIRD_ROLE=undefined  # Opcional

# Configuración de directorio (alternativa)
export FIREBIRD_DATABASE_DIR=/path/to/databases  # Directorio con bases de datos

# Configuración de logging
export LOG_LEVEL=info  # Opciones: debug, info, warn, error
```

Puedes crear un archivo `.env` en la raíz del proyecto para establecer estas variables. Se proporciona un archivo `.env.example` como plantilla.

## Archivo .env de ejemplo

```
FIREBIRD_HOST=localhost
FIREBIRD_PORT=3050
FIREBIRD_DATABASE=F:\Proyectos\SAI\EMPLOYEE.FDB
FIREBIRD_USER=SYSDBA
FIREBIRD_PASSWORD=masterkey
FIREBIRD_ROLE=

# Configuración de transporte
TRANSPORT_TYPE=stdio  # Opciones: stdio, sse
SSE_PORT=3003
```

## Uso con npx

Puedes ejecutar el servidor directamente con npx:

```bash
npx mcp-firebird --host localhost --port 3050 --database /path/to/database.fdb --user SYSDBA --password masterkey
```

## Transporte SSE (Server-Sent Events)

MCP Firebird soporta el transporte SSE para comunicación con clientes web:

```bash
# Ejecutar con transporte SSE
export TRANSPORT_TYPE=sse
export SSE_PORT=3003
npx mcp-firebird
```

O usando parámetros de línea de comandos:

```bash
npx mcp-firebird --transport-type sse --sse-port 3003
```

### Ejemplos de cliente SSE

```javascript
// Cliente JavaScript
const eventSource = new EventSource('http://localhost:3003');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
};

// Enviar solicitud
fetch('http://localhost:3003', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    id: '1',
    method: 'execute-query',
    params: {
      sql: 'SELECT * FROM RDB$RELATIONS'
    }
  })
});
```

## Configuración con Claude Desktop

Para usar el servidor MCP Firebird con Claude Desktop:

### Windows
```powershell
code $env:AppData\Claude\claude_desktop_config.json
```

### macOS/Linux
```bash
code ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

Añade la siguiente configuración:

```json
{
  "mcpServers": {
    "mcp-firebird": {
      "command": "npx",
      "args": [
        "mcp-firebird",
        "--host",
        "localhost",
        "--port",
        "3050",
        "--database",
        "C:\\Databases\\example.fdb",
        "--user",
        "SYSDBA",
        "--password",
        "masterkey"
      ],
      "type": "stdio"
    }
  }
}
```

> **Nota**: Asegúrate de usar rutas absolutas en la configuración.

Después de guardar el archivo, necesitas reiniciar Claude Desktop completamente.
