// run-sse-proxy.js
// Script para ejecutar el proxy SSE mejorado

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Obtener la ruta del directorio actual
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuración
const PORT = process.env.PORT || 3005;
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3003';

// Iniciar el proxy
console.log(`Iniciando proxy SSE en el puerto ${PORT} apuntando a ${MCP_SERVER_URL}...`);

// Ejecutar el proxy
const proxyProcess = spawn('node', [join(__dirname, 'mcp-sse-proxy', 'enhanced-proxy.js')], {
  env: {
    ...process.env,
    PORT,
    MCP_SERVER_URL
  },
  stdio: 'inherit'
});

// Manejar eventos del proceso
proxyProcess.on('error', (error) => {
  console.error(`Error al iniciar el proxy: ${error.message}`);
  process.exit(1);
});

proxyProcess.on('exit', (code) => {
  console.log(`Proxy terminado con código: ${code}`);
  process.exit(code);
});

// Manejar señales para cerrar el proxy correctamente
process.on('SIGINT', () => {
  console.log('Cerrando proxy...');
  proxyProcess.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('Cerrando proxy...');
  proxyProcess.kill('SIGTERM');
});
