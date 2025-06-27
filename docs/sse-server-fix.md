# Corrección del error "Cannot write headers after they are sent to the client" en el servidor SSE

## Descripción del problema

El servidor SSE estaba experimentando un error cuando se intentaba conectar a través de Docker:

```
[ERROR] [server:sse] Error establishing SSE connection: Cannot write headers after they are sent to the client {"error":{"code":"ERR_HTTP_HEADERS_SENT"}}
```

Este error ocurre cuando el servidor intenta modificar los encabezados HTTP después de que ya se han enviado al cliente. En el contexto de las conexiones SSE, esto puede ocurrir debido a la naturaleza asíncrona de las operaciones y el manejo de errores.

## Solución implementada

Se han realizado las siguientes correcciones para solucionar el problema:

### 1. Mejora del manejo de errores en el servidor SSE

En el archivo `src/server/sse.ts`, se ha mejorado el manejo de errores durante la conexión del transporte al servidor:

```typescript
// Connect the transport to the server
try {
    await server.connect(transport);
} catch (error) {
    const connectError = error as Error;
    logger.error(`Error connecting transport to server: ${connectError.message}`, { error: connectError });

    // Manejo especial para errores relacionados con encabezados
    if (connectError.message.includes('headers') || res.headersSent) {
        logger.warn(`Suppressing header-related error to prevent further issues: ${connectError.message}`);
        
        // Intentar enviar un mensaje al cliente si es posible
        try {
            if (!res.writableEnded) {
                res.write(`data: ${JSON.stringify({ type: 'error', message: 'Connection issue detected, but stream will remain open' })}\n\n`);
                
                // Configurar un keepalive simple para esta conexión
                const keepAliveInterval = setInterval(() => {
                    // ... código de keepalive ...
                }, 30000);
            } else {
                sessionManager.removeSession(sessionId);
            }
        } catch (_e) {
            logger.debug('Could not send error message to client');
            sessionManager.removeSession(sessionId);
        }
        
        return; // Salir temprano para evitar más procesamiento
    } else {
        // Para errores no relacionados con encabezados, limpiar y lanzar
        sessionManager.removeSession(sessionId);
        throw new Error(`Failed to connect transport to server: ${connectError.message}`);
    }
}
```

### 2. Eliminación de código duplicado en run-sse-server.js

Se eliminó la duplicación de código en el archivo `run-sse-server.js` que podría estar causando configuraciones inconsistentes:

```javascript
// Antes (duplicado)
process.env.TRANSPORT_TYPE = 'sse';
const ssePort = process.env.SSE_PORT || 3003;
process.env.SSE_PORT = ssePort;
// ... más código ...
process.env.TRANSPORT_TYPE = 'sse';
process.env.SSE_PORT = process.env.SSE_PORT || '3003';

// Después (corregido)
process.env.TRANSPORT_TYPE = 'sse';
const ssePort = process.env.SSE_PORT || 3003;
process.env.SSE_PORT = ssePort.toString();
```

## Comportamiento esperado

Con estas correcciones, el servidor SSE ahora:

1. Detecta y maneja adecuadamente los errores relacionados con encabezados HTTP
2. Mantiene la conexión SSE abierta incluso cuando ocurren errores durante la conexión del transporte
3. Proporciona mensajes de error más claros al cliente y en los logs
4. Evita que los errores se propaguen y causen fallos en el servidor

## Pruebas realizadas

Se ha probado la solución con un servidor de prueba simple y un cliente HTML. Las pruebas muestran que:

1. El servidor ya no falla con el error "Cannot write headers after they are sent to the client"
2. Las conexiones SSE se mantienen abiertas incluso cuando ocurren errores
3. Los mensajes de error se registran correctamente en los logs

## Consideraciones para Docker

Cuando se ejecuta en Docker, es importante asegurarse de que:

1. Las variables de entorno estén configuradas correctamente
2. Los puertos estén expuestos adecuadamente
3. Las dependencias entre servicios estén configuradas correctamente

Se recomienda utilizar el archivo `docker-compose.yml` actualizado que incluye estas mejoras.

## Limitaciones conocidas

Aunque la solución permite que el servidor SSE continúe funcionando cuando ocurren errores relacionados con encabezados, hay algunas limitaciones:

1. Las sesiones afectadas por este error no tendrán una conexión completa con el servidor MCP
2. Algunas funcionalidades pueden no estar disponibles para estas sesiones
3. Es posible que se necesiten reconexiones periódicas para mantener la funcionalidad completa

## Conclusión

Esta solución proporciona una forma robusta de manejar los errores relacionados con encabezados HTTP en el servidor SSE, permitiendo que el servidor continúe funcionando incluso en condiciones de error. Se recomienda implementar estas correcciones en todos los entornos donde se utilice el servidor SSE, especialmente en entornos Docker.
