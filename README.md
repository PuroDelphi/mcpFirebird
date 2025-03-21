# MCP Firebird

Model Context Protocol (MCP) para Firebird que permite a los agentes de IA como Claude conectarse, extraer información y realizar operaciones CRUD en cualquier base de datos Firebird.

## ¿Qué es MCP?

El Model Context Protocol (MCP) es un protocolo de comunicación estandarizado que permite a los agentes de IA interactuar con sistemas externos de manera segura y eficiente. Este MCP implementa las mejores prácticas de Anthropic para la comunicación entre agentes de IA y bases de datos.

## Características

- Implementación del protocolo MCP de Anthropic
- Conexión segura a bases de datos Firebird
- Pool de conexiones configurable
- Consultas dinámicas con timeout
- Información detallada de tablas
- Estadísticas de base de datos
- WebSocket para comunicación en tiempo real
- Soporte para Docker
- Instalación vía NPX
- Integración con Claude Desktop

## Instalación

### Vía NPX (Recomendado para Claude Desktop)

```bash
# Instalar globalmente
npm install -g mcp-firebird

# O usar directamente con npx
npx mcp-firebird
```

### Vía Docker

```bash
docker run -p 3001:3001 -p 3002:3002 \
  -e FB_HOST=localhost \
  -e FB_PORT=3050 \
  -e FB_DATABASE=/path/to/database.fdb \
  -e FB_USER=sysdba \
  -e FB_PASSWORD=masterkey \
  mcp-firebird
```

## Configuración

Crea un archivo `.env` en el directorio raíz:

```env
PORT=3001
WS_PORT=3002
FB_HOST=localhost
FB_PORT=3050
FB_DATABASE=/path/to/database.fdb
FB_USER=sysdba
FB_PASSWORD=masterkey
MAX_CONNECTIONS=50
QUERY_TIMEOUT=30000
LOG_LEVEL=debug
```

## Uso con Claude Desktop

### Ejemplo 1: Consulta Simple

```javascript
// En Claude Desktop
const mcp = await connect('mcp-firebird://localhost:3001');

// Ejecutar consulta
const result = await mcp.query({
  sql: 'SELECT * FROM tabla WHERE campo = ?',
  params: ['valor']
});

console.log(result);
```

### Ejemplo 2: Análisis de Estructura

```javascript
// En Claude Desktop
const mcp = await connect('mcp-firebird://localhost:3001');

// Obtener información de tabla
const tableInfo = await mcp.getTableInfo('mi_tabla');

// Analizar estructura
const analysis = await mcp.analyze({
  type: 'table_structure',
  table: 'mi_tabla',
  options: {
    includeIndexes: true,
    includeConstraints: true
  }
});

console.log(analysis);
```

### Ejemplo 3: Operaciones CRUD

```javascript
// En Claude Desktop
const mcp = await connect('mcp-firebird://localhost:3001');

// Crear registro
await mcp.insert('mi_tabla', {
  campo1: 'valor1',
  campo2: 'valor2'
});

// Leer registros
const registros = await mcp.select('mi_tabla', {
  where: { campo1: 'valor1' }
});

// Actualizar registro
await mcp.update('mi_tabla', {
  campo2: 'nuevo_valor'
}, {
  where: { campo1: 'valor1' }
});

// Eliminar registro
await mcp.delete('mi_tabla', {
  where: { campo1: 'valor1' }
});
```

### Ejemplo 4: Análisis de Datos

```javascript
// En Claude Desktop
const mcp = await connect('mcp-firebird://localhost:3001');

// Obtener estadísticas
const stats = await mcp.getStats();

// Analizar tendencias
const trends = await mcp.analyze({
  type: 'data_trends',
  table: 'mi_tabla',
  field: 'campo_numerico',
  period: 'monthly'
});

console.log(trends);
```

## Endpoints MCP

### HTTP

#### POST /mcp/query
Ejecuta una consulta SQL a través del protocolo MCP.

```json
{
  "jsonrpc": "2.0",
  "method": "query",
  "params": {
    "sql": "SELECT * FROM tabla WHERE campo = ?",
    "params": ["valor"],
    "options": {
      "timeout": 5000,
      "format": "json"
    }
  }
}
```

#### GET /mcp/tables/:tableName/info
Obtiene información detallada de una tabla.

```json
{
  "jsonrpc": "2.0",
  "method": "getTableInfo",
  "params": {
    "tableName": "mi_tabla",
    "options": {
      "includeIndexes": true,
      "includeConstraints": true
    }
  }
}
```

### WebSocket

#### Conexión MCP
```javascript
const ws = new WebSocket('ws://localhost:3002');

ws.onopen = () => {
  ws.send(JSON.stringify({
    jsonrpc: "2.0",
    method: "initialize",
    params: {
      clientId: "claude-desktop",
      capabilities: ["query", "analyze", "subscribe"]
    }
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Mensaje MCP recibido:', message);
};
```

## Seguridad

- Todas las conexiones son encriptadas
- Autenticación requerida para todas las operaciones
- Timeout configurable para consultas
- Límite de conexiones simultáneas
- Validación de consultas SQL
- Sanitización de parámetros
- Protección contra inyección SQL

## Contribuir

1. Fork el repositorio
2. Crea una rama para tu feature (`git checkout -b feature/amazing-feature`)
3. Commit tus cambios (`git commit -m 'Add some amazing feature'`)
4. Push a la rama (`git push origin feature/amazing-feature`)
5. Abre un Pull Request

## Licencia

Este proyecto está licenciado bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para más detalles.