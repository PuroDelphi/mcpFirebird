const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:3001');

ws.on('open', () => {
    console.log('Conectado al servidor WebSocket');
    
    // Mensaje de inicialización
    const initMessage = {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: {
                name: 'test-client',
                version: '1.0.0'
            }
        },
        id: 1
    };
    
    console.log('Enviando mensaje de inicialización');
    ws.send(JSON.stringify(initMessage));
});

ws.on('message', (data) => {
    console.log('Respuesta recibida:', data.toString());
    
    // Enviar mensaje de initialized después de recibir respuesta
    const initializedMessage = {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
        params: {
            clientInfo: {
                name: 'test-client',
                version: '1.0.0'
            }
        }
    };
    
    console.log('Enviando mensaje de initialized');
    ws.send(JSON.stringify(initializedMessage));
    
    // Cerrar después de 2 segundos
    setTimeout(() => {
        console.log('Cerrando conexión');
        ws.close();
        process.exit(0);
    }, 2000);
});

ws.on('error', (error) => {
    console.error('Error:', error);
}); 