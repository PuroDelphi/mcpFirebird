// enhanced-proxy.js
// Proxy mejorado para SSE que aprovecha las nuevas características del servidor MCP Firebird

import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

// Configuración
const PORT = process.env.PORT || 3005;
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3003';

// Crear la aplicación Express
const app = express();

// Habilitar CORS
app.use(cors());

// Parsear JSON
app.use(express.json());

// Almacenar las conexiones SSE activas
const connections = new Map();

// Verificar si el servidor MCP soporta proxies
async function checkProxySupport() {
  try {
    const response = await fetch(`${MCP_SERVER_URL}/proxy-support`);
    
    if (!response.ok) {
      console.warn('El servidor MCP no soporta el endpoint /proxy-support. Usando modo de compatibilidad.');
      return false;
    }
    
    const data = await response.json();
    console.log('Información de soporte de proxy:', data);
    
    return data.supported === true;
  } catch (error) {
    console.warn(`Error al verificar el soporte de proxy: ${error.message}. Usando modo de compatibilidad.`);
    return false;
  }
}

// Endpoint SSE para la conexión inicial
app.get('/', async (req, res) => {
  try {
    console.log('Nueva conexión SSE recibida');
    
    // Configurar la respuesta para SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    
    // Generar un ID de cliente único
    const clientId = `client-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    console.log(`ID de cliente generado: ${clientId}`);
    
    // Verificar si el servidor MCP soporta proxies
    const proxySupported = await checkProxySupport();
    
    // Establecer una conexión SSE con el servidor MCP
    const headers = {
      'Accept': 'text/event-stream'
    };
    
    // Añadir headers específicos para proxy si es soportado
    if (proxySupported) {
      headers['x-mcp-proxy'] = 'true';
      headers['x-proxy-client-id'] = clientId;
    }
    
    const mcpResponse = await fetch(MCP_SERVER_URL, {
      method: 'GET',
      headers
    });
    
    if (!mcpResponse.ok) {
      throw new Error(`Error al conectar con el servidor MCP: ${mcpResponse.status} ${mcpResponse.statusText}`);
    }
    
    console.log('Conexión SSE establecida con el servidor MCP');
    
    // Almacenar la conexión del cliente
    connections.set(clientId, {
      clientRes: res,
      createdAt: new Date(),
      mcpSessionId: null, // Se actualizará cuando recibamos el evento endpoint del servidor MCP
      proxySupported
    });
    
    // Enviar el evento endpoint al cliente
    const endpointUrl = `/message?sessionId=${clientId}`;
    res.write(`event: endpoint\ndata: ${endpointUrl}\n\n`);
    
    console.log(`Evento endpoint enviado al cliente: ${endpointUrl}`);
    
    // Procesar los eventos del servidor MCP y reenviarlos al cliente
    const mcpBody = mcpResponse.body;
    let mcpSessionId = null;
    let buffer = '';
    
    mcpBody.on('data', (chunk) => {
      const data = chunk.toString();
      console.log(`Recibido del servidor MCP: ${data}`);
      
      // Añadir al buffer
      buffer += data;
      
      // Buscar el evento endpoint en el buffer
      const endpointMatch = buffer.match(/event: endpoint\ndata: ([^\n]+)/);
      if (endpointMatch && !mcpSessionId) {
        const endpointUrl = endpointMatch[1];
        console.log(`Evento endpoint recibido: ${endpointUrl}`);
        
        try {
          // Extraer el ID de sesión de la URL del endpoint
          const url = new URL(endpointUrl, MCP_SERVER_URL);
          mcpSessionId = url.searchParams.get('sessionId');
          console.log(`ID de sesión MCP: ${mcpSessionId}`);
          
          // Almacenar el ID de sesión MCP en la conexión del cliente
          const connection = connections.get(clientId);
          if (connection) {
            connections.set(clientId, {
              ...connection,
              mcpSessionId
            });
          }
          
          // No reenviar el evento endpoint del servidor MCP al cliente
          // para evitar que el cliente actualice su ID de sesión
          return;
        } catch (error) {
          console.error(`Error al procesar la URL del endpoint: ${error.message}`);
        }
      }
      
      // Reenviar el evento al cliente (excepto el evento endpoint)
      if (!res.writableEnded) {
        res.write(data);
      }
    });
    
    mcpBody.on('error', (error) => {
      console.error(`Error en la conexión con el servidor MCP: ${error.message}`);
    });
    
    mcpBody.on('end', () => {
      console.log('Conexión con el servidor MCP cerrada');
      
      // Cerrar la conexión con el cliente
      if (!res.writableEnded) {
        res.end();
      }
      
      // Eliminar la conexión
      connections.delete(clientId);
    });
    
    // Manejar la desconexión del cliente
    req.on('close', () => {
      console.log(`Cliente desconectado: ${clientId}`);
      
      // Cerrar la conexión con el servidor MCP
      mcpBody.destroy();
      
      // Eliminar la conexión
      connections.delete(clientId);
    });
  } catch (error) {
    console.error(`Error al establecer la conexión SSE: ${error.message}`);
    
    // Solo enviar una respuesta si los encabezados no se han enviado aún
    if (!res.headersSent) {
      res.status(500).send({
        error: 'Error al establecer la conexión SSE',
        message: error.message
      });
    } else if (!res.writableEnded) {
      res.end();
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
    
    // Verificar si el cliente existe
    if (!connections.has(clientId)) {
      throw new Error(`No se encontró una conexión activa para el ID: ${clientId}`);
    }
    
    // Obtener la conexión del cliente
    const connection = connections.get(clientId);
    
    // Verificar si tenemos un ID de sesión MCP
    if (!connection.mcpSessionId) {
      throw new Error('No hay un ID de sesión MCP disponible');
    }
    
    console.log(`Reenviando mensaje al servidor MCP con ID de sesión: ${connection.mcpSessionId}`);
    
    // Preparar los headers para la solicitud al servidor MCP
    const headers = {
      'Content-Type': 'application/json'
    };
    
    // Añadir headers específicos para proxy si es soportado
    if (connection.proxySupported) {
      headers['x-mcp-proxy'] = 'true';
      headers['x-proxy-client-id'] = clientId;
    }
    
    // Reenviar la solicitud al servidor MCP
    const mcpResponse = await fetch(`${MCP_SERVER_URL}/message?sessionId=${connection.mcpSessionId}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(req.body)
    });
    
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

// Endpoint de información
app.get('/info', (req, res) => {
  res.status(200).send({
    name: 'MCP Firebird SSE Proxy',
    version: '1.0.0',
    connections: connections.size,
    mcpServerUrl: MCP_SERVER_URL
  });
});

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Proxy SSE para MCP Firebird escuchando en el puerto ${PORT}`);
  console.log(`Redirigiendo solicitudes a ${MCP_SERVER_URL}`);
});
