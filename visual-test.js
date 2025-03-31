// Test visual para el servidor MCP Firebird
// Este script muestra explícitamente la salida de stdout y stderr

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Obtenemos la ruta del directorio actual
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverPath = path.join(__dirname, 'dist', 'index.js');

// Creamos archivos temporales para capturar la salida
const stdoutFile = path.join(__dirname, 'stdout.log');
const stderrFile = path.join(__dirname, 'stderr.log');

// Limpiamos archivos anteriores si existen
if (fs.existsSync(stdoutFile)) fs.unlinkSync(stdoutFile);
if (fs.existsSync(stderrFile)) fs.unlinkSync(stderrFile);

// Función para visualizar el test
async function runVisualTest() {
    console.log('Iniciando prueba visual del servidor MCP Firebird');
    
    // Creamos streams para los archivos de log
    const stdoutStream = fs.createWriteStream(stdoutFile, { flags: 'a' });
    const stderrStream = fs.createWriteStream(stderrFile, { flags: 'a' });
    
    // Lanzamos el servidor
    const serverProcess = spawn('node', [serverPath], {
        stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Redirigimos la salida a los archivos y la consola
    serverProcess.stdout.on('data', (data) => {
        const output = data.toString();
        stdoutStream.write(output);
        console.log(`[STDOUT] ${output}`);
    });
    
    serverProcess.stderr.on('data', (data) => {
        const output = data.toString();
        stderrStream.write(output);
        console.log(`[STDERR] ${output}`);
    });
    
    // Esperamos 2 segundos para que el servidor se inicialice
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Enviamos un ping para probar la comunicación
    console.log('\nEnviando ping al servidor...');
    serverProcess.stdin.write(JSON.stringify({ type: 'ping', id: '1' }) + '\n');
    
    // Esperamos 1 segundo para la respuesta
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Enviamos una solicitud de información
    console.log('\nSolicitando información del servidor...');
    serverProcess.stdin.write(JSON.stringify({ type: 'server_info', id: '2' }) + '\n');
    
    // Esperamos 1 segundo más
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Terminamos el proceso
    console.log('\nTerminando el servidor...');
    serverProcess.kill();
    
    // Cerramos los streams
    stdoutStream.end();
    stderrStream.end();
    
    // Esperamos a que los archivos se cierren
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Leemos los archivos para mostrar un resumen
    console.log('\n=== RESUMEN DE LA PRUEBA ===');
    
    if (fs.existsSync(stdoutFile)) {
        const stdoutContent = fs.readFileSync(stdoutFile, 'utf8');
        console.log('\n--- CONTENIDO DE STDOUT ---');
        console.log(stdoutContent || '[Vacío]');
        
        // Analizamos si hay JSON válido
        try {
            // Intentamos buscar objetos JSON en el contenido
            const jsonMatches = stdoutContent.match(/\{.*?\}/gs);
            if (jsonMatches && jsonMatches.length > 0) {
                console.log(`\n✅ Se encontraron ${jsonMatches.length} potenciales objetos JSON en stdout`);
                jsonMatches.forEach((json, index) => {
                    try {
                        JSON.parse(json);
                        console.log(`  ✓ Objeto #${index + 1} es JSON válido`);
                    } catch (e) {
                        console.log(`  ✗ Objeto #${index + 1} NO es JSON válido: ${e.message}`);
                    }
                });
            } else {
                console.log('❌ No se encontraron objetos JSON en stdout');
            }
        } catch (e) {
            console.log(`Error al analizar JSON: ${e.message}`);
        }
    }
    
    if (fs.existsSync(stderrFile)) {
        const stderrContent = fs.readFileSync(stderrFile, 'utf8');
        const stderrLines = stderrContent.split('\n').filter(line => line.trim());
        console.log('\n--- RESUMEN DE STDERR ---');
        console.log(`Total de líneas en stderr: ${stderrLines.length}`);
        
        // Mostramos solo las primeras 5 líneas para no saturar
        if (stderrLines.length > 0) {
            console.log('Primeras 5 líneas de stderr:');
            stderrLines.slice(0, 5).forEach(line => console.log(`  ${line}`));
            if (stderrLines.length > 5) {
                console.log(`  ... y ${stderrLines.length - 5} líneas más`);
            }
        }
    }
    
    // Verificamos el cumplimiento del MCP
    console.log('\n=== VERIFICACIÓN DE CUMPLIMIENTO DEL MCP ===');
    const stdoutContent = fs.existsSync(stdoutFile) ? fs.readFileSync(stdoutFile, 'utf8') : '';
    const stderrContent = fs.existsSync(stderrFile) ? fs.readFileSync(stderrFile, 'utf8') : '';
    
    const jsonInStdout = stdoutContent.match(/\{.*?\}/gs);
    const logsInStderr = stderrContent.includes('[');
    
    if (jsonInStdout && jsonInStdout.length > 0) {
        console.log('✅ stdout contiene objetos JSON (cumple con MCP)');
    } else {
        console.log('❌ stdout NO contiene objetos JSON (no cumple con MCP)');
    }
    
    if (logsInStderr) {
        console.log('✅ stderr contiene logs (cumple con MCP)');
    } else {
        console.log('❌ stderr NO contiene logs (no cumple con MCP)');
    }
    
    console.log('\nPrueba visual completada. Verifique los archivos stdout.log y stderr.log para más detalles.');
}

// Ejecutamos la prueba
runVisualTest().catch(error => {
    console.error(`Error en la prueba: ${error.message}`);
});
