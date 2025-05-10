# Solución de problemas con el servidor SSE

Este documento proporciona información para solucionar problemas comunes con el servidor SSE en MCP Firebird.

## Error: "Cannot write headers after they are sent to the client"

Este error ocurre cuando el servidor intenta enviar encabezados HTTP después de que ya se han enviado. Es un problema común en aplicaciones Node.js, especialmente en servidores SSE donde las conexiones son de larga duración.

### Síntomas

En los logs del servidor, verás mensajes como:

```
[ERROR] [server:sse] Error establishing SSE connection: Cannot write headers after they are sent to the client {"error":{"code":"ERR_HTTP_HEADERS_SENT"}}
```

### Causas

Las causas más comunes de este error son:

1. Intentar enviar una respuesta después de que los encabezados ya han sido enviados con `res.flushHeaders()`
2. Múltiples llamadas a `res.write()` o `res.send()` en el mismo manejador de solicitud
3. Errores asíncronos que ocurren después de que los encabezados ya han sido enviados
4. Configuración duplicada en scripts de inicio que causan comportamiento inconsistente

### Solución

Hemos implementado las siguientes mejoras para resolver este problema:

1. **Mejor manejo de errores en el servidor SSE**:
   - Captura de errores más específica en cada etapa del proceso de conexión
   - Verificación de `res.writableEnded` antes de intentar escribir en la respuesta
   - Limpieza adecuada de sesiones cuando ocurren errores

2. **Eliminación de código duplicado en `run-sse-server.js`**:
   - Se eliminó la configuración duplicada de variables de entorno
   - Se mejoró la consistencia en la configuración del puerto SSE

3. **Configuración mejorada de Docker**:
   - Se agregó un healthcheck para el servicio SSE
   - Se configuró correctamente la dependencia entre servicios
   - Se deshabilitó el proxy SSE por defecto para simplificar la configuración

4. **Mejor manejo de sesiones**:
   - Mejora en la limpieza de sesiones expiradas
   - Mejor manejo de errores al cerrar transportes
   - Logging mejorado para facilitar la depuración

## Cómo verificar que el problema está resuelto

1. Inicia los servicios con Docker Compose:
   ```bash
   docker compose up -d
   ```

2. Verifica los logs del servidor SSE:
   ```bash
   docker compose logs -f mcp-firebird-sse
   ```

3. Comprueba que el servidor está funcionando correctamente:
   ```bash
   curl http://localhost:3003/health
   ```

4. Intenta conectarte al servidor SSE desde un cliente:
   ```javascript
   const eventSource = new EventSource('http://localhost:3003');
   eventSource.onopen = () => console.log('Conexión establecida');
   eventSource.onerror = (error) => console.error('Error en la conexión SSE', error);
   ```

## Configuración avanzada

### Ajuste de tiempos de espera

Puedes ajustar el tiempo de espera de las sesiones SSE mediante la variable de entorno `SSE_SESSION_TIMEOUT_MS`. El valor predeterminado es 30 minutos (1800000 ms).

```yaml
environment:
  SSE_SESSION_TIMEOUT_MS: 3600000  # 1 hora
```

### Habilitación del proxy SSE

Si necesitas utilizar el proxy SSE (por ejemplo, para clientes que no pueden conectarse directamente al servidor SSE), puedes descomentar la sección correspondiente en el archivo `docker-compose.yml`.

### Configuración de logging

Para obtener más información de depuración, puedes ajustar el nivel de logging:

```yaml
environment:
  LOG_LEVEL: debug  # Opciones: debug, info, warn, error
```

## Problemas conocidos

- El proxy SSE puede causar problemas adicionales en ciertos entornos. Si no lo necesitas, es mejor mantenerlo deshabilitado.
- En algunos casos, los clientes pueden experimentar desconexiones si hay un proxy o balanceador de carga entre ellos y el servidor SSE. En estos casos, es recomendable ajustar los tiempos de espera en todos los componentes de la cadena.
