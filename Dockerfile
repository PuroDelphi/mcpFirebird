# Usar Node.js LTS como imagen base
FROM node:20-alpine

# No se requiere instalar el cliente de Firebird ya que MCP Firebird incluye su propio cliente Node.js

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