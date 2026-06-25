# Streaming Bidireccional (Streamable HTTP / SSE) en MCP 2.3+

A partir de la versión MCP 2.3+, el servidor MCP Firebird soporta completamente **Streamable HTTP** utilizando Server-Sent Events (SSE). Este es el estándar moderno recomendado para entornos de red (como n8n, Claude Desktop en red, agentes remotos y despliegues en Docker).

## ¿Por qué usar Streamable HTTP?

A diferencia de la comunicación estándar por `stdio` (entrada/salida estándar), que requiere que el cliente y el servidor se ejecuten en la misma máquina física o contenedor, el transporte HTTP permite:

1. **Despliegues Separados:** Tu base de datos y servidor MCP pueden estar en una máquina segura, mientras que el cliente LLM o de automatización (como n8n) está en la nube o en otro servidor.
2. **Streaming Bidireccional:** A diferencia de las llamadas API HTTP tradicionales (REST), Streamable HTTP mantiene una conexión abierta persistente (usando SSE para enviar eventos del servidor al cliente, y solicitudes HTTP POST convencionales para enviar solicitudes del cliente al servidor).
3. **Manejo de Sesiones (Stateful Mode):** El cliente y el servidor establecen una sesión con un `mcp-session-id`, asegurando que el estado (como los eventos suscritos o cursores de paginación) se mantengan vivos.

## Configuración Rápida

Para habilitar este modo, debes configurar el entorno del servidor y luego apuntar a él desde tu cliente.

### 1. Iniciar el Servidor

Usa la variable de entorno `TRANSPORT_TYPE=sse`. 

```bash
export TRANSPORT_TYPE=sse
export SSE_PORT=3003
mcp-firebird --database /ruta/a/base.fdb --user SYSDBA
```

El servidor escuchará en el puerto especificado. En este caso, el endpoint de inicialización (McpServer) será `http://localhost:3003/mcp`.

### 2. Configurar el Cliente (Ejemplo con SDK de TypeScript)

Cuando configures un cliente de MCP (o un nodo en n8n que hable MCP), asegúrate de usar `StreamableHTTPClientTransport` o proporcionar la URL al endpoint.

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// Conectar usando el protocolo Streamable HTTP
const transport = new StreamableHTTPClientTransport(new URL("http://localhost:3003/mcp"));

const client = new Client(
    { name: "mi-cliente", version: "1.0.0" },
    { capabilities: { resources: { subscribe: true } } }
);

await client.connect(transport);
console.log("Conectado exitosamente por HTTP!");
```

### 3. Consideraciones de Red

- **CORS:** El servidor está configurado por defecto para admitir CORS (`Access-Control-Allow-Origin: *`).
- **Proxy Inverso:** Si utilizas Nginx, Caddy o similar, asegúrate de deshabilitar el "buffering" para las solicitudes SSE, de lo contrario, los eventos del servidor podrían no llegar en tiempo real al cliente.
  Ejemplo Nginx: `proxy_buffering off;`
