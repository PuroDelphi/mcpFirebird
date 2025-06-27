// test-sse.js
// Script simple para probar la conexión SSE con el servidor MCP Firebird

import fetch from 'node-fetch';
import EventSourcePolyfill from 'eventsource';

// Configuración
const SERVER_URL = 'http://localhost:3003';
const SESSION_ID = `node-test-${Math.random().toString(36).substring(2, 10)}`;

// Función para enviar una solicitud al servidor
async function sendRequest(method, params = {}) {
  const request = {
    jsonrpc: '2.0',
    id: String(Date.now()),
    method,
    params
  };

  console.log(`Enviando solicitud: ${JSON.stringify(request, null, 2)}`);

  try {
    const response = await fetch(`${SERVER_URL}/message?sessionId=${SESSION_ID}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    });

    console.log(`Código de estado: ${response.status}`);

    if (response.status !== 200) {
      const text = await response.text();
      console.log(`Error: ${text}`);
      return null;
    }

    try {
      return await response.json();
    } catch (error) {
      const text = await response.text();
      console.log(`Error al decodificar JSON: ${text}`);
      return null;
    }
  } catch (error) {
    console.log(`Error al enviar la solicitud: ${error.message}`);
    return null;
  }
}

// Función principal
async function main() {
  console.log(`Probando conexión SSE con el servidor ${SERVER_URL}`);
  console.log(`ID de sesión: ${SESSION_ID}`);

  // Establecer la conexión SSE
  try {
    console.log('Estableciendo conexión SSE...');
    const eventSource = new EventSourcePolyfill(`${SERVER_URL}?sessionId=${SESSION_ID}`);

    eventSource.onopen = () => {
      console.log('Conexión SSE establecida');
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log(`Evento SSE recibido: ${JSON.stringify(data, null, 2)}`);
      } catch (error) {
        console.log(`Evento SSE recibido (no JSON): ${event.data}`);
      }
    };

    eventSource.onerror = (error) => {
      console.log(`Error en la conexión SSE: ${error.message || 'Error desconocido'}`);
    };

    // Esperar un momento para que se establezca la conexión
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Probar get-methods
    console.log('\n--- Probando get-methods ---');
    const methods = await sendRequest('get-methods');
    if (methods) {
      console.log(`Métodos disponibles: ${JSON.stringify(methods, null, 2)}`);
    }

    // Probar list-tables
    console.log('\n--- Probando list-tables ---');
    const tables = await sendRequest('list-tables');
    if (tables) {
      console.log(`Tablas disponibles: ${JSON.stringify(tables, null, 2)}`);
    }

    // Mantener el script en ejecución por un tiempo
    console.log('\nManteniendo la conexión abierta por 5 segundos...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Cerrar la conexión
    eventSource.close();
    console.log('Conexión SSE cerrada');
  } catch (error) {
    console.log(`Error: ${error.message}`);
  }
}

// Ejecutar la función principal
main().catch(console.error);
