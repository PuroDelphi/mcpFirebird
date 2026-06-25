# Triggers y Eventos Proactivos (POST_EVENT)

MCP Firebird integra soporte nativo para el sistema de eventos asíncronos de Firebird. Esto significa que cuando se ejecuta un `POST_EVENT` dentro de un trigger o un procedimiento almacenado en tu base de datos, el servidor MCP escucha el evento y notifica en tiempo real a tu cliente (LLM, Claude o n8n).

## ¿Cómo funciona?

1. Una acción ocurre en la base de datos (ej. un registro es insertado) y el Trigger de Firebird ejecuta `POST_EVENT 'NUEVA_ORDEN'`.
2. El servidor MCP, que usa el driver nativo (`node-firebird-driver-native`), intercepta de manera asíncrona este evento.
3. El servidor MCP envía una notificación proactiva `notifications/resources/updated` al cliente, usando **Streamable HTTP / SSE**.
4. El cliente (por ejemplo, Claude) recibe la notificación de que el recurso `firebird://events/NUEVA_ORDEN` se ha actualizado, pudiendo proceder a consultar qué cambió.

> [!WARNING]
> Para usar esta característica **DEBES** estar utilizando el transporte **Streamable HTTP (SSE)**. El transporte stdio clásico por lo general no soporta la entrega eficiente de notificaciones del servidor sin que el cliente las solicite activamente. Además, debes tener instalado el driver nativo `node-firebird-driver-native`.

## Cómo Usarlo (Ejemplo Detallado)

### 1. Configura el evento en Firebird

Crea un Trigger en tu base de datos para disparar el evento cuando algo importe suceda:

```sql
CREATE OR ALTER TRIGGER TRG_NUEVA_ORDEN FOR ORDERS
ACTIVE AFTER INSERT POSITION 0
AS
BEGIN
    POST_EVENT 'NUEVA_ORDEN';
END
```

### 2. Suscribe tu cliente MCP al evento

Tu agente de IA (LLM) o flujo de n8n debe usar la herramienta `subscribe_to_event` para decirle al servidor que está interesado en ese evento.

**Solicitud al servidor (Llamando la herramienta):**
- Nombre de la herramienta: `subscribe_to_event`
- Argumentos: `{"eventName": "NUEVA_ORDEN"}`

### 3. ¡Espera la Notificación!

El cliente MCP, que está escuchando a través del Stream HTTP (SSE), recibirá instantáneamente una notificación cuando se haga un INSERT en la tabla `ORDERS`. 

El cliente recibe una notificación de que el URI `firebird://events/NUEVA_ORDEN` ha cambiado, y puede proceder a usar `read_resource` para leer el estado del evento, o ejecutar una consulta SQL para revisar el nuevo dato.

## Ventajas para Agentes Inteligentes

En lugar de que tu agente LLM pregunte cada 5 minutos "¿Hay alguna orden nueva?" usando consultas repetitivas que sobrecargan la base de datos, el agente simplemente se suscribe y "duerme". Cuando el evento ocurre, el agente se despierta y reacciona. ¡Esto es automatización proactiva real!
