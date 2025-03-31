// Script para probar el servidor MCP
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

// Obtenemos la ruta del directorio actual
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ruta al servidor MCP
const serverPath = path.join(__dirname, 'dist', 'index.js');

// Función para probar el servidor MCP
function testMcpServer() {
  console.log('Iniciando pruebas del servidor MCP Firebird...');
  
  // Lanzamos el servidor
  const serverProcess = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  // Manejamos salidas del servidor
  serverProcess.stdout.on('data', (data) => {
    try {
      const output = data.toString().trim();
      console.log('\n[STDOUT] Mensaje JSON recibido:');
      console.log(output);
      
      // Intentamos parsearlo como JSON para verificar
      const json = JSON.parse(output);
      console.log('[Verificación JSON] Parseado correctamente');
    } catch (error) {
      console.error(`[Error de parseado] ${error.message}`);
    }
  });
  
  serverProcess.stderr.on('data', (data) => {
    console.log(`[STDERR] ${data.toString().trim()}`);
  });
  
  // Enviamos comandos básicos del protocolo MCP
  const commands = [
    { type: 'ping', id: '1' },
    { type: 'server_info', id: '2' },
    { type: 'tools', id: '3' },
    { type: 'prompts', id: '4' },
    { type: 'resources', id: '5' }
  ];
  
  let commandIndex = 0;
  
  // Enviamos comandos secuencialmente
  const sendNextCommand = () => {
    if (commandIndex < commands.length) {
      const command = commands[commandIndex++];
      console.log(`\n[ENVIANDO COMANDO] ${command.type} (ID: ${command.id})`);
      console.log(JSON.stringify(command, null, 2));
      serverProcess.stdin.write(JSON.stringify(command) + '\n');
      
      // Programamos el siguiente comando
      setTimeout(sendNextCommand, 2000);
    } else {
      console.log('\n[PRUEBAS COMPLETADAS] Terminando servidor...');
      serverProcess.kill();
    }
  };
  
  // Comenzamos a enviar comandos después de un breve retraso
  setTimeout(sendNextCommand, 2000);
  
  // Manejamos la terminación del proceso
  serverProcess.on('close', (code) => {
    console.log(`\n[SERVIDOR TERMINADO] Código de salida: ${code}`);
  });
}

// Ejecutamos las pruebas
testMcpServer();
