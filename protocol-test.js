// Prueba directa del protocolo MCP
// Este script envía mensajes JSON directamente al servidor MCP

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

// Definimos la ruta al servidor MCP
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverPath = path.join(__dirname, 'dist', 'index.js');

// Función para esperar un tiempo específico
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Función para enviar un ping
function sendPing(serverProcess) {
    const pingMessage = {
        type: 'ping',
        id: '1'
    };
    
    console.log('\n[ENVIANDO PING]');
    console.log(JSON.stringify(pingMessage, null, 2));
    
    serverProcess.stdin.write(JSON.stringify(pingMessage) + '\n');
}

// Función para solicitar información del servidor
function sendServerInfoRequest(serverProcess) {
    const serverInfoRequest = {
        type: 'server_info',
        id: '2'
    };
    
    console.log('\n[SOLICITANDO INFORMACIÓN DEL SERVIDOR]');
    console.log(JSON.stringify(serverInfoRequest, null, 2));
    
    serverProcess.stdin.write(JSON.stringify(serverInfoRequest) + '\n');
}

// Función para solicitar herramientas
function sendToolsRequest(serverProcess) {
    const toolsRequest = {
        type: 'tools',
        id: '3'
    };
    
    console.log('\n[SOLICITANDO HERRAMIENTAS]');
    console.log(JSON.stringify(toolsRequest, null, 2));
    
    serverProcess.stdin.write(JSON.stringify(toolsRequest) + '\n');
}

// Función para solicitar prompts
function sendPromptsRequest(serverProcess) {
    const promptsRequest = {
        type: 'prompts',
        id: '4'
    };
    
    console.log('\n[SOLICITANDO PROMPTS]');
    console.log(JSON.stringify(promptsRequest, null, 2));
    
    serverProcess.stdin.write(JSON.stringify(promptsRequest) + '\n');
}

// Función para solicitar recursos
function sendResourcesRequest(serverProcess) {
    const resourcesRequest = {
        type: 'resources',
        id: '5'
    };
    
    console.log('\n[SOLICITANDO RECURSOS]');
    console.log(JSON.stringify(resourcesRequest, null, 2));
    
    serverProcess.stdin.write(JSON.stringify(resourcesRequest) + '\n');
}

// Función para solicitar un recurso específico
function sendResourceRequest(serverProcess, resourceName) {
    const resourceRequest = {
        type: 'resource',
        id: '6',
        name: resourceName
    };
    
    console.log(`\n[SOLICITANDO RECURSO: ${resourceName}]`);
    console.log(JSON.stringify(resourceRequest, null, 2));
    
    serverProcess.stdin.write(JSON.stringify(resourceRequest) + '\n');
}

// Función para terminar el servidor
function terminateServer(serverProcess) {
    console.log('\n[TERMINANDO PRUEBAS]');
    console.log('Todas las pruebas completadas correctamente');
    
    serverProcess.kill();
}

// Función para ejecutar pruebas en el servidor MCP
async function runProtocolTests() {
    console.log('Iniciando pruebas directas del protocolo MCP...');
    
    // Iniciamos el proceso del servidor
    const serverProcess = spawn('node', [serverPath], {
        stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let outputBuffer = '';
    
    // Manejamos salidas de stderr para depuración
    serverProcess.stderr.on('data', (data) => {
        console.log(`[SERVER LOG] ${data.toString().trim()}`);
    });
    
    // Capturamos la salida de stdout
    serverProcess.stdout.on('data', (data) => {
        const output = data.toString();
        outputBuffer += output;
        
        // Intentamos procesar mensajes JSON completos
        try {
            // Buscamos mensajes JSON completos (podría haber varios en el buffer)
            let bracketCount = 0;
            let startPos = -1;
            let messages = [];
            
            for (let i = 0; i < outputBuffer.length; i++) {
                const char = outputBuffer[i];
                
                if (char === '{' && startPos === -1) {
                    startPos = i;
                    bracketCount = 1;
                } else if (startPos !== -1) {
                    if (char === '{') bracketCount++;
                    if (char === '}') bracketCount--;
                    
                    if (bracketCount === 0) {
                        // Tenemos un mensaje JSON completo
                        const jsonStr = outputBuffer.substring(startPos, i + 1);
                        try {
                            const jsonMsg = JSON.parse(jsonStr);
                            messages.push(jsonMsg);
                        } catch (e) {
                            console.error(`Error al parsear JSON: ${e.message}`);
                        }
                        startPos = -1;
                    }
                }
            }
            
            // Procesamos los mensajes
            for (const msg of messages) {
                console.log('\n[MENSAJE JSON RECIBIDO]');
                console.log(JSON.stringify(msg, null, 2));
                
                // Si es una respuesta a una petición, enviamos otra
                if (msg.type === 'ping' && msg.id === '1') {
                    sendServerInfoRequest(serverProcess);
                } else if (msg.type === 'server_info' && msg.id === '2') {
                    sendToolsRequest(serverProcess);
                } else if (msg.type === 'tools' && msg.id === '3') {
                    sendPromptsRequest(serverProcess);
                } else if (msg.type === 'prompts' && msg.id === '4') {
                    sendResourcesRequest(serverProcess);
                } else if (msg.type === 'resources' && msg.id === '5') {
                    // Si llegamos aquí, hemos completado todas las pruebas básicas
                    if (msg.resources && msg.resources.length > 0) {
                        const firstResource = msg.resources[0].name;
                        sendResourceRequest(serverProcess, firstResource);
                    } else {
                        console.log('No hay recursos disponibles para probar');
                        terminateServer(serverProcess);
                    }
                } else if (msg.type === 'resource_response' && msg.id === '6') {
                    // Última prueba completada
                    terminateServer(serverProcess);
                }
            }
            
            // Actualizamos el buffer eliminando los mensajes ya procesados
            if (messages.length > 0 && startPos === -1) {
                outputBuffer = outputBuffer.substring(outputBuffer.lastIndexOf('}') + 1);
            }
        } catch (error) {
            console.error(`Error procesando mensajes: ${error.message}`);
        }
    });
    
    // Iniciamos las pruebas enviando un ping
    await sleep(1000); // Esperamos a que el servidor esté listo
    sendPing(serverProcess);
    
    // Manejamos errores y cierre del proceso
    serverProcess.on('error', (error) => {
        console.error(`Error en el proceso del servidor: ${error.message}`);
    });
    
    serverProcess.on('close', (code) => {
        console.log(`Proceso del servidor terminado con código: ${code}`);
    });
    
    // Mantenemos el proceso principal vivo
    return new Promise((resolve) => {
        serverProcess.on('close', () => {
            resolve();
        });
    });
}

// Ejecutar las pruebas
runProtocolTests().catch(error => {
    console.error(`Error fatal: ${error}`);
    process.exit(1);
});
