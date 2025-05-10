// Script para probar el servidor SSE
import dotenv from 'dotenv';
import { createServer } from 'http';
import { startSseServer } from './dist/server/sse.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger } from './dist/utils/logger.js';

// Cargar variables de entorno
dotenv.config();

const logger = createLogger('test-sse');

// Configurar puerto
const port = parseInt(process.env.SSE_PORT || '3003', 10);

// Crear un servidor MCP simple para pruebas
const mcpServer = new McpServer();

// Registrar un manejador simple para pruebas
mcpServer.methods = {
  echo: async (params) => {
    logger.info('Received echo request', { params });
    return { message: 'Echo: ' + JSON.stringify(params) };
  }
};

// Iniciar el servidor SSE
async function startServer() {
  try {
    logger.info(`Starting SSE server on port ${port}...`);

    // Iniciar el servidor SSE
    const { app, cleanup } = await startSseServer(mcpServer, port);

    logger.info(`SSE server started successfully on port ${port}`);

    // Manejar señales de terminación
    process.on('SIGINT', async () => {
      logger.info('Shutting down server...');
      await cleanup();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Shutting down server...');
      await cleanup();
      process.exit(0);
    });

    // Mantener el proceso vivo
    logger.info('Server is running. Press Ctrl+C to stop.');
  } catch (error) {
    logger.error('Failed to start SSE server', { error });
    process.exit(1);
  }
}

// Iniciar el servidor
startServer().catch((error) => {
  logger.error('Unhandled error', { error });
  process.exit(1);
});
