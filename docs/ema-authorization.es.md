# Autorización Gestionada Empresarial (EMA)

Cuando expones un servidor MCP en una red (por ejemplo, para conectarlo a un flujo de trabajo en n8n remoto), se crea un problema de seguridad: **no quieres que las credenciales de tu base de datos viajen por la red ni que el cliente LLM tenga acceso directo a la contraseña `SYSDBA`.**

Para solucionar esto de manera profesional, MCP Firebird introduce la **Autorización Gestionada (EMA)**.

## ¿Qué es EMA?

EMA permite al servidor MCP actuar como un intermediario seguro. El servidor guarda la contraseña real de la base de datos de manera local y en su lugar exige a los clientes externos un simple `--api-key` o Token Bearer.

Cuando el cliente se conecta proporcionando el API Key correcto, el servidor MCP autoriza la conexión e "inyecta" internamente la contraseña real de la base de datos para realizar las consultas. De esta manera, el cliente remoto jamás conoce la contraseña de la base de datos.

## Cómo Configurar EMA

### 1. Configurar el Servidor

Inicia el servidor MCP Firebird definiendo dos cosas vitales:
1. La contraseña REAL de la base de datos (se usa `--password` o `FIREBIRD_PASSWORD`).
2. El API Key secreto que usarán los clientes externos (se usa `--api-key` o `FIREBIRD_API_KEY`).

```bash
# Variables de entorno recomendadas para despliegues seguros:
export FIREBIRD_PASSWORD=LaContraseñaRealYSecreta
export FIREBIRD_API_KEY=TokenSuperSeguro123

# Iniciar servidor
mcp-firebird --database /ruta/a/base.fdb --user SYSDBA
```

Si prefieres línea de comandos:
```bash
mcp-firebird --database /ruta/a/base.fdb --user SYSDBA --password "LaContraseñaRealYSecreta" --api-key "TokenSuperSeguro123"
```

### 2. Configurar el Cliente Externo

Ahora, cualquier cliente (n8n, un script custom de Python, u otro LLM remoto) que intente conectarse al servidor por HTTP/SSE necesitará proporcionar ese token. No necesitarán la contraseña de la base de datos.

Si usas el SDK de TypeScript con `StreamableHTTPClientTransport`, puedes pasar las cabeceras directamente:

```typescript
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// El cliente DEBE enviar la cabecera Authorization con el token
const transport = new StreamableHTTPClientTransport(
    new URL("http://IP_DEL_SERVIDOR:3003/mcp"),
    {
        headers: {
            "Authorization": "Bearer TokenSuperSeguro123"
        }
    }
);

// Conectar normalmente
const client = new Client(...);
await client.connect(transport);
```

### Seguridad en Redes

> [!CAUTION]
> Si vas a exponer tu servidor MCP a Internet o a una red de área amplia, **SIEMPRE** debes colocar un proxy inverso (como Nginx o Caddy) con cifrado SSL/TLS (HTTPS) delante del servidor MCP. El API Key viajará en texto plano si la conexión es HTTP básica.
