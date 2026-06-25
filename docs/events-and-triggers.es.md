# Eventos y Streaming Bidireccional (MCP 2.3+)

A partir de la versión 2.8.0-alpha, `mcp-firebird` ofrece soporte completo para el sistema nativo de **Eventos (Triggers)** de Firebird a través del estándar de notificaciones bidireccionales introducido en MCP 2.3.

Esta característica permite a los clientes MCP (como n8n, Claude, o aplicaciones a la medida) suscribirse a eventos de la base de datos y recibir notificaciones en tiempo real **sin necesidad de consultar (polling) continuamente la base de datos**.

> [!IMPORTANT]
> **Requisito Fundamental**: Esta funcionalidad requiere de forma obligatoria el uso del **Driver Nativo de Firebird**. El driver JavaScript puro (`node-firebird`) no soporta la escucha asíncrona robusta de eventos sin perder la conexión, por lo cual es obligatorio habilitar el driver nativo.

---

## 1. ¿Cómo funcionan los Eventos en Firebird?

En Firebird, puedes definir `POST_EVENT 'nombre_del_evento';` dentro de Triggers (disparadores) o Procedimientos Almacenados (Stored Procedures). Cuando ocurre una acción en la base de datos (por ejemplo, insertar un nuevo registro), Firebird notifica inmediatamente a todos los clientes suscritos a ese evento.

### Ejemplo de creación de un Trigger en Firebird

Imagina que tienes una tabla `USERS` y quieres notificar cada vez que se inserta un nuevo usuario.

```sql
CREATE OR ALTER TRIGGER TRG_USERS_AFTER_INSERT FOR USERS
ACTIVE AFTER INSERT POSITION 0
AS
BEGIN
    /* Dispara el evento notificando que se agregó un usuario */
    POST_EVENT 'NEW_USER_CREATED';
END;
```

---

## 2. Cómo Configurar el Servidor MCP para Eventos

Dado que la característica requiere el **driver nativo**, debes iniciar el servidor MCP con el flag pertinente:

```bash
# Iniciar usando NPX (recomendado)
npx -y mcp-firebird --use-native-driver

# O si tienes configuración por Autorización Gestionada (EMA):
npx -y mcp-firebird --api-key="tu-clave"
```

El servidor reconocerá que estás usando el driver nativo y expondrá el sistema de eventos al cliente MCP.

---

## 3. Uso desde el Cliente MCP

El cliente MCP usará herramientas y recursos para interactuar con los eventos.

### Paso 1: Suscribirse al evento

El servidor expone una herramienta llamada `subscribe_to_event`. El LLM o tu flujo automatizado debe llamarla indicando el nombre del evento.

**Llamada a la herramienta:**
- **Herramienta:** `subscribe_to_event`
- **Argumentos:** `{"eventName": "NEW_USER_CREATED"}`

Una vez que se llame a esta herramienta, el servidor MCP hace lo siguiente:
1. Crea una conexión dedicada y persistente a la base de datos usando el driver nativo.
2. Registra el listener para `'NEW_USER_CREATED'`.
3. Instruye al cliente MCP a suscribirse a las notificaciones del recurso dinámico `firebird://events/NEW_USER_CREATED`.

### Paso 2: Recibir notificaciones (Streaming Bidireccional)

Cuando Firebird dispare el evento, el servidor MCP enviará inmediatamente una notificación JSON-RPC `notifications/resources/updated` al cliente, indicando que el recurso `firebird://events/NEW_USER_CREATED` ha cambiado.

El cliente (n8n, Claude Desktop, etc.) recibirá esta notificación en tiempo real. 

### Paso 3: Leer la información del evento

El cliente MCP, tras recibir la notificación de que el recurso fue actualizado, puede leer el estado del evento leyendo el recurso correspondiente.

**Llamada a lectura de recurso:**
- **URI:** `firebird://events/NEW_USER_CREATED`

**Respuesta devuelta por el servidor:**
```json
{
  "event": "NEW_USER_CREATED",
  "count": 1,
  "timestamp": "2026-06-25T16:00:31.000Z",
  "status": "active"
}
```

---

## 4. Preguntas Frecuentes

**¿Por qué falla diciendo `Error al conectar a la base de datos: unsupported on-disk structure for file...`?**
Si recibes este error al conectarte con el driver nativo, significa que la base de datos a la que te conectas tiene una versión de arquitectura (ODS) diferente a la que soporta tu `fbclient.dll` instalado localmente. 
*Solución*: Asegúrate de que el Firebird Client instalado en tu sistema operativo coincida con la versión de Firebird donde fue creada la base de datos (por ejemplo, instala el cliente 3.0 si la base de datos es ODS 12.0).

**¿Consume conexiones adicionales?**
Sí, el manejador de eventos del servidor MCP abre **una única conexión de base de datos extra** que se mantiene persistente exclusivamente para escuchar todos los eventos. Esta conexión permanece dormida y no bloquea el pool general de transacciones.
