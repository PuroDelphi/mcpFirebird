// mcp-sse-proxy.js
// Proxy para manejar conexiones SSE con el servidor MCP Firebird

import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';

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
    const clientId = `client-${uuidv4().substring(0, 8)}`;
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

    // Crear una sesión en el servidor MCP conectando al servidor SSE
    try {
      console.log(`Conectando al servidor MCP: ${MCP_SERVER_URL}`);

      // Establecer una conexión SSE con el servidor MCP
      const mcpResponse = await fetch(MCP_SERVER_URL, {
        method: 'GET',
        headers: {
          'Accept': 'text/event-stream'
        }
      });

      if (!mcpResponse.ok) {
        throw new Error(`Error al conectar con el servidor MCP: ${mcpResponse.status} ${mcpResponse.statusText}`);
      }

      console.log('Conexión SSE establecida con el servidor MCP');

      // Procesar la respuesta del servidor MCP para obtener el ID de sesión
      const session = sessions.get(clientId);
      if (!session) {
        throw new Error(`No se encontró la sesión del cliente ${clientId}`);
      }

      // Crear un lector para procesar el stream SSE
      const reader = mcpResponse.body.getReader();
      session.mcpReader = reader;

      // Procesar el stream SSE en un bucle
      let mcpSessionId = null;
      let endpointReceived = false;

      // Función para procesar el stream SSE
      const processStream = async () => {
        try {
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // Convertir el buffer a texto y añadirlo al buffer acumulado
            const chunk = new TextDecoder().decode(value);
            buffer += chunk;

            console.log(`Recibido del servidor MCP: ${chunk}`);

            // Procesar líneas completas
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Guardar la última línea incompleta

            let eventName = '';
            let eventData = '';

            for (const line of lines) {
              if (line.startsWith('event:')) {
                eventName = line.substring(6).trim();
              } else if (line.startsWith('data:')) {
                eventData = line.substring(5).trim();

                // Si tenemos un evento completo, procesarlo
                if (eventName && eventData) {
                  console.log(`Evento recibido del servidor MCP: ${eventName}, datos: ${eventData}`);

                  if (eventName === 'endpoint') {
                    try {
                      // Extraer el ID de sesión de la URL del endpoint
                      const url = new URL(eventData, MCP_SERVER_URL);
                      mcpSessionId = url.searchParams.get('sessionId');
                      console.log(`ID de sesión MCP: ${mcpSessionId}`);

                      // Almacenar el ID de sesión del servidor MCP
                      session.mcpSessionId = mcpSessionId;

                      // Enviar el evento endpoint al cliente
                      const endpointUrl = `/message?sessionId=${clientId}`;
                      res.write(`event: endpoint\ndata: ${endpointUrl}\n\n`);

                      console.log(`Sesión creada para el cliente ${clientId} con ID de sesión MCP ${mcpSessionId}`);
                      endpointReceived = true;
                    } catch (error) {
                      console.error(`Error al procesar la URL del endpoint: ${error.message}`);
                    }
                  } else if (eventName === 'message') {
                    // Reenviar el mensaje al cliente
                    res.write(`event: message\ndata: ${eventData}\n\n`);
                  }

                  // Reiniciar para el próximo evento
                  eventName = '';
                  eventData = '';
                }
              } else if (line === '') {
                // Línea vacía, reiniciar para el próximo evento
                eventName = '';
                eventData = '';
              }
            }
          }
        } catch (error) {
          console.error(`Error al leer el stream SSE del servidor MCP: ${error.message}`);
        }
      };

      // Iniciar el procesamiento del stream en segundo plano
      processStream();

      // Esperar a que se reciba el evento endpoint (con un timeout)
      const waitForEndpoint = async () => {
        const timeout = 5000; // 5 segundos
        const startTime = Date.now();

        while (!endpointReceived) {
          if (Date.now() - startTime > timeout) {
            throw new Error('Tiempo de espera agotado esperando el evento endpoint del servidor MCP');
          }

          await new Promise(resolve => setTimeout(resolve, 100));
        }
      };

      await waitForEndpoint();
    } catch (error) {
      console.error(`Error al crear la sesión en el servidor MCP: ${error.message}`);
    }

    // Enviar un mensaje inicial
    res.write(`data: ${JSON.stringify({ type: 'connection', message: 'Conexión establecida' })}\n\n`);

    // Manejar la desconexión del cliente
    req.on('close', () => {
      console.log(`Cliente desconectado para la sesión ${clientId}`);
      const session = sessions.get(clientId);
      if (session && session.mcpReader) {
        // Cancelar el lector del stream SSE
        session.mcpReader.cancel();
      }
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
