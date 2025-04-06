# Ejemplos de uso del transporte SSE en MCP Firebird

Este documento proporciona ejemplos detallados sobre cómo usar el transporte SSE (Server-Sent Events) con el servidor MCP Firebird.

## Introducción

El servidor MCP Firebird soporta el transporte SSE, lo que permite a los clientes conectarse al servidor a través de HTTP y recibir actualizaciones en tiempo real. Esta funcionalidad es especialmente útil para aplicaciones web que necesitan mantener una conexión persistente con el servidor.

## Configuración del servidor

Para iniciar el servidor MCP Firebird con soporte para SSE, siga estos pasos:

1. Configure las variables de entorno en su archivo `.env`:

```
TRANSPORT_TYPE=sse
SSE_PORT=3003
```

2. Inicie el servidor con el comando:

```bash
npm run sse
```

El servidor estará disponible en `http://localhost:3003`.

## Ejemplos de clientes

### 1. Cliente básico en HTML/JavaScript

Este es un ejemplo simple de un cliente SSE que se conecta al servidor MCP Firebird:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Cliente SSE para MCP Firebird</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        #log { border: 1px solid #ccc; padding: 10px; height: 300px; overflow-y: auto; margin-bottom: 10px; }
        button { padding: 8px 16px; margin-right: 10px; }
        input, select { padding: 8px; margin-bottom: 10px; width: 100%; }
    </style>
</head>
<body>
    <h1>Cliente SSE para MCP Firebird</h1>
    
    <div>
        <label for="serverUrl">URL del servidor:</label>
        <input type="text" id="serverUrl" value="http://localhost:3003" />
    </div>
    
    <div>
        <button id="connectBtn">Conectar</button>
        <button id="disconnectBtn" disabled>Desconectar</button>
    </div>
    
    <h2>Herramientas disponibles</h2>
    <div>
        <select id="toolSelect">
            <option value="list-tables">list-tables</option>
            <option value="describe-table">describe-table</option>
            <option value="execute-query">execute-query</option>
            <option value="get-methods">get-methods</option>
        </select>
        
        <div id="paramContainer" style="display: none;">
            <label for="paramInput">Parámetros (JSON):</label>
            <input type="text" id="paramInput" placeholder='{"table": "EMPLOYEE"}' />
        </div>
        
        <button id="executeBtn" disabled>Ejecutar</button>
    </div>
    
    <h2>Registro de eventos</h2>
    <div id="log"></div>
    
    <script>
        let eventSource = null;
        let sessionId = null;
        let requestId = 1;
        
        const serverUrlInput = document.getElementById('serverUrl');
        const connectBtn = document.getElementById('connectBtn');
        const disconnectBtn = document.getElementById('disconnectBtn');
        const toolSelect = document.getElementById('toolSelect');
        const paramContainer = document.getElementById('paramContainer');
        const paramInput = document.getElementById('paramInput');
        const executeBtn = document.getElementById('executeBtn');
        const logElement = document.getElementById('log');
        
        function log(message, type = 'info') {
            const entry = document.createElement('div');
            entry.className = `log-entry log-${type}`;
            entry.innerHTML = `<strong>${new Date().toLocaleTimeString()}</strong>: ${message}`;
            logElement.appendChild(entry);
            logElement.scrollTop = logElement.scrollHeight;
        }
        
        connectBtn.addEventListener('click', () => {
            const serverUrl = serverUrlInput.value;
            
            try {
                // Generar un ID de sesión único
                sessionId = `client-${Math.random().toString(36).substring(2, 15)}`;
                
                // Crear la conexión SSE
                eventSource = new EventSource(`${serverUrl}`);
                
                eventSource.onopen = () => {
                    log('Conexión SSE establecida', 'success');
                    connectBtn.disabled = true;
                    disconnectBtn.disabled = false;
                    executeBtn.disabled = false;
                };
                
                eventSource.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        log(`Mensaje recibido: ${JSON.stringify(data, null, 2)}`, 'receive');
                    } catch (error) {
                        log(`Mensaje recibido (no JSON): ${event.data}`, 'receive');
                    }
                };
                
                eventSource.onerror = (error) => {
                    log(`Error en la conexión SSE: ${error.message || 'Error desconocido'}`, 'error');
                    disconnectEventSource();
                };
                
                log(`Conectando a ${serverUrl}...`);
            } catch (error) {
                log(`Error al crear la conexión SSE: ${error.message}`, 'error');
            }
        });
        
        disconnectBtn.addEventListener('click', disconnectEventSource);
        
        function disconnectEventSource() {
            if (eventSource) {
                eventSource.close();
                eventSource = null;
                sessionId = null;
                
                connectBtn.disabled = false;
                disconnectBtn.disabled = true;
                executeBtn.disabled = true;
                
                log('Conexión SSE cerrada');
            }
        }
        
        toolSelect.addEventListener('change', () => {
            // Mostrar el contenedor de parámetros para herramientas que los necesitan
            const selectedTool = toolSelect.value;
            
            if (selectedTool === 'describe-table' || selectedTool === 'execute-query') {
                paramContainer.style.display = 'block';
                
                if (selectedTool === 'describe-table') {
                    paramInput.placeholder = '{"table": "EMPLOYEE"}';
                } else if (selectedTool === 'execute-query') {
                    paramInput.placeholder = '{"query": "SELECT * FROM EMPLOYEE LIMIT 5"}';
                }
            } else {
                paramContainer.style.display = 'none';
            }
        });
        
        executeBtn.addEventListener('click', async () => {
            if (!eventSource || !sessionId) {
                log('No hay conexión SSE activa', 'error');
                return;
            }
            
            const selectedTool = toolSelect.value;
            let params = {};
            
            if (paramContainer.style.display !== 'none') {
                try {
                    params = JSON.parse(paramInput.value || '{}');
                } catch (error) {
                    log(`Error al parsear los parámetros JSON: ${error.message}`, 'error');
                    return;
                }
            }
            
            const request = {
                jsonrpc: '2.0',
                id: String(requestId++),
                method: selectedTool,
                params
            };
            
            log(`Enviando solicitud: ${JSON.stringify(request)}`, 'send');
            
            try {
                const serverUrl = serverUrlInput.value;
                const response = await fetch(`${serverUrl}/message?sessionId=${sessionId}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(request)
                });
                
                const responseData = await response.json();
                log(`Respuesta recibida: ${JSON.stringify(responseData, null, 2)}`, 'receive');
            } catch (error) {
                log(`Error al enviar la solicitud: ${error.message}`, 'error');
            }
        });
    </script>
</body>
</html>
```

### 2. Cliente Node.js

Este es un ejemplo de un cliente Node.js que se conecta al servidor MCP Firebird usando SSE:

```javascript
// sse-client.js
const fetch = require('node-fetch');
const EventSource = require('eventsource');

class McpFirebirdSseClient {
    constructor(serverUrl = 'http://localhost:3003') {
        this.serverUrl = serverUrl;
        this.eventSource = null;
        this.sessionId = `node-client-${Math.random().toString(36).substring(2, 15)}`;
        this.requestId = 1;
        this.connected = false;
    }
    
    connect() {
        return new Promise((resolve, reject) => {
            try {
                console.log(`Conectando a ${this.serverUrl}...`);
                
                this.eventSource = new EventSource(`${this.serverUrl}`);
                
                this.eventSource.onopen = () => {
                    console.log('Conexión SSE establecida');
                    this.connected = true;
                    resolve();
                };
                
                this.eventSource.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        console.log('Mensaje recibido:', data);
                    } catch (error) {
                        console.log('Mensaje recibido (no JSON):', event.data);
                    }
                };
                
                this.eventSource.onerror = (error) => {
                    console.error('Error en la conexión SSE:', error);
                    this.connected = false;
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
    } catch (error) {
        console.error('Error:', error);
    } finally {
        client.disconnect();
    }
}

main();
```

Para ejecutar este ejemplo, necesitará instalar las dependencias:

```bash
npm install node-fetch eventsource
```

### 3. Cliente Python

Este es un ejemplo de un cliente Python que se conecta al servidor MCP Firebird usando SSE:

```python
# sse_client.py
import json
import random
import string
import time
import requests
import sseclient

class McpFirebirdSseClient:
    def __init__(self, server_url='http://localhost:3003'):
        self.server_url = server_url
        self.session_id = f"python-client-{''.join(random.choices(string.ascii_lowercase + string.digits, k=10))}"
        self.request_id = 1
        self.connected = False
        self.sse_client = None
    
    def connect(self):
        try:
            print(f"Conectando a {self.server_url}...")
            
            headers = {'Accept': 'text/event-stream'}
            response = requests.get(f"{self.server_url}", stream=True, headers=headers)
            self.sse_client = sseclient.SSEClient(response)
            
            self.connected = True
            print("Conexión SSE establecida")
            
            # Iniciar un hilo para procesar eventos
            import threading
            self.event_thread = threading.Thread(target=self._process_events)
            self.event_thread.daemon = True
            self.event_thread.start()
            
            return True
        except Exception as e:
            print(f"Error al crear la conexión SSE: {e}")
            return False
    
    def _process_events(self):
        try:
            for event in self.sse_client.events():
                try:
                    data = json.loads(event.data)
                    print(f"Mensaje recibido: {data}")
                except:
                    print(f"Mensaje recibido (no JSON): {event.data}")
        except Exception as e:
            print(f"Error en el procesamiento de eventos: {e}")
            self.connected = False
    
    def disconnect(self):
        if self.sse_client:
            self.sse_client.close()
            self.sse_client = None
            self.connected = False
            print("Conexión SSE cerrada")
    
    def execute_method(self, method, params=None):
        if not self.connected:
            raise Exception("No hay conexión SSE activa")
        
        if params is None:
            params = {}
        
        request = {
            "jsonrpc": "2.0",
            "id": str(self.request_id),
            "method": method,
            "params": params
        }
        self.request_id += 1
        
        print(f"Enviando solicitud: {request}")
        
        response = requests.post(
            f"{self.server_url}/message?sessionId={self.session_id}",
            headers={"Content-Type": "application/json"},
            json=request
        )
        
        response_data = response.json()
        print(f"Respuesta recibida: {response_data}")
        
        return response_data
    
    def list_tables(self):
        return self.execute_method("list-tables")
    
    def describe_table(self, table):
        return self.execute_method("describe-table", {"table": table})
    
    def execute_query(self, query):
        return self.execute_method("execute-query", {"query": query})
    
    def get_methods(self):
        return self.execute_method("get-methods")

# Ejemplo de uso
def main():
    client = McpFirebirdSseClient()
    
    try:
        if client.connect():
            # Dar tiempo para que se establezca la conexión
            time.sleep(1)
            
            # Obtener la lista de métodos disponibles
            methods = client.get_methods()
            print(f"Métodos disponibles: {methods.get('result', [])}")
            
            # Listar tablas
            tables = client.list_tables()
            print(f"Tablas disponibles: {tables.get('result', [])}")
            
            # Describir una tabla
            if tables.get('result') and len(tables['result']) > 0:
                table_info = client.describe_table(tables['result'][0])
                print(f"Información de la tabla {tables['result'][0]}: {table_info.get('result', {})}")
            
            # Ejecutar una consulta
            query_result = client.execute_query("SELECT * FROM EMPLOYEE LIMIT 5")
            print(f"Resultado de la consulta: {query_result.get('result', {})}")
            
            # Mantener la conexión abierta por un tiempo
            time.sleep(5)
    except Exception as e:
        print(f"Error: {e}")
    finally:
        client.disconnect()

if __name__ == "__main__":
    main()
```

Para ejecutar este ejemplo, necesitará instalar las dependencias:

```bash
pip install requests sseclient-py
```

## Notas importantes

1. **Manejo de sesiones**: El servidor MCP Firebird utiliza IDs de sesión para mantener el seguimiento de las conexiones SSE. Asegúrese de incluir el ID de sesión en todas las solicitudes POST al endpoint `/message`.

2. **Formato de mensajes**: Todas las solicitudes deben seguir el formato JSON-RPC 2.0:
   ```json
   {
     "jsonrpc": "2.0",
     "id": "1",
     "method": "list-tables",
     "params": {}
   }
   ```

3. **Manejo de errores**: Es importante implementar un manejo adecuado de errores en su cliente, especialmente para la reconexión en caso de que se pierda la conexión SSE.

4. **CORS**: El servidor MCP Firebird tiene habilitado CORS para permitir conexiones desde cualquier origen. Si está teniendo problemas con CORS, asegúrese de que su cliente esté configurado correctamente.

## Solución de problemas

### La conexión SSE se cierra inesperadamente

Si la conexión SSE se cierra inesperadamente, puede deberse a varias razones:

1. **Timeout del servidor**: Algunas configuraciones de servidor pueden cerrar conexiones inactivas después de un cierto tiempo. Considere implementar un mecanismo de "heartbeat" en su cliente.

2. **Problemas de red**: Las conexiones SSE son sensibles a problemas de red. Implemente un mecanismo de reconexión automática en su cliente.

3. **Errores en el servidor**: Verifique los logs del servidor para identificar posibles errores.

### No se reciben respuestas a las solicitudes

Si no recibe respuestas a sus solicitudes, verifique:

1. **ID de sesión**: Asegúrese de que está incluyendo el ID de sesión correcto en sus solicitudes POST.

2. **Formato de la solicitud**: Verifique que sus solicitudes siguen el formato JSON-RPC 2.0 correcto.

3. **Endpoint correcto**: Asegúrese de que está enviando las solicitudes al endpoint `/message` correcto.

## Conclusión

El transporte SSE proporciona una forma eficiente y sencilla de conectarse al servidor MCP Firebird desde aplicaciones web y otros clientes. Con los ejemplos proporcionados en este documento, debería poder implementar su propio cliente SSE para interactuar con el servidor MCP Firebird.

Para más información, consulte la documentación oficial del protocolo MCP y la especificación SSE.
