const WebSocket = require('ws');
const http = require('http');

const NUM_CONNECTIONS = 50;
const NUM_CYCLES = 20;
const DELAY_BETWEEN_CYCLES = 250; // 250ms
const DELAY_BETWEEN_CONNECTIONS = 25; // 25ms

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function checkServerStatus() {
    return new Promise((resolve, reject) => {
        http.get('http://localhost:3001/status', (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

async function runWebSocketClient(clientId) {
    const ws = new WebSocket('ws://localhost:3002');
    
    return new Promise((resolve, reject) => {
        ws.on('open', async () => {
            console.log(`Cliente ${clientId}: Conectado`);
            
            // Mensaje de inicialización
            const initMessage = {
                jsonrpc: "2.0",
                method: "initialize",
                params: {
                    protocolVersion: "2024-11-05",
                    capabilities: {},
                    clientInfo: {
                        name: `stress-test-client-${clientId}`,
                        version: "1.0.0"
                    }
                },
                id: clientId
            };
            
            ws.send(JSON.stringify(initMessage));
            
            // Esperar respuesta
            ws.on('message', async (data) => {
                const response = JSON.parse(data.toString());
                if (response.id === clientId) {
                    console.log(`Cliente ${clientId}: Inicializado correctamente`);
                    
                    // Enviar mensaje de initialized
                    const initializedMessage = {
                        jsonrpc: "2.0",
                        method: "notifications/initialized",
                        params: {
                            clientInfo: {
                                name: `stress-test-client-${clientId}`,
                                version: "1.0.0"
                            }
                        }
                    };
                    
                    ws.send(JSON.stringify(initializedMessage));
                    
                    // Esperar un momento antes de cerrar
                    await sleep(500);
                    ws.close();
                    resolve();
                }
            });
        });
        
        ws.on('error', (error) => {
            console.error(`Cliente ${clientId}: Error - ${error.message}`);
            reject(error);
        });
    });
}

async function runStressTest() {
    console.log('Iniciando prueba de estrés...');
    
    for (let cycle = 1; cycle <= NUM_CYCLES; cycle++) {
        console.log(`\nCiclo ${cycle} de ${NUM_CYCLES}`);
        
        // Verificar estado del servidor
        try {
            const status = await checkServerStatus();
            console.log('Estado del servidor:', status);
        } catch (error) {
            console.error('Error al verificar el estado del servidor:', error);
            process.exit(1);
        }
        
        // Crear conexiones simultáneas
        const connections = [];
        for (let i = 1; i <= NUM_CONNECTIONS; i++) {
            connections.push(runWebSocketClient(i));
            await sleep(DELAY_BETWEEN_CONNECTIONS);
        }
        
        // Esperar a que todas las conexiones terminen
        try {
            await Promise.all(connections);
            console.log(`Ciclo ${cycle}: Todas las conexiones completadas`);
        } catch (error) {
            console.error(`Ciclo ${cycle}: Error en las conexiones:`, error);
        }
        
        // Esperar antes del siguiente ciclo
        if (cycle < NUM_CYCLES) {
            await sleep(DELAY_BETWEEN_CYCLES);
        }
    }
    
    console.log('\nPrueba de estrés completada');
}

// Ejecutar la prueba
runStressTest().catch(console.error); 