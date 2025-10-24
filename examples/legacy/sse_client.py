#!/usr/bin/env python3
# sse_client.py
# Cliente Python para conectarse al servidor MCP Firebird usando SSE
# Para ejecutar este ejemplo: pip install requests sseclient-py

import json
import random
import string
import time
import threading
import requests
import sseclient

class McpFirebirdSseClient:
    def __init__(self, server_url='http://localhost:3003'):
        self.server_url = server_url
        self.session_id = f"python-client-{''.join(random.choices(string.ascii_lowercase + string.digits, k=10))}"
        self.request_id = 1
        self.connected = False
        self.sse_client = None
        self.event_thread = None
        self.event_handlers = {
            'message': [],
            'error': [],
            'open': []
        }
    
    def connect(self):
        try:
            print(f"Conectando a {self.server_url}...")
            
            headers = {'Accept': 'text/event-stream'}
            response = requests.get(f"{self.server_url}", stream=True, headers=headers)
            self.sse_client = sseclient.SSEClient(response)
            
            self.connected = True
            print("Conexión SSE establecida")
            
            # Notificar a los manejadores de eventos
            self._trigger_event('open')
            
            # Iniciar un hilo para procesar eventos
            self.event_thread = threading.Thread(target=self._process_events)
            self.event_thread.daemon = True
            self.event_thread.start()
            
            return True
        except Exception as e:
            print(f"Error al crear la conexión SSE: {e}")
            self._trigger_event('error', e)
            return False
    
    def _process_events(self):
        try:
            for event in self.sse_client.events():
                try:
                    data = json.loads(event.data)
                    print(f"Mensaje recibido: {data}")
                    self._trigger_event('message', data)
                except:
                    print(f"Mensaje recibido (no JSON): {event.data}")
                    self._trigger_event('message', event.data)
        except Exception as e:
            print(f"Error en el procesamiento de eventos: {e}")
            self.connected = False
            self._trigger_event('error', e)
    
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
    
    def on(self, event, callback):
        if event in self.event_handlers:
            self.event_handlers[event].append(callback)
        return self
    
    def _trigger_event(self, event, data=None):
        if event in self.event_handlers:
            for callback in self.event_handlers[event]:
                callback(data)
    
    # Métodos de conveniencia para las operaciones comunes
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
    
    # Registrar manejadores de eventos
    client.on('open', lambda _: print("¡Conexión abierta!"))
    client.on('message', lambda data: print(f"Nuevo mensaje: {data}"))
    client.on('error', lambda error: print(f"Error en la conexión: {error}"))
    
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
