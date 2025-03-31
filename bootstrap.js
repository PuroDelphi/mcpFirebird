/**
 * Bootstrap para MCP Firebird
 * 
 * Este script configura correctamente stdin/stdout según el Model Context Protocol
 * y luego arranca el servidor MCP Firebird.
 */

// Importamos child_process para ejecutar el servidor como un proceso separado
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

// Obtenemos la ruta del directorio actual
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Construimos la ruta al servidor MCP
const serverPath = path.join(__dirname, 'dist', 'index.js');

// Función para enviar un mensaje JSON a stdout
function sendJsonToStdout(obj) {
    console.log(JSON.stringify(obj));
}

// Configuramos el proceso hijo para el servidor MCP
const serverProcess = spawn('node', [serverPath], {
    // La clave está aquí: pipe permite que las entradas/salidas del proceso hijo
    // se conecten directamente con el proceso padre
    stdio: ['pipe', 'pipe', 'pipe']
});

// Configuramos el handler para los mensajes de stdout del proceso hijo
serverProcess.stdout.on('data', (data) => {
    // Enviamos directamente a stdout sin modificar
    process.stdout.write(data);
});

// Configuramos el handler para los mensajes de stderr del proceso hijo
serverProcess.stderr.on('data', (data) => {
    // Enviamos directamente a stderr sin modificar
    process.stderr.write(data);
});

// Configuramos el handler para mensajes de stdin que reciba el proceso padre
process.stdin.on('data', (data) => {
    // Enviamos directamente al proceso hijo sin modificar
    serverProcess.stdin.write(data);
});

// Manejamos la terminación del proceso hijo
serverProcess.on('close', (code) => {
    if (code !== 0) {
        process.stderr.write(`El servidor MCP Firebird finalizó con código: ${code}\n`);
    }
    process.exit(code);
});

// Configuramos el manejo de señales para terminar apropiadamente
process.on('SIGINT', () => {
    serverProcess.kill('SIGINT');
});

process.on('SIGTERM', () => {
    serverProcess.kill('SIGTERM');
});

// Mensaje inicial
process.stderr.write('Bootstrap MCP iniciado - Lanzando servidor cumpliendo con Model Context Protocol\n');
