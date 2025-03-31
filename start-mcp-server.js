#!/usr/bin/env node

/**
 * MCP Firebird - Script de inicio con protección MCP
 * 
 * Este script inicia el servidor Firebird asegurando el cumplimiento del Model Context Protocol,
 * que requiere que solo mensajes JSON válidos vayan a stdout, mientras todos los logs
 * se redirigen a stderr.
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Obtener ruta del servidor
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverPath = path.join(__dirname, 'dist', 'index.js');

// Función simple para verificar si un texto es JSON válido
function isJsonString(str) {
    try {
        const json = JSON.parse(str);
        return typeof json === 'object';
    } catch (e) {
        return false;
    }
}

// Mensaje de inicio
console.error('[MCP-SERVER] Iniciando servidor MCP Firebird con protección de protocolo');

// Crear el proceso del servidor
const serverProcess = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: process.env
});

// Manejar stdout del servidor - Solo permitir JSON válido
serverProcess.stdout.on('data', (data) => {
    const text = data.toString().trim();
    if (isJsonString(text)) {
        process.stdout.write(data);
    } else {
        console.error(`[MCP-SERVER] Redirigiendo no-JSON: ${text}`);
    }
});

// Redirigir stderr a process.stderr
serverProcess.stderr.on('data', (data) => {
    process.stderr.write(data);
});

// Manejar eventos del proceso hijo
serverProcess.on('error', (err) => {
    console.error(`[MCP-SERVER] Error al iniciar servidor: ${err.message}`);
    process.exit(1);
});

serverProcess.on('close', (code) => {
    console.error(`[MCP-SERVER] Servidor finalizado con código: ${code}`);
    process.exit(code);
});

// Reenviar señales al proceso hijo
['SIGINT', 'SIGTERM', 'SIGHUP'].forEach(signal => {
    process.on(signal, () => {
        console.error(`[MCP-SERVER] Recibida señal ${signal}, cerrando servidor`);
        serverProcess.kill(signal);
    });
});
