// sse-client.js
// Cliente Node.js para conectarse al servidor MCP Firebird usando SSE
// Para ejecutar este ejemplo: npm install node-fetch eventsource

const fetch = require('node-fetch');
const EventSource = require('eventsource');

class McpFirebirdSseClient {
    constructor(serverUrl = 'http://localhost:3003') {
        this.serverUrl = serverUrl;
        this.eventSource = null;
        this.sessionId = `node-client-${Math.random().toString(36).substring(2, 15)}`;
        this.requestId = 1;
        this.connected = false;
        this.eventHandlers = {
            message: [],
            error: [],
            open: []
        };
    }
    
    connect() {
        return new Promise((resolve, reject) => {
            try {
                console.log(`Conectando a ${this.serverUrl}...`);
                
                this.eventSource = new EventSource(`${this.serverUrl}`);
                
                this.eventSource.onopen = () => {
                    console.log('Conexión SSE establecida');
                    this.connected = true;
                    this._triggerEvent('open');
                    resolve();
                };
                
                this.eventSource.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        console.log('Mensaje recibido:', data);
                        this._triggerEvent('message', data);
                    } catch (error) {
                        console.log('Mensaje recibido (no JSON):', event.data);
                        this._triggerEvent('message', event.data);
                    }
                };
                
                this.eventSource.onerror = (error) => {
                    console.error('Error en la conexión SSE:', error);
                    this.connected = false;
                    this._triggerEvent('error', error);
                    reject(error);
                };
            } catch (error) {
                console.error('Error al crear la conexión SSE:', error);
                reject(error);
            }
        });
    }
    
    disconnect() {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
            this.connected = false;
            console.log('Conexión SSE cerrada');
        }
    }
    
    async executeMethod(method, params = {}) {
        if (!this.connected) {
            throw new Error('No hay conexión SSE activa');
        }
        
        const request = {
            jsonrpc: '2.0',
            id: String(this.requestId++),
            method,
            params
        };
        
        console.log('Enviando solicitud:', request);
        
        const response = await fetch(`${this.serverUrl}/message?sessionId=${this.sessionId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(request)
        });
        
        const responseData = await response.json();
        console.log('Respuesta recibida:', responseData);
        
        return responseData;
    }
    
    on(event, callback) {
        if (this.eventHandlers[event]) {
            this.eventHandlers[event].push(callback);
        }
        return this;
    }
    
    _triggerEvent(event, data) {
        if (this.eventHandlers[event]) {
            for (const callback of this.eventHandlers[event]) {
                callback(data);
            }
        }
    }
    
    // Métodos de conveniencia para las operaciones comunes
    async listTables() {
        return this.executeMethod('list-tables');
    }
    
    async describeTable(table) {
        return this.executeMethod('describe-table', { table });
    }
    
    async executeQuery(query) {
        return this.executeMethod('execute-query', { query });
    }
    
    async getMethods() {
        return this.executeMethod('get-methods');
    }
}

// Ejemplo de uso
async function main() {
    const client = new McpFirebirdSseClient();
    
    // Registrar manejadores de eventos
    client.on('open', () => {
        console.log('¡Conexión abierta!');
    });
    
    client.on('message', (data) => {
        console.log('Nuevo mensaje:', data);
    });
    
    client.on('error', (error) => {
        console.error('Error en la conexión:', error);
    });
    
    try {
        await client.connect();
        
        // Obtener la lista de métodos disponibles
        const methods = await client.getMethods();
        console.log('Métodos disponibles:', methods.result);
        
        // Listar tablas
        const tables = await client.listTables();
        console.log('Tablas disponibles:', tables.result);
        
        // Describir una tabla
        if (tables.result && tables.result.length > 0) {
            const tableInfo = await client.describeTable(tables.result[0]);
            console.log(`Información de la tabla ${tables.result[0]}:`, tableInfo.result);
        }
        
        // Ejecutar una consulta
        const queryResult = await client.executeQuery('SELECT * FROM EMPLOYEE LIMIT 5');
        console.log('Resultado de la consulta:', queryResult.result);
        
        // Mantener la conexión abierta por un tiempo
        await new Promise(resolve => setTimeout(resolve, 5000));
    } catch (error) {
        console.error('Error:', error);
    } finally {
        client.disconnect();
    }
}

// Ejecutar el ejemplo si este archivo se ejecuta directamente
if (require.main === module) {
    main().catch(console.error);
}

// Exportar la clase para su uso en otros archivos
module.exports = McpFirebirdSseClient;
