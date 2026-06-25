# Eventos Proactivos y Streaming Bidireccional en MCP 2.7+

A partir de la versión MCP 2.7+, el servidor MCP Firebird soporta completamente **Streamable HTTP** y **Eventos Proactivos** (Triggers `POST_EVENT` de Firebird). Esto permite que la base de datos notifique a los clientes MCP en tiempo real cuando ocurren cambios.

## ¿Qué son los Eventos Proactivos?

En lugar de que el cliente (como un LLM o n8n) consulte repetidamente la base de datos para ver si algo cambió (Polling), Firebird puede emitir un evento en el momento exacto en que ocurre el cambio usando la instrucción `POST_EVENT`. 
A través de MCP con transporte HTTP/SSE, el servidor MCP escucha estos eventos y los retransmite instantáneamente al cliente.

### Requisitos

1. **Transporte de red**: Debe usarse `TRANSPORT_TYPE=sse` o `TRANSPORT_TYPE=unified` o `http`. El transporte `stdio` no soporta el envío de notificaciones proactivas de eventos desde el servidor hacia el cliente en MCP estándar.
2. **Controlador Nativo**: La escucha de eventos requiere el controlador nativo de Firebird. Debes iniciar el servidor con la bandera `--use-native-driver`.

## Configuración Rápida

### 1. En la Base de Datos (Firebird)

Primero, necesitas crear un trigger en tu base de datos que dispare el evento:

```sql
CREATE OR ALTER TRIGGER TRG_NEW_ORDER FOR ORDERS
ACTIVE AFTER INSERT POSITION 0
AS
BEGIN
  -- Dispara un evento llamado 'NEW_ORDER'
  POST_EVENT 'NEW_ORDER';
END
```

### 2. Iniciar el Servidor MCP

Inicia el servidor habilitando el driver nativo, un puerto para SSE/HTTP y opcionalmente autenticación (EMA):

```bash
npx -y mcp-firebird \
  --transport-type sse \
  --sse-port 3003 \
  --use-native-driver \
  --database /ruta/a/base.fdb \
  --user SYSDBA \
  --password masterkey \
  --api-key tu_clave_secreta
```

### 3. Suscribirse desde el Cliente

El cliente puede usar la herramienta `subscribe_to_event` para comenzar a escuchar. Cuando el evento ocurra en la base de datos, el cliente MCP recibirá una notificación del sistema.

Ejemplo desde un cliente con el SDK de TypeScript:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const transport = new StreamableHTTPClientTransport(
  new URL("http://localhost:3003/mcp"),
  { headers: { Authorization: "Bearer tu_clave_secreta" } }
);

const client = new Client(
    { name: "mi-cliente", version: "1.0.0" },
    { capabilities: { resources: { subscribe: true } } }
);

await client.connect(transport);

// Manejador de notificaciones
client.setNotificationHandler("notifications/message", (notification) => {
    console.log("¡Evento recibido!", notification);
});

// Suscribirse al evento de Firebird
await client.callTool({
  name: "subscribe_to_event",
  arguments: { eventName: "NEW_ORDER" }
});

console.log("Escuchando eventos...");
```

## Casos de Uso

* **Automatización en Tiempo Real (n8n/Make):** Dispara un flujo de trabajo inmediatamente después de que se inserte un registro, en lugar de consultar cada minuto.
* **Sincronización de Caché:** Invalida cachés locales cuando cambian los catálogos en la base de datos.
* **Agentes Proactivos:** Un LLM que está "durmiendo" puede ser despertado por una notificación de evento para analizar una anomalía justo cuando ocurre.
