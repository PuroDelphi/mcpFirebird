// Cliente de prueba simple para MCP Firebird
import { spawn } from 'child_process';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

// Obtener el directorio actual en ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Función para crear un mensaje MCP
function createMcpRequest(method, params = {}) {
  return JSON.stringify({
    id: Math.floor(Math.random() * 10000),
    method,
    params
  });
}

// Iniciar el servidor MCP
const serverProcess = spawn('node', [path.join(__dirname, 'dist', 'index.js')]);

// Configurar readline para leer la salida del servidor
const rl = readline.createInterface({
  input: serverProcess.stdout,
  crlfDelay: Infinity
});

// Función para enviar un mensaje al servidor
function sendToServer(message) {
  console.log(`\nEnviando: ${message}`);
  serverProcess.stdin.write(message + '\n');
}

// Procesar las respuestas del servidor
rl.on('line', (line) => {
  // Filtrar líneas de log que no son respuestas JSON
  if (line.startsWith('[LOG]') || line.startsWith('[INIT]')) {
    console.log(`Log del servidor: ${line}`);
    return;
  }
  
  try {
    const response = JSON.parse(line);
    console.log('\nRespuesta recibida:');
    console.log(JSON.stringify(response, null, 2));
    
    // Aquí podemos analizar la respuesta y ejecutar más pruebas
    processResponse(response);
  } catch (error) {
    console.log(`Salida del servidor (no JSON): ${line}`);
  }
});

// Cola de pruebas a ejecutar
const testQueue = [
  // 1. Obtener información del servidor
  () => sendToServer(createMcpRequest('getServerInfo', {})),
  
  // 2. Listar recursos disponibles
  () => setTimeout(() => sendToServer(createMcpRequest('getResources', {})), 1000),
  
  // 3. Probar herramienta para listar tablas
  () => setTimeout(() => sendToServer(createMcpRequest('executeTool', {
    name: 'list-tables',
    args: {}
  })), 2000),
  
  // 4. Probar herramienta para ejecutar consulta SQL
  () => setTimeout(() => sendToServer(createMcpRequest('executeTool', {
    name: 'execute-query',
    args: {
      sql: 'SELECT FIRST 5 * FROM RDB$RELATIONS'
    }
  })), 3000),
  
  // 5. Probar un prompt
  () => setTimeout(() => sendToServer(createMcpRequest('executePrompt', {
    name: 'generate-sql',
    args: {
      description: 'Obtener los primeros 10 registros de la tabla de usuarios'
    }
  })), 4000),
  
  // 6. Finalizar las pruebas después de un tiempo
  () => setTimeout(() => {
    console.log('\nPruebas completadas. Finalizando...');
    serverProcess.kill();
    process.exit(0);
  }, 10000)
];

// Procesamiento de respuestas
function processResponse(response) {
  // Aquí podemos realizar validaciones específicas según la respuesta
  // y ejecutar pruebas adicionales basadas en los resultados
  
  // Por ahora, simplemente registramos la respuesta
}

// Iniciar las pruebas después de un breve retraso para permitir que el servidor se inicie
setTimeout(() => {
  console.log('\nIniciando pruebas del servidor MCP Firebird...');
  testQueue.forEach(test => test());
}, 2000);

// Manejar errores y salida del servidor
serverProcess.stderr.on('data', (data) => {
  console.error(`Error del servidor: ${data}`);
});

serverProcess.on('close', (code) => {
  console.log(`\nEl servidor ha finalizado con código: ${code}`);
});
