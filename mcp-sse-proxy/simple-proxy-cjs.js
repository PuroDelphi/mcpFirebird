// simple-proxy-cjs.js
// Proxy simple para manejar conexiones SSE con el servidor MCP Firebird

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const EventSource = require('eventsource');

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
      
      // Crear una promesa para esperar el evento endpoint
      const endpointPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Tiempo de espera agotado esperando el evento endpoint'));
        }, 5000);
        
        // Establecer la conexión SSE con el servidor MCP
        const eventSource = new EventSource(MCP_SERVER_URL);
        
        eventSource.addEventListener('endpoint', (event) => {
          clearTimeout(timeout);
          
          try {
            // Extraer el ID de sesión de la URL del endpoint
            const url = new URL(event.data, MCP_SERVER_URL);
            const sessionId = url.searchParams.get('sessionId');
            console.log(`Recibido ID de sesión válido del servidor MCP: ${sessionId}`);
            
            // Cerrar la conexión SSE
            eventSource.close();
            
            // Resolver la promesa con el ID de sesión
            resolve(sessionId);
          } catch (error) {
            eventSource.close();
            reject(error);
          }
        });
        
        eventSource.onerror = (error) => {
          clearTimeout(timeout);
          eventSource.close();
          reject(new Error(`Error en la conexión SSE con el servidor MCP: ${error.message || 'Error desconocido'}`));
        };
      });
      
      // Esperar a recibir el ID de sesión
      mcpSessionId = await endpointPromise;
      console.log(`Conexión SSE establecida con el servidor MCP, ID de sesión: ${mcpSessionId}`);
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
      mcpSessionId: null
    });
    
    // Almacenar el ID de sesión del servidor MCP
    const session = sessions.get(clientId);
    if (session) {
      session.mcpSessionId = mcpSessionId;
    }
    
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
    
    // Reenviar la solicitud al servidor MCP
    const mcpResponse = await fetch(`${MCP_SERVER_URL}/message?sessionId=${mcpSessionId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-ID': mcpSessionId
      },
      body: JSON.stringify(req.body)
    });
    
    console.log(`Respuesta del servidor MCP: ${mcpResponse.status}`);
    
    // Obtener la respuesta del servidor MCP
    const mcpResponseText = await mcpResponse.text();
    
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
