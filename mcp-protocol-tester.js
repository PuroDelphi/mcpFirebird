// MCP Protocol Tester - Verificador de cumplimiento estricto del Model Context Protocol
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

// Comandos MCP a probar
const MCP_COMMANDS = [
    {
        type: 'ping',
        id: 'test-ping-1',
        description: 'Prueba básica de ping'
    },
    {
        type: 'server_info',
        id: 'test-info-1',
        description: 'Obtener información del servidor'
    },
    {
        type: 'tools',
        id: 'test-tools-1',
        description: 'Obtener lista de herramientas'
    }
];

/**
 * Función principal que ejecuta la prueba del protocolo MCP
 */
async function testMCPProtocol() {
    console.log('=== VERIFICADOR DE CUMPLIMIENTO DEL MODEL CONTEXT PROTOCOL ===');
    console.log('Probando servidor MCP Firebird con cumplimiento estricto del MCP\n');
    
    // Crear archivos de salida para stdout y stderr
    const stdoutFile = fs.createWriteStream('mcp-stdout.log');
    const stderrFile = fs.createWriteStream('mcp-stderr.log');
    
    let jsonResponses = [];
    let stdoutLines = [];
    let stderrLines = [];
    
    // Lanzamos el servidor como un proceso separado
    console.log('Iniciando servidor MCP Firebird...');
    const serverProcess = spawn('node', [serverPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
            ...process.env,
            // Agregamos variable para indicar test
            MCP_TEST: 'true'
        }
    });
    
    // Configuramos los manejadores de eventos
    serverProcess.stdout.on('data', data => {
        const output = data.toString().trim();
        if (output) {
            stdoutFile.write(output + '\n');
            stdoutLines.push(output);
            
            console.log(`\n[STDOUT] Recibido: ${output}`);
            
            // Intentamos parsear como JSON
            try {
                const json = JSON.parse(output);
                jsonResponses.push(json);
                console.log(`✅ JSON válido detectado (tipo: ${json.type || 'desconocido'}, id: ${json.id || 'n/a'})`);
            } catch (e) {
                console.log(`❌ FALLO MCP - No es un JSON válido: ${e.message}`);
            }
        }
    });
    
    serverProcess.stderr.on('data', data => {
        const lines = data.toString().trim().split('\n');
        lines.forEach(line => {
            if (line.trim()) {
                stderrFile.write(line + '\n');
                stderrLines.push(line);
                
                // Solo mostramos líneas importantes para no saturar la consola
                if (line.includes('[INIT]') || line.includes('ERROR') || line.includes('WARN')) {
                    console.log(`[STDERR] ${line}`);
                }
            }
        });
    });
    
    // Esperamos a que el servidor se inicialice completamente
    console.log('\nEsperando inicialización del servidor (5 segundos)...');
    await sleep(5000);
    
    // Enviamos cada comando y esperamos respuesta
    for (const command of MCP_COMMANDS) {
        console.log(`\n▶ Enviando comando ${command.type} (${command.description})...`);
        
        const commandStr = JSON.stringify(command);
        console.log(`   Payload: ${commandStr}`);
        
        serverProcess.stdin.write(commandStr + '\n');
        
        // Esperamos respuesta
        console.log(`   Esperando respuesta...`);
        await sleep(2000);
    }
    
    // Esperamos un poco más para asegurarnos de recibir todas las respuestas
    await sleep(2000);
    
    // Terminamos el proceso del servidor
    console.log('\nFinalizando servidor MCP...');
    serverProcess.kill();
    
    // Esperamos a que se cierren los archivos
    await sleep(500);
    
    // Imprimimos resultados
    console.log('\n=== RESULTADOS DE LA PRUEBA ===');
    
    console.log(`\n1. VALIDACIÓN DE STDOUT:`);
    console.log(`   Total líneas en stdout: ${stdoutLines.length}`);
    console.log(`   Mensajes JSON detectados: ${jsonResponses.length}`);
    
    // Verificamos si todas las líneas son JSON válido
    const allStdoutIsJson = stdoutLines.length === jsonResponses.length;
    console.log(`   ¿Todas las líneas son JSON válido? ${allStdoutIsJson ? '✅ SÍ' : '❌ NO'}`);
    
    if (!allStdoutIsJson) {
        console.log('\n   ⚠️ INCUMPLIMIENTO DEL MCP: stdout contiene mensajes no-JSON');
        console.log('   Líneas no-JSON en stdout:');
        
        stdoutLines.forEach((line, index) => {
            try {
                JSON.parse(line);
                // Si llega aquí, es JSON válido
            } catch (e) {
                console.log(`      [${index+1}] ${line.substring(0, 100)}${line.length > 100 ? '...' : ''}`);
            }
        });
    }
    
    console.log(`\n2. VERIFICACIÓN DE RESPUESTAS:`);
    
    // Verificamos si recibimos respuesta a cada comando
    for (const command of MCP_COMMANDS) {
        const response = jsonResponses.find(r => r.id === command.id);
        console.log(`   Comando '${command.type}' (${command.id}): ${response ? '✅ Respuesta recibida' : '❌ Sin respuesta'}`);
    }
    
    console.log(`\n3. VALIDACIÓN FINAL:`);
    const passesTest = allStdoutIsJson && jsonResponses.length >= MCP_COMMANDS.length;
    
    if (passesTest) {
        console.log('   ✅ ÉXITO: El servidor MCP Firebird cumple con el Model Context Protocol');
    } else {
        console.log('   ❌ FALLO: El servidor MCP Firebird NO cumple con el Model Context Protocol');
        console.log('   Motivos del fallo:');
        
        if (!allStdoutIsJson) {
            console.log('   - stdout contiene mensajes que no son JSON válido');
        }
        
        if (jsonResponses.length < MCP_COMMANDS.length) {
            console.log(`   - No se recibieron todas las respuestas esperadas (${jsonResponses.length}/${MCP_COMMANDS.length})`);
        }
    }
    
    console.log('\nPrueba finalizada. Revise los archivos mcp-stdout.log y mcp-stderr.log para más detalles.');
}

// Ejecutamos la prueba
testMCPProtocol().catch(error => {
    console.error(`Error durante la prueba: ${error.message}`);
});
