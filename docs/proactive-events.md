# Eventos Firebird y suscripciones MCP

Los eventos `POST_EVENT` se exponen como actualizaciones del recurso
`firebird://events/{eventName}`. La notificación contiene la URI, no filas ni un
payload del trigger. Lee el recurso para obtener el último contador observado y
su fecha. Los nombres de eventos se codifican en la URI.

Los eventos funcionan con stdio, Streamable HTTP (`/mcp`) y HTTP+SSE heredado
(`/sse` y `/messages`). El driver debe ofrecer `queueEvents` (nativo) o
`attachEvent` (JavaScript). Las bibliotecas nativas solo son necesarias al elegir
el driver nativo. La conexión de eventos del driver debe alcanzar Firebird.

## Ejemplo en la base de datos

```sql
CREATE OR ALTER TRIGGER TRG_NEW_ORDER FOR ORDERS
ACTIVE AFTER INSERT POSITION 0
AS
BEGIN
  POST_EVENT 'NEW_ORDER';
END
```

Crear el trigger es una acción administrativa independiente. El servidor MCP no
lo crea automáticamente ni modifica la autorización SQL.

## Clientes del protocolo 2025

1. Llama a `subscribe_to_event` con `{"eventName":"NEW_ORDER"}` para registrar
   el listener, o suscríbete directamente al recurso
2. Envía `resources/subscribe` con
   `{"uri":"firebird://events/NEW_ORDER"}`
3. Recibe `notifications/resources/updated` y lee esa URI cuando lo necesites
4. Envía `resources/unsubscribe` para liberar el registro

La herramienta por sí sola no activa las notificaciones MCP para clientes
heredados. Cada conexión/sesión tiene sus propios registros y suscripciones.
Desconectar un cliente no cancela los de otro. Las peticiones HTTP 2025 sin
sesión no mantienen suscripciones duraderas; utiliza un transporte con sesión.

## Clientes del protocolo 2026-07-28

Utiliza `subscriptions/listen` con estos parámetros (el cliente SDK puede
exponerlos como un filtro de suscripción):

```json
{
  "notifications": {
    "resourceSubscriptions": ["firebird://events/NEW_ORDER"]
  }
}
```

Incluye el sobre `_meta` normal del protocolo. El SDK valida la petición,
confirma las suscripciones aceptadas, filtra por URI exacta y etiqueta cada
actualización con el identificador de suscripción. La notificación correcta es
`notifications/resources/updated`, no `notifications/message`.

### HTTP

El stream validado de escucha es propietario del registro Firebird. No hace
falta llamar antes a una herramienta. Cierra o cancela ese stream para liberar
sus registros sin afectar a otros streams. El servidor no conserva una instancia
MCP temporal después de responder a una petición.

En HTTP moderno, `subscribe_to_event` y `unsubscribe_from_event` devuelven la URI
e instrucciones para abrir/cerrar el stream; no modifican registros persistentes.
Para reconectar, abre otro stream de escucha.

### stdio

Llama a `subscribe_to_event` y abre una suscripción `subscriptions/listen` para
su URI en la misma conexión. Cancelar la suscripción detiene la entrega. Utiliza
`unsubscribe_from_event` para liberar el registro Firebird, o cierra la conexión
para liberar todos sus eventos. El SDK solo entrega actualizaciones a las
suscripciones activas cuyo filtro coincida.

## Ciclo de vida, seguridad y límites

- Una conexión Firebird compartida escucha la unión de los registros activos
- Cada conexión MCP o stream HTTP tiene un propietario independiente
- Los registros duplicados comparten el listener; las publicaciones del bus HTTP
  se deduplican
- Cuando se desconecta el último propietario, se cancelan los eventos y se
  cierra la conexión; una suscripción posterior abre otra conexión limpia
- Los cambios se serializan y un fallo de registro revierte su propiedad
- El proceso admite hasta 128 nombres de evento distintos; el driver puede
  imponer un límite inferior y devolver un error
- La autorización por ámbito, las restricciones de tablas, los filtros de filas
  y el enmascaramiento desactivan esta función compartida; activar esas políticas
  también bloquea la entrega de listeners abiertos previamente

El contador lo proporciona el driver y no constituye un registro de auditoría
duradero. Las actualizaciones pueden agruparse o perderse durante una desconexión.
Si necesitas procesar cada cambio, utiliza consultas o una cola duradera propia.
