#!/usr/bin/env node

require('dotenv').config();
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const VERSION = require('./version');
const fs = require('fs');
const WebSocket = require('ws');
const axios = require('axios');

// Configuración del servidor
const SERVER_PORT = process.env.PORT || 3001;
const WS_PORT = process.env.WS_PORT || 3002;
const SERVER_PATH = path.join(__dirname, 'server.js');
const LOCK_FILE = path.join(__dirname, 'server.lock');
const PID_FILE = path.join(__dirname, 'server.pid');
let serverProcess = null;

// Función para enviar mensajes en formato JSON-RPC
function sendJsonRpcNotification(method, params = {}) {
    const notification = {
        jsonrpc: "2.0",
        method: method,
        params: params
    };
    process.stdout.write(JSON.stringify(notification) + '\n');
}

// Función para verificar el estado del servidor
async function checkServerStatus() {
    try {
        const response = await axios.get(`http://localhost:${SERVER_PORT}/status`, {
            timeout: 2000,
            validateStatus: function (status) {
                return status >= 200 && status < 300;
            }
        });
        return response.data.status === 'ready' || response.data.status === 'running';
    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            return false;
        }
        console.error('[DEBUG] Error al verificar estado del servidor:', error.message);
        return false;
    }
}

// Función para limpiar recursos
async function cleanup() {
    console.error('[DEBUG] Iniciando limpieza de recursos...');
    
    if (serverProcess) {
        try {
            // Verificar si el proceso todavía existe
            try {
                process.kill(serverProcess.pid, 0);
                console.error(`[DEBUG] Terminando proceso del servidor (PID: ${serverProcess.pid})`);
                serverProcess.kill();
            } catch (error) {
                if (error.code !== 'ESRCH') {
                    console.error('[DEBUG] Error verificando proceso:', error);
                }
            }
        } catch (error) {
            console.error('[DEBUG] Error al terminar proceso:', error);
        }
    }

    try {
        // Limpiar archivo de bloqueo
        if (fs.existsSync(LOCK_FILE)) {
            console.error('[DEBUG] Limpiando archivo de bloqueo...');
            fs.unlinkSync(LOCK_FILE);
            console.error('[DEBUG] Archivo de bloqueo eliminado');
        }

        // Limpiar archivo PID
        if (fs.existsSync(PID_FILE)) {
            console.error('[DEBUG] Limpiando archivo PID...');
            fs.unlinkSync(PID_FILE);
            console.error('[DEBUG] Archivo PID eliminado');
        }
    } catch (error) {
        console.error('[DEBUG] Error limpiando archivos:', error);
    }
}

// Función para esperar a que el servidor esté listo
async function waitForServer() {
    let retries = 0;
    const maxRetries = 30;
    const delay = 1000;

    while (retries < maxRetries) {
        try {
            if (await checkServerStatus()) {
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, delay));
            retries++;
        } catch (error) {
            console.error('[DEBUG] Error verificando estado del servidor:', error);
            await new Promise(resolve => setTimeout(resolve, delay));
            retries++;
        }
    }
    throw new Error('El servidor no pudo iniciarse después de varios intentos');
}

async function startServer() {
    try {
        // Verificar si hay un servidor corriendo
        if (await checkServerStatus()) {
            console.error('[DEBUG] El servidor ya está corriendo');
            return;
        }

        // Limpiar recursos anteriores
        await cleanup();

        // Crear archivo de bloqueo
        console.error('[DEBUG] Creando archivo de bloqueo...');
        await fs.promises.writeFile(LOCK_FILE, JSON.stringify({
            pid: process.pid,
            timestamp: Date.now()
        }));

        // Iniciar el servidor
        console.error('[DEBUG] Iniciando servidor...');
        serverProcess = spawn('node', [SERVER_PATH], {
            stdio: ['pipe', 'pipe', 'pipe'],
            detached: false,
            env: {
                ...process.env,
                PORT: SERVER_PORT.toString(),
                WS_PORT: WS_PORT.toString()
            }
        });

        // Guardar el PID
        console.error(`[DEBUG] Guardando PID del servidor: ${serverProcess.pid}`);
        await fs.promises.writeFile(PID_FILE, serverProcess.pid.toString());

        // Manejar la salida del servidor
        serverProcess.stdout.on('data', (data) => {
            process.stdout.write(data);
        });

        serverProcess.stderr.on('data', (data) => {
            process.stderr.write(data);
        });

        // Manejar el cierre del proceso
        serverProcess.on('close', (code) => {
            console.error(`[DEBUG] Servidor terminado con código ${code}`);
            cleanup();
        });

        serverProcess.on('error', (error) => {
            console.error('[DEBUG] Error en el proceso del servidor:', error);
            cleanup();
        });

        // Esperar a que el servidor esté listo
        console.error('[DEBUG] Esperando a que el servidor esté listo...');
        await waitForServer();
        console.error('[DEBUG] Servidor iniciado exitosamente');

    } catch (error) {
        console.error('[DEBUG] Error al iniciar el servidor:', error);
        await cleanup();
        process.exit(1);
    }
}

// Enviar mensaje de inicialización
sendJsonRpcNotification("server/status", {
    status: "initializing",
    version: VERSION
});

// Manejar señales de terminación
process.on('SIGINT', async () => {
    console.error('[DEBUG] Señal SIGINT recibida');
    await cleanup();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.error('[DEBUG] Señal SIGTERM recibida');
    await cleanup();
    process.exit(0);
});

// Manejar errores no capturados
process.on('uncaughtException', async (error) => {
    console.error('[DEBUG] Error no capturado:', error);
    await cleanup();
    process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
    console.error('[DEBUG] Promesa rechazada no manejada:', reason);
    await cleanup();
    process.exit(1);
});

// Iniciar el servidor
startServer().catch(error => {
    console.error('[DEBUG] Error fatal:', error);
    cleanup();
    process.exit(1);
});