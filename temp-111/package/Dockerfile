# Usar Node.js LTS como imagen base
FROM node:20-slim

# Instalar dependencias de Firebird
RUN apt-get update && apt-get install -y \
    firebird3.0-server \
    firebird3.0-utils \
    && rm -rf /var/lib/apt/lists/*

# Crear directorio de trabajo
WORKDIR /app

# Copiar archivos del proyecto
COPY package*.json ./
COPY server.js ./
COPY start-mcp-firebird.js ./
COPY version.js ./

# Instalar dependencias
RUN npm install

# Exponer puertos
EXPOSE 3001
EXPOSE 3002

# Variables de entorno por defecto
ENV PORT=3001
ENV WS_PORT=3002
ENV FB_HOST=localhost
ENV FB_PORT=3050
ENV FB_USER=sysdba
ENV FB_PASSWORD=masterkey
ENV MAX_CONNECTIONS=50
ENV QUERY_TIMEOUT=30000
ENV LOG_LEVEL=debug

# Crear directorio para la base de datos
RUN mkdir -p /data && \
    chown -R node:node /data

# Cambiar al usuario node por seguridad
USER node

# Comando para iniciar el servidor
CMD ["node", "start-mcp-firebird.js"] 