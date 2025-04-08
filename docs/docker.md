# Configuración de Docker para MCP Firebird

Este documento describe cómo ejecutar MCP Firebird en un contenedor Docker.

## Dockerfile

Puedes ejecutar el servidor MCP Firebird en un contenedor Docker con soporte para transportes STDIO y SSE:

```dockerfile
# Usar Node.js LTS con Debian como imagen base
FROM node:20-slim

# Instalar herramientas cliente de Firebird para operaciones de backup/restore
RUN apt-get update && \
    apt-get install -y --no-install-recommends firebird3.0-utils && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Crear directorio de trabajo
WORKDIR /app

# Copiar archivos de configuración y dependencias
COPY package*.json ./
COPY tsconfig.json ./

# Instalar dependencias
RUN npm install

# Copiar el código fuente
COPY src/ ./src/
COPY run-sse-server.js ./
COPY run-sse-proxy.js ./
COPY run-inspector.cjs ./
COPY run-inspector.js ./

# Compilar el proyecto TypeScript
RUN npm run build

# Exponer puerto para SSE
EXPOSE 3003

# Variables de entorno por defecto
ENV FIREBIRD_HOST=localhost
ENV FIREBIRD_PORT=3050
ENV FIREBIRD_USER=SYSDBA
ENV FIREBIRD_PASSWORD=masterkey
ENV FIREBIRD_DATABASE=/firebird/data/database.fdb
ENV TRANSPORT_TYPE=stdio
ENV SSE_PORT=3003
ENV LOG_LEVEL=info

# Crear directorio para la base de datos
RUN mkdir -p /firebird/data && \
    chown -R node:node /firebird

# Cambiar al usuario node por seguridad
USER node

# Comando para iniciar el servidor (puede ser sobrescrito en docker-compose)
CMD ["node", "dist/index.js"]
```

## Docker Compose

```yaml
version: '3.8'

services:
  # Servidor de base de datos Firebird
  firebird-db:
    image: jacobalberty/firebird:3.0
    environment:
      ISC_PASSWORD: masterkey
      FIREBIRD_DATABASE: database.fdb
      FIREBIRD_USER: SYSDBA
    volumes:
      - firebird-data:/firebird/data
    ports:
      - "3050:3050"
    networks:
      - mcp-network

  # Servidor MCP Firebird con transporte STDIO (para Claude Desktop)
  mcp-firebird-stdio:
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      FIREBIRD_HOST: firebird-db
      FIREBIRD_PORT: 3050
      FIREBIRD_USER: SYSDBA
      FIREBIRD_PASSWORD: masterkey
      FIREBIRD_DATABASE: /firebird/data/database.fdb
      TRANSPORT_TYPE: stdio
    depends_on:
      - firebird-db
    networks:
      - mcp-network
    # Para uso con Claude Desktop, exponer STDIO
    stdin_open: true
    tty: true

  # Servidor MCP Firebird con transporte SSE (para clientes web)
  mcp-firebird-sse:
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      FIREBIRD_HOST: firebird-db
      FIREBIRD_PORT: 3050
      FIREBIRD_USER: SYSDBA
      FIREBIRD_PASSWORD: masterkey
      FIREBIRD_DATABASE: /firebird/data/database.fdb
      TRANSPORT_TYPE: sse
      SSE_PORT: 3003
    ports:
      - "3003:3003"
    depends_on:
      - firebird-db
    networks:
      - mcp-network
    command: node run-sse-server.js

  # Proxy SSE (opcional, para clientes que necesitan soporte de proxy)
  mcp-sse-proxy:
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      MCP_SERVER_URL: http://mcp-firebird-sse:3003
      PORT: 3005
    ports:
      - "3005:3005"
    depends_on:
      - mcp-firebird-sse
    networks:
      - mcp-network
    command: node run-sse-proxy.js

networks:
  mcp-network:
    driver: bridge

volumes:
  firebird-data:
```

## Ejecutar con Docker

```bash
# Construir y ejecutar con Docker Compose
docker compose up -d

# Ejecutar solo la versión STDIO (para Claude Desktop)
docker compose up -d mcp-firebird-stdio

# Ejecutar solo la versión SSE (para clientes web)
docker compose up -d mcp-firebird-sse

# Ejecutar la versión SSE con proxy (para clientes que necesitan soporte de proxy)
docker compose up -d mcp-firebird-sse mcp-sse-proxy

# Verificar logs
docker compose logs -f mcp-firebird-sse

# Detener servicios
docker compose down
```

## Conectar al servidor MCP Dockerizado

### Con Claude Desktop

Actualiza tu configuración de Claude Desktop para usar el contenedor Docker:

```json
{
  "mcpServers": {
    "mcp-firebird": {
      "command": "docker",
      "args": ["exec", "-i", "mcp-firebird-stdio", "node", "dist/index.js"],
      "type": "stdio"
    }
  }
}
```

### Con clientes web

Para conectar desde un cliente web, usa la URL del servidor SSE:

```javascript
const eventSource = new EventSource('http://localhost:3003');
```

### Con MCP Inspector

Para usar el MCP Inspector con el servidor Dockerizado:

```bash
npx @modelcontextprotocol/inspector http://localhost:3003
```
