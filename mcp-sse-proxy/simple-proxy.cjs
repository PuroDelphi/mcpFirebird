// simple-proxy-cjs.js
// Proxy simple para manejar conexiones SSE con el servidor MCP Firebird

const express = require('express');
const cors = require('cors');
const http = require('http');
const https = require('https');
const url = require('url');

// Configuración
const PORT = process.env.PORT || 3005;
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
    console.log('Nueva conexión SSE recibida');

    // Configurar la respuesta para SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Establecer una conexión SSE con el servidor MCP para obtener un ID de sesión válido
    let mcpSessionId = null;

    try {
      // Conectar al servidor MCP como cliente SSE
      console.log('Estableciendo conexión SSE con el servidor MCP para obtener un ID de sesión válido...');

      // Hacer una solicitud GET al servidor MCP
      const mcpResponse = await new Promise((resolve, reject) => {
        const parsedUrl = new URL(MCP_SERVER_URL);
        const requestOptions = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port,
          path: parsedUrl.pathname,
          method: 'GET',
          headers: {
            'Accept': 'text/event-stream'
          }
        };

        const request = http.request(requestOptions, (response) => {
          if (response.statusCode !== 200) {
            reject(new Error(`Error al conectar con el servidor MCP: ${response.statusCode} ${response.statusMessage}`));
            return;
          }

          let buffer = '';
          let sessionIdFound = false;

          response.on('data', (chunk) => {
            buffer += chunk.toString();
            console.log(`Recibido del servidor MCP: ${chunk.toString()}`);

            // Buscar el evento endpoint en el buffer
            const endpointMatch = buffer.match(/event: endpoint\ndata: ([^\n]+)/);
            if (endpointMatch && !sessionIdFound) {
              const endpointUrl = endpointMatch[1];
              console.log(`Evento endpoint recibido: ${endpointUrl}`);

              try {
                // Extraer el ID de sesión de la URL del endpoint
                const url = new URL(endpointUrl, MCP_SERVER_URL);
                const sessionId = url.searchParams.get('sessionId');
                console.log(`ID de sesión MCP: ${sessionId}`);

                // Resolver la promesa con el ID de sesión
                sessionIdFound = true;
                resolve({
                  sessionId,
                  response
                });
              } catch (error) {
                reject(error);
              }
            }
          });

          response.on('error', (error) => {
            reject(error);
          });

          // Establecer un timeout
          setTimeout(() => {
            if (!sessionIdFound) {
              reject(new Error('Tiempo de espera agotado esperando el evento endpoint'));
              response.destroy();
            }
          }, 5000);
        });

        request.on('error', (error) => {
          reject(error);
        });

        request.end();
      });

      mcpSessionId = mcpResponse.sessionId;
      console.log(`Conexión SSE establecida con el servidor MCP, ID de sesión: ${mcpSessionId}`);

      // Mantener la conexión con el servidor MCP abierta
      const mcpStream = mcpResponse.response;

      // Reenviar los eventos del servidor MCP al cliente
      mcpStream.on('data', (chunk) => {
        console.log(`Recibido del servidor MCP: ${chunk.toString()}`);
      });

      // Manejar errores en la conexión con el servidor MCP
      mcpStream.on('error', (error) => {
        console.error(`Error en la conexión con el servidor MCP: ${error.message}`);
      });

      // Manejar el cierre de la conexión con el servidor MCP
      mcpStream.on('end', () => {
        console.log('Conexión con el servidor MCP cerrada');
      });
    } catch (error) {
      console.error(`Error al obtener un ID de sesión válido: ${error.message}`);
      throw error;
    }

    // Generar un ID de cliente único
    const clientId = `client-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

    // Almacenar la sesión del cliente
    sessions.set(clientId, {
      res,
      createdAt: new Date(),
      lastActivity: new Date(),
      mcpSessionId: mcpSessionId
    });

    console.log(`ID de sesión MCP: ${mcpSessionId}`);

    // Enviar el evento endpoint al cliente
    const endpointUrl = `/message?sessionId=${clientId}`;
    res.write(`event: endpoint\ndata: ${endpointUrl}\n\n`);

    console.log(`Sesión creada para el cliente ${clientId} con ID de sesión MCP ${mcpSessionId}`);

    // Manejar la desconexión del cliente
    req.on('close', () => {
      console.log(`Cliente desconectado: ${clientId}`);

      // Eliminar la sesión
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
    // Obtener el ID de cliente del parámetro de consulta
    const clientId = req.query.sessionId?.toString();

    if (!clientId) {
      throw new Error('Se requiere un ID de cliente');
    }

    console.log(`Mensaje recibido del cliente: ${clientId}`);

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

    console.log(`Reenviando mensaje al servidor MCP para la sesión: ${mcpSessionId}`);
    console.log(`URL: ${MCP_SERVER_URL}/message?sessionId=${mcpSessionId}`);
    console.log(`Cuerpo: ${JSON.stringify(req.body)}`);

    // Reenviar la solicitud al servidor MCP usando http.request
    const parsedUrl = new URL(`${MCP_SERVER_URL}/message?sessionId=${mcpSessionId}`);
    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-ID': mcpSessionId
      }
    };

    console.log(`Reenviando solicitud a: ${parsedUrl.href}`);

    // Crear una promesa para manejar la solicitud
    const httpRequest = new Promise((resolve, reject) => {
      const request = http.request(requestOptions, (response) => {
        let responseData = '';

        response.on('data', (chunk) => {
          responseData += chunk;
        });

        response.on('end', () => {
          resolve({
            status: response.statusCode,
            headers: response.headers,
            data: responseData
          });
        });
      });

      request.on('error', (error) => {
        reject(error);
      });

      // Enviar el cuerpo de la solicitud
      request.write(JSON.stringify(req.body));
      request.end();
    });

    try {
      // Esperar la respuesta
      const mcpResponse = await httpRequest;

      console.log(`Respuesta del servidor MCP: ${mcpResponse.status}`);

      // Obtener la respuesta del servidor MCP
      const mcpResponseText = mcpResponse.data;

      // Intentar parsear la respuesta como JSON
      let mcpResponseJson;
      try {
        mcpResponseJson = JSON.parse(mcpResponseText);
        console.log(`Respuesta JSON: ${JSON.stringify(mcpResponseJson)}`);
      } catch (error) {
        console.error(`Error al parsear la respuesta del servidor MCP: ${error.message}`);
        console.error(`Respuesta del servidor MCP: ${mcpResponseText}`);

        // Enviar la respuesta como texto
        res.status(mcpResponse.status).send(mcpResponseText);
        return;
      }

      // Enviar la respuesta al cliente
      res.status(mcpResponse.status).json(mcpResponseJson);
    } catch (error) {
      console.error(`Error al reenviar la solicitud al servidor MCP: ${error.message}`);

      // Enviar una respuesta de error al cliente
      res.status(500).json({
        jsonrpc: '2.0',
        id: req.body?.id,
        error: {
          code: -32603,
          message: 'Error al comunicarse con el servidor MCP: ' + error.message
        }
      });
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
