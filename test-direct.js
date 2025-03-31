// Test directo para el servidor MCP Firebird usando el SDK oficial
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Obtenemos la ruta del directorio actual
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverPath = path.join(__dirname, 'dist', 'index.js');

// Función para esperar
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Función principal que ejecuta una prueba directa del servidor MCP
 */
async function runDirectTest() {
    console.log('=== TEST DIRECTO DEL SERVIDOR MCP FIREBIRD ===');
    
    // Lanzamos el servidor como un proceso separado
    const serverProcess = spawn('node', [serverPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
            ...process.env,
            // Podemos agregar variables de entorno para la prueba si es necesario
        }
    });
    
    // Configuramos los manejadores de eventos
    serverProcess.stdout.on('data', data => {
        const output = data.toString().trim();
        if (output) {
            console.log(`\n[STDOUT] ${output}`);
            // Intentamos parsear como JSON
            try {
                const json = JSON.parse(output);
                console.log(`✅ JSON válido detectado (tipo: ${json.type || 'desconocido'})`);
            } catch (e) {
                console.log(`❌ No es un JSON válido: ${e.message}`);
            }
        }
    });
    
    serverProcess.stderr.on('data', data => {
        // Mantenemos stderr mínimo para evitar ruido
        if (data.toString().includes('[INIT]') || data.toString().includes('ERROR')) {
            console.log(`[STDERR] ${data.toString().trim()}`);
        }
    });
    
    // Esperamos a que el servidor se inicialice completamente
    console.log('\nEsperando a que el servidor se inicialice...');
    await sleep(3000);
    
    // Enviamos un comando de ping para probar la comunicación
    console.log('\nEnviando comando ping...');
    serverProcess.stdin.write(JSON.stringify({
        type: 'ping',
        id: 'test-1'
    }) + '\n');
    
    // Esperamos la respuesta
    await sleep(1000);
    
    // Enviamos un comando para obtener información del servidor
    console.log('\nEnviando comando server_info...');
    serverProcess.stdin.write(JSON.stringify({
        type: 'server_info',
        id: 'test-2'
    }) + '\n');
    
    // Esperamos la respuesta
    await sleep(1000);
    
    // Enviamos un comando para obtener las herramientas disponibles
    console.log('\nEnviando comando tools...');
    serverProcess.stdin.write(JSON.stringify({
        type: 'tools',
        id: 'test-3'
    }) + '\n');
    
    // Esperamos la respuesta
    await sleep(2000);
    
    // Terminamos el proceso
    console.log('\nFinalizando el servidor...');
    serverProcess.kill();
    
    console.log('\n=== TEST FINALIZADO ===');
}

// Ejecutamos la prueba
runDirectTest().catch(error => {
    console.error(`Error durante la prueba: ${error.message}`);
});
