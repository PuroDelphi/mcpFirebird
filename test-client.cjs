// Cliente de prueba para MCP Firebird usando CommonJS
const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

// Crear un proceso hijo para el servidor MCP
const serverProcess = spawn('node', ['dist/index.js'], {
  cwd: __dirname,
  stdio: ['pipe', 'pipe', 'pipe']
});

// Configurar readline para leer la salida del servidor
const rl = readline.createInterface({
  input: serverProcess.stdout,
  crlfDelay: Infinity
});

// Función para generar un ID aleatorio para las solicitudes
function generateId() {
  return Math.floor(Math.random() * 10000);
}

// Función para enviar una solicitud MCP al servidor
function sendRequest(method, params = {}) {
  const request = {
    id: generateId(),
    method,
    params
  };
  
  console.log(`\nEnviando solicitud: ${JSON.stringify(request)}`);
  serverProcess.stdin.write(JSON.stringify(request) + '\n');
}

// Manejar respuestas del servidor
rl.on('line', (line) => {
  if (line.startsWith('[LOG]') || line.startsWith('[INIT]')) {
    console.log(`Log del servidor: ${line}`);
    return;
  }
  
  try {
    const response = JSON.parse(line);
    console.log('\nRespuesta recibida:');
    console.log(JSON.stringify(response, null, 2));
  } catch (error) {
    console.log(`Salida no JSON: ${line}`);
  }
});

// Capturar errores del servidor
serverProcess.stderr.on('data', (data) => {
  console.error(`Error del servidor: ${data.toString()}`);
});

// Esperar a que el servidor se inicie
setTimeout(() => {
  console.log('\n===== INICIANDO PRUEBAS DEL SERVIDOR MCP FIREBIRD =====\n');
  
  // 1. Obtener información del servidor
  sendRequest('getServerInfo');
  
  // 2. Obtener recursos disponibles después de un breve retraso
  setTimeout(() => {
    sendRequest('getResources');
  }, 1000);
  
  // 3. Usar la herramienta list-tables para obtener la lista de tablas
  setTimeout(() => {
    sendRequest('executeTool', { 
      name: 'list-tables',
      args: {}
    });
  }, 2000);
  
  // 4. Usar la herramienta execute-query para ejecutar una consulta SQL
  setTimeout(() => {
    sendRequest('executeTool', {
      name: 'execute-query',
      args: {
        sql: 'SELECT FIRST 5 * FROM RDB$RELATIONS'
      }
    });
  }, 3000);
  
  // 5. Usar el prompt generate-sql para generar una consulta SQL
  setTimeout(() => {
    sendRequest('executePrompt', {
      name: 'generate-sql',
      args: {
        description: 'Obtener los primeros 10 registros de la tabla de usuarios'
      }
    });
  }, 4000);
  
  // Finalizar después de todas las pruebas
  setTimeout(() => {
    console.log('\n===== PRUEBAS COMPLETADAS =====');
    serverProcess.kill();
    process.exit(0);
  }, 10000);
}, 2000);

// Manejar cierre del proceso
serverProcess.on('close', (code) => {
  console.log(`\nEl servidor ha finalizado con código: ${code}`);
});
