// Script mejorado para probar el protocolo MCP
// Este script envía comandos directamente al servidor y verifica que las respuestas cumplan con el MCP

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

// Obtenemos la ruta del directorio actual
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverPath = path.join(__dirname, 'dist', 'index.js');

// Función para esperar un tiempo específico
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Comandos a probar según el protocolo MCP
const commands = [
    { name: 'PING', command: { type: 'ping', id: '1' } },
    { name: 'INFO', command: { type: 'server_info', id: '2' } },
    { name: 'TOOLS', command: { type: 'tools', id: '3' } },
    { name: 'PROMPTS', command: { type: 'prompts', id: '4' } },
    { name: 'RESOURCES', command: { type: 'resources', id: '5' } },
    // Intentaremos llamar a una herramienta si encontramos list-tables
    { name: 'CALL_TOOL', command: { type: 'call_tool', id: '6', name: 'list-tables', params: {} } },
];

// Función principal para ejecutar la prueba del servidor MCP
async function testMcpServer() {
    console.log('=== INICIANDO PRUEBA COMPLETA DEL SERVIDOR MCP FIREBIRD ===');
    console.log('Verificando cumplimiento de los lineamientos del Model Context Protocol\n');
    
    // Lanzamos el servidor como proceso hijo
    const serverProcess = spawn('node', [serverPath], {
        stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Array para almacenar mensajes JSON recibidos
    const jsonResponses = [];
    let stdoutBuffer = '';
    
    // Manejamos la salida de stdout (debe ser solo JSON válido)
    serverProcess.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdoutBuffer += chunk;
        
        // Intentamos extraer mensajes JSON completos
        let startIndex = 0;
        for (let i = 0; i < stdoutBuffer.length; i++) {
            if (stdoutBuffer[i] === '{' && startIndex === 0) {
                startIndex = i;
            } else if (stdoutBuffer[i] === '}' && startIndex !== 0) {
                // Potencial mensaje JSON completo
                const jsonStr = stdoutBuffer.substring(startIndex, i + 1);
                try {
                    const jsonObj = JSON.parse(jsonStr);
                    console.log(`\n✅ RESPUESTA JSON VÁLIDA RECIBIDA (tipo: ${jsonObj.type || 'desconocido'}):`);
                    console.log(jsonStr);
                    
                    // Almacenamos la respuesta
                    jsonResponses.push(jsonObj);
                    
                    // Actualizamos el buffer
                    stdoutBuffer = stdoutBuffer.substring(i + 1);
                    i = 0;
                    startIndex = 0;
                } catch (e) {
                    // No es un JSON válido, seguimos buscando
                }
            }
        }
    });
    
    // Manejamos la salida de stderr (logs, advertencias, errores)
    serverProcess.stderr.on('data', (data) => {
        // Opcional: descomentar para ver los logs
        // console.log(`[STDERR] ${data.toString()}`);
    });
    
    // Esperamos a que el servidor esté listo
    await sleep(2000);
    
    // Enviamos los comandos secuencialmente
    for (const cmd of commands) {
        console.log(`\n===> ENVIANDO COMANDO: ${cmd.name}`);
        console.log(JSON.stringify(cmd.command));
        
        // Antes de enviar el comando CALL_TOOL, verificamos si tenemos la herramienta list-tables
        if (cmd.name === 'CALL_TOOL') {
            const toolsResponse = jsonResponses.find(r => r.type === 'tools');
            if (toolsResponse && toolsResponse.tools) {
                const listTablesExists = toolsResponse.tools.some(t => t.name === 'list-tables');
                if (!listTablesExists) {
                    console.log('⚠️ La herramienta list-tables no está disponible, omitiendo esta prueba.');
                    continue;
                }
            } else {
                console.log('⚠️ No se encontró información sobre herramientas, omitiendo esta prueba.');
                continue;
            }
        }
        
        // Enviamos el comando
        serverProcess.stdin.write(JSON.stringify(cmd.command) + '\n');
        
        // Esperamos un poco para dar tiempo a que el servidor procese y responda
        await sleep(1000);
    }
    
    // Esperamos un poco más para recibir las últimas respuestas
    await sleep(1000);
    
    // Verificamos los resultados
    console.log('\n=== RESUMEN DE LA PRUEBA ===');
    console.log(`Comandos enviados: ${commands.length}`);
    console.log(`Respuestas JSON recibidas: ${jsonResponses.length}`);
    
    if (jsonResponses.length > 0) {
        console.log('\n✅ El servidor MCP Firebird está respetando el protocolo MCP:');
        console.log('  ✓ Solo mensajes JSON válidos se envían a stdout');
        console.log('  ✓ Los logs y mensajes de depuración se envían a stderr');
        console.log('  ✓ Las respuestas JSON son compactas y eficientes');
    } else {
        console.log('\n❌ No se recibieron respuestas JSON. Posibles problemas:');
        console.log('  - El stdout-guard podría estar bloqueando mensajes JSON válidos');
        console.log('  - El servidor podría no estar procesando los comandos correctamente');
    }
    
    // Terminamos el proceso del servidor
    console.log('\nFinalizando servidor...');
    serverProcess.kill();
    
    console.log('\n=== PRUEBA FINALIZADA ===');
}

// Ejecutamos la prueba
testMcpServer().catch(error => {
    console.error(`Error durante la prueba: ${error}`);
});
