#!/usr/bin/env python3
# test-mcp-client.py
# Script para probar la conexión con el servidor MCP Firebird usando el SDK de MCP

import requests
import json
import time
import threading
import sys

# Configuración
SERVER_URL = "http://localhost:3005"

# Clase para el cliente MCP
class MCPClient:
    def __init__(self, server_url):
        self.server_url = server_url
        self.session_id = None
        self.message_endpoint = None
        self.connected = False
        self.sse_thread = None
        self.sse_response = None

    def connect(self):
        """Establece una conexión SSE con el servidor MCP"""
        print(f"Conectando a {self.server_url}...")

        try:
            # Iniciar la conexión SSE
            self.sse_response = requests.get(self.server_url, stream=True)

            if self.sse_response.status_code != 200:
                print(f"Error al conectar: {self.sse_response.status_code}")
                return False

            print("Conexión SSE establecida")

            # Evento para señalar cuando se recibe el endpoint
            endpoint_received = threading.Event()

            # Función para procesar eventos SSE
            def process_sse():
                current_event = None
                event_data = ""

                for line in self.sse_response.iter_lines():
                    if not line:
                        continue

                    line = line.decode('utf-8')
                    print(f"SSE << {line}")

                    if line.startswith('event:'):
                        current_event = line[6:].strip()
                    elif line.startswith('data:'):
                        event_data = line[5:].strip()

                        if current_event == 'endpoint':
                            self.message_endpoint = event_data

                            # Extraer el session_id del endpoint
                            if '?sessionId=' in event_data:
                                self.session_id = event_data.split('?sessionId=')[1]
                                print(f"ID de sesión: {self.session_id}")
                                self.connected = True
                                endpoint_received.set()

                            current_event = None
                        elif current_event:
                            try:
                                data = json.loads(event_data)
                                print(f"Evento {current_event}: {json.dumps(data, indent=2)}")
                            except:
                                print(f"Evento {current_event}: {event_data}")

                            current_event = None
                        else:
                            try:
                                data = json.loads(event_data)
                                print(f"Datos: {json.dumps(data, indent=2)}")
                            except:
                                if event_data:
                                    print(f"Datos: {event_data}")

            # Iniciar el hilo para procesar eventos SSE
            self.sse_thread = threading.Thread(target=process_sse)
            self.sse_thread.daemon = True
            self.sse_thread.start()

            # Esperar a que se reciba el endpoint
            print("Esperando endpoint...")
            if not endpoint_received.wait(timeout=5):
                print("Tiempo de espera agotado esperando el endpoint")
                return False

            return True

        except Exception as e:
            print(f"Error al conectar: {e}")
            return False

    def send_request(self, method, params=None):
        """Envía una solicitud al servidor MCP"""
        if not self.connected or not self.message_endpoint or not self.session_id:
            print("No hay conexión establecida")
            return None

        if params is None:
            params = {}

        request = {
            "jsonrpc": "2.0",
            "id": str(int(time.time())),
            "method": method,
            "params": params
        }

        print(f"Enviando solicitud: {json.dumps(request, indent=2)}")

        try:
            # Construir la URL completa
            url = f"{self.server_url}{self.message_endpoint}"
            if not url.startswith('http'):
                url = f"{self.server_url}{self.message_endpoint}"

            print(f"URL: {url}")

            response = requests.post(
                url,
                headers={"Content-Type": "application/json"},
                json=request
            )

            print(f"Código de estado: {response.status_code}")

            if response.status_code != 200:
                print(f"Error: {response.text}")
                return None

            try:
                return response.json()
            except json.JSONDecodeError:
                print(f"Error al decodificar JSON: {response.text}")
                return None

        except Exception as e:
            print(f"Error al enviar la solicitud: {e}")
            return None

    def close(self):
        """Cierra la conexión con el servidor"""
        if self.sse_response:
            self.sse_response.close()

        self.connected = False
        print("Conexión cerrada")

# Función principal
def main():
    client = MCPClient(SERVER_URL)

    try:
        # Conectar al servidor
        if not client.connect():
            print("No se pudo conectar al servidor")
            return

        # Probar get-methods
        print("\n--- Probando get-methods ---")
        methods_response = client.send_request("get-methods")
        if methods_response:
            print(f"Métodos disponibles: {json.dumps(methods_response, indent=2)}")

        # Probar list-tables
        print("\n--- Probando list-tables ---")
        tables_response = client.send_request("list-tables")
        if tables_response:
            print(f"Tablas disponibles: {json.dumps(tables_response, indent=2)}")

        # Mantener la conexión abierta por un tiempo
        print("\nManteniendo la conexión abierta por 5 segundos...")
        time.sleep(5)

    except KeyboardInterrupt:
        print("\nInterrumpido por el usuario")

    finally:
        client.close()
        print("Finalizando prueba")

if __name__ == "__main__":
    main()
