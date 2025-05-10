#!/usr/bin/env python3
# test-sse.py
# Script simple para probar la conexión SSE con el servidor MCP Firebird

import requests
import json
import time
import threading

# Configuración
SERVER_URL = "http://localhost:3003"
SESSION_ID = None

# Función para enviar una solicitud al servidor
def send_request(method, params=None, session_id=None):
    if params is None:
        params = {}

    if session_id is None:
        print("No hay ID de sesión disponible")
        return None

    request = {
        "jsonrpc": "2.0",
        "id": str(int(time.time())),
        "method": method,
        "params": params
    }

    print(f"Enviando solicitud: {json.dumps(request, indent=2)}")

    try:
        response = requests.post(
            f"{SERVER_URL}/message?sessionId={session_id}",
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

# Función principal
def main():
    print(f"Probando conexión SSE con el servidor {SERVER_URL}")

    # Establecer la conexión SSE
    try:
        # Conectar sin sessionId, el servidor nos enviará un endpoint con el sessionId
        print("Conectando al servidor SSE...")
        sse_response = requests.get(f"{SERVER_URL}", stream=True)
        print(f"Conexión SSE establecida con código de estado: {sse_response.status_code}")

        # Iniciar un hilo para leer eventos SSE
        endpoint_event_received = threading.Event()

        def read_sse():
            current_event = None
            event_data = ""

            for line in sse_response.iter_lines():
                if line:
                    decoded_line = line.decode('utf-8')
                    print(f"Recibido: {decoded_line}")

                    # Manejar líneas de eventos SSE
                    if decoded_line.startswith('event:'):
                        current_event = decoded_line[6:].strip()
                        print(f"Evento: {current_event}")
                    elif decoded_line.startswith('data:'):
                        event_data = decoded_line[5:].strip()
                        print(f"Datos: {event_data}")

                        # Si tenemos un evento y datos, procesarlos
                        if current_event == 'endpoint':
                            print(f"Evento endpoint recibido: {event_data}")
                            # Extraer el sessionId de la URL del endpoint
                            if '?sessionId=' in event_data:
                                global SESSION_ID
                                SESSION_ID = event_data.split('?sessionId=')[1]
                                print(f"Nuevo ID de sesión: {SESSION_ID}")
                                endpoint_event_received.set()
                            current_event = None

        sse_thread = threading.Thread(target=read_sse)
        sse_thread.daemon = True
        sse_thread.start()

        # Esperar a que se reciba el evento endpoint
        print("Esperando evento endpoint...")
        if not endpoint_event_received.wait(timeout=10):
            print("Tiempo de espera agotado para el evento endpoint")
            return

        # Probar get-methods
        print("\n--- Probando get-methods ---")
        methods_response = send_request("get-methods", session_id=SESSION_ID)
        if methods_response:
            print(f"Métodos disponibles: {json.dumps(methods_response, indent=2)}")

        # Probar list-tables
        print("\n--- Probando list-tables ---")
        tables_response = send_request("list-tables", session_id=SESSION_ID)
        if tables_response:
            print(f"Tablas disponibles: {json.dumps(tables_response, indent=2)}")

        # Mantener el script en ejecución por un tiempo
        print("\nManteniendo la conexión abierta por 5 segundos...")
        time.sleep(5)

    except Exception as e:
        print(f"Error: {e}")
    finally:
        print("Finalizando prueba")

if __name__ == "__main__":
    main()
