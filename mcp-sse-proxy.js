// mcp-sse-proxy.js
// Proxy para manejar conexiones SSE con el servidor MCP Firebird

import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

// Función para generar un ID aleatorio
function generateRandomId() {
  return Math.random().toString(36).substring(2, 10);
}

// Configuración
const PORT = process.env.PORT || 3004;
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3003';

// Crear la aplicación Express
const app = express();

// Habilitar CORS
app.use(cors());

// Parsear JSON
app.use(express.json());

// Almacenar las sesiones activas
const sessions = new Map();

// Endpoint SSE
app.get('/', async (req, res) => {
  try {
    // Generar un ID de sesión único
    const clientId = `client-${generateRandomId()}`;
    console.log(`Nueva conexión SSE recibida, clientId: ${clientId}`);

    // Configurar la respuesta para SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Almacenar la sesión del cliente
    sessions.set(clientId, {
      res,
      createdAt: new Date(),
      lastActivity: new Date(),
      mcpSessionId: null
    });

    // Generar un ID de sesión para el servidor MCP
    const mcpSessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

    // Almacenar el ID de sesión del servidor MCP
    const session = sessions.get(clientId);
    if (session) {
      session.mcpSessionId = mcpSessionId;
    }

    // Enviar el evento endpoint al cliente
    const endpointUrl = `/message?sessionId=${clientId}`;
    res.write(`event: endpoint\ndata: ${endpointUrl}\n\n`);

    console.log(`Sesión creada para el cliente ${clientId} con ID de sesión MCP ${mcpSessionId}`);

    // Enviar un mensaje inicial
    res.write(`data: ${JSON.stringify({ type: 'connection', message: 'Conexión establecida' })}\n\n`);

    // Manejar la desconexión del cliente
    req.on('close', () => {
      console.log(`Cliente desconectado para la sesión ${clientId}`);
      sessions.delete(clientId);
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

    // Solo enviar una respuesta si los encabezados no se han enviado aún
    if (!res.headersSent) {
      res.status(500).send({
        error: 'Error al establecer la conexión SSE',
        message: error.message
      });
    }
  }
});

// Endpoint para mensajes
app.post('/message', async (req, res) => {
  try {
    // Obtener el ID de sesión del parámetro de consulta
    const clientId = req.query.sessionId?.toString();

    if (!clientId) {
      throw new Error('Se requiere un ID de sesión');
    }

    console.log(`Mensaje recibido del cliente para la sesión ${clientId}`);

    // Obtener la sesión
    const session = sessions.get(clientId);
    if (!session) {
      throw new Error(`No se encontró una sesión activa para el ID: ${clientId}`);
    }

    // Actualizar la última actividad
    session.lastActivity = new Date();

    // Obtener el ID de sesión del servidor MCP
    const mcpSessionId = session.mcpSessionId;
    if (!mcpSessionId) {
      throw new Error('No hay un ID de sesión MCP disponible');
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

    console.log(`Solicitud enviada al servidor MCP para la sesión ${mcpSessionId}`);
    console.log(`URL: ${MCP_SERVER_URL}/message?sessionId=${mcpSessionId}`);
    console.log(`Cuerpo: ${JSON.stringify(req.body)}`);
    console.log(`Código de estado: ${mcpResponse.status}`);
    console.log(`Encabezados: ${JSON.stringify(Object.fromEntries(mcpResponse.headers.entries()))}`);


    // Obtener la respuesta del servidor MCP
    const mcpResponseText = await mcpResponse.text();

    // Intentar parsear la respuesta como JSON
    let mcpResponseJson;
    try {
      mcpResponseJson = JSON.parse(mcpResponseText);
    } catch (error) {
      console.error(`Error al parsear la respuesta del servidor MCP: ${error.message}`);
      console.error(`Respuesta del servidor MCP: ${mcpResponseText}`);

      // Enviar la respuesta como texto
      res.status(mcpResponse.status).send(mcpResponseText);
      return;
    }

    // Enviar la respuesta al cliente
    res.status(mcpResponse.status).json(mcpResponseJson);

    // Si la respuesta es un evento, enviarlo a través de SSE
    if (mcpResponseJson.event) {
      const eventName = mcpResponseJson.event;
      const eventData = JSON.stringify(mcpResponseJson.data || {});

      session.res.write(`event: ${eventName}\ndata: ${eventData}\n\n`);
    }
  } catch (error) {
    console.error(`Error al procesar el mensaje: ${error.message}`);

    // Enviar una respuesta de error
    res.status(500).json({
      jsonrpc: '2.0',
      id: req.body?.id,
      error: {
        code: -32603,
        message: error.message || 'Error interno del servidor'
      }
    });
  }
});

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Proxy SSE para MCP Firebird escuchando en el puerto ${PORT}`);
  console.log(`Redirigiendo solicitudes a ${MCP_SERVER_URL}`);
});
