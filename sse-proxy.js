// sse-proxy.js
// Un proxy simple para manejar las conexiones SSE entre el cliente y el servidor MCP Firebird

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import fetch from 'node-fetch';
import { spawn } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración
const PROXY_PORT = 3004;
const MCP_SERVER_PORT = 3003;
const MCP_SERVER_URL = `http://localhost:${MCP_SERVER_PORT}`;

// Crear la aplicación Express
const app = express();

// Habilitar CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-Session-ID', 'Authorization']
}));

// Parsear cuerpos JSON
app.use(express.json());

// Mapa para almacenar las conexiones SSE activas
const sessions = new Map();

// Función para iniciar el servidor MCP
async function startMcpServer() {
  console.log('Iniciando servidor MCP...');

  // Configurar variables de entorno
  process.env.TRANSPORT_TYPE = 'sse';
  process.env.SSE_PORT = MCP_SERVER_PORT.toString();

  // Iniciar el servidor MCP
  const child = spawn('node', ['dist/index.js'], {
    env: process.env,
    stdio: 'inherit',
    shell: true
  });

  // Manejar salida del proceso
  child.on('exit', (code) => {
    console.log(`Servidor MCP finalizado con código ${code}`);
    process.exit(code);
  });

  // Esperar a que el servidor esté listo
  await new Promise(resolve => setTimeout(resolve, 2000));

  return child;
}

// Endpoint SSE
app.get('/', async (req, res) => {
  try {
    console.log('Nueva conexión SSE recibida');

    // Configurar la respuesta para SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Crear una conexión SSE con el servidor MCP
    const sseResponse = await fetch(`${MCP_SERVER_URL}`, {
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream'
      }
    });

    if (!sseResponse.ok) {
      throw new Error(`Error al conectar con el servidor MCP: ${sseResponse.status} ${sseResponse.statusText}`);
    }

    console.log('Conexión SSE establecida con el servidor MCP');

    // Generar un ID de sesión para el cliente
    const clientId = `client-${Math.random().toString(36).substring(2, 14)}`;
    console.log(`ID de cliente generado: ${clientId}`);

    // Almacenar la sesión
    sessions.set(clientId, {
      res,
      createdAt: new Date(),
      lastActivity: new Date()
    });

    // Enviar el evento endpoint al cliente
    const endpointUrl = `${req.protocol}://${req.get('host')}/message?sessionId=${clientId}`;
    console.log(`Enviando endpoint: ${endpointUrl}`);
    res.write(`event: endpoint\ndata: ${endpointUrl}\n\n`);

    // Enviar un mensaje inicial
    res.write(`data: ${JSON.stringify({ type: 'connection', message: 'Conexión establecida' })}\n\n`);

    // Manejar la desconexión del cliente
    req.on('close', () => {
      console.log(`Cliente desconectado`);
      if (clientId) {
        console.log(`Eliminando sesión ${clientId}`);
        sessions.delete(clientId);
      }
    });

    // Mantener la conexión viva enviando un comentario cada 30 segundos
    const keepAliveInterval = setInterval(() => {
      if (res.writableEnded) {
        clearInterval(keepAliveInterval);
        return;
      }
      res.write(': keepalive\n\n');
    }, 30000);

  } catch (error) {
    console.error(`Error al establecer la conexión SSE: ${error.message}`);
    if (!res.headersSent) {
      res.status(500).send({
        error: 'Error al establecer la conexión SSE',
        message: error.message
      });
    }
  }
});

// Ya no necesitamos esta función porque el servidor MCP maneja las sesiones correctamente

// Endpoint para mensajes
app.post('/message', async (req, res) => {
  try {
    // Obtener el ID de sesión del parámetro de consulta
    const sessionId = req.query.sessionId?.toString();

    if (!sessionId) {
      throw new Error('Se requiere un ID de sesión');
    }

    console.log(`Mensaje recibido del cliente para la sesión ${sessionId}`);

    // Obtener la sesión
    const session = sessions.get(sessionId);
    if (!session) {
      throw new Error(`No se encontró una sesión activa para el ID: ${sessionId}`);
    }

    // Actualizar la última actividad
    session.lastActivity = new Date();

    // Obtener el ID de sesión del servidor MCP
    const mcpSessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

    // Crear una sesión en el servidor MCP
    try {
      const sseResponse = await fetch(`${MCP_SERVER_URL}?sessionId=${mcpSessionId}`, {
        method: 'GET',
        headers: {
          'Accept': 'text/event-stream'
        }
      });

      if (!sseResponse.ok) {
        throw new Error(`Error al conectar con el servidor MCP: ${sseResponse.status} ${sseResponse.statusText}`);
      }

      console.log(`Sesión creada en el servidor MCP: ${mcpSessionId}`);
    } catch (error) {
      console.error(`Error al crear la sesión en el servidor MCP: ${error.message}`);
      throw error;
    }

    // Reenviar la solicitud al servidor MCP
    const mcpResponse = await fetch(`${MCP_SERVER_URL}/message?sessionId=${mcpSessionId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-ID': mcpSessionId
      },
      body: JSON.stringify(req.body)
    });

    // Verificar si la respuesta es exitosa
    if (!mcpResponse.ok) {
      const errorText = await mcpResponse.text();
      console.error(`Error del servidor MCP: ${errorText}`);

      // Intentar parsear el error como JSON
      try {
        const errorJson = JSON.parse(errorText);
        res.status(mcpResponse.status).json(errorJson);
      } catch (e) {
        // No es JSON, enviar como texto
        res.status(mcpResponse.status).send(errorText);
      }
      return;
    }

    // Obtener la respuesta del servidor MCP
    const responseData = await mcpResponse.json();

    // Enviar la respuesta al cliente
    res.json(responseData);

    // También enviar la respuesta a través de SSE
    if (session.res && !session.res.writableEnded) {
      session.res.write(`data: ${JSON.stringify(responseData)}\n\n`);
    }

  } catch (error) {
    console.error(`Error al manejar el mensaje: ${error.message}`);

    // Solo enviar una respuesta si los encabezados no se han enviado aún
    if (!res.headersSent) {
      res.status(400).json({
        jsonrpc: '2.0',
        id: req.body?.id,
        error: {
          code: -32603,
          message: error.message || 'Error interno del servidor',
          data: { type: 'TRANSPORT_ERROR' }
        }
      });
    }
  }
});

// Iniciar el servidor proxy
async function startProxy() {
  try {
    // Iniciar el servidor MCP
    const mcpServer = await startMcpServer();

    // Iniciar el servidor proxy
    const server = createServer(app);
    server.listen(PROXY_PORT, () => {
      console.log(`Proxy SSE escuchando en el puerto ${PROXY_PORT}`);
      console.log(`Redirigiendo solicitudes a ${MCP_SERVER_URL}`);
    });

    // Manejar la señal de terminación
    process.on('SIGINT', async () => {
      console.log('Cerrando el servidor proxy...');
      server.close();

      // Matar el servidor MCP
      if (mcpServer) {
        mcpServer.kill();
      }

      process.exit(0);
    });
  } catch (error) {
    console.error(`Error al iniciar el proxy: ${error.message}`);
    process.exit(1);
  }
}

// Iniciar el proxy
startProxy().catch(console.error);
