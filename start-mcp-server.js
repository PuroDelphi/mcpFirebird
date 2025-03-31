#!/usr/bin/env node

/**
 * MCP Firebird - Script de inicio con protección MCP
 * 
 * Este script inicia el servidor Firebird asegurando el cumplimiento del Model Context Protocol
 * que requiere que solo mensajes JSON válidos vayan a stdout, mientras todos los logs
 * se redirigen a stderr.
 */

// Guardar referencias originales a los streams y funciones
const originalStdoutWrite = process.stdout.write.bind(process.stdout);
const originalStderrWrite = process.stderr.write.bind(process.stderr);
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;
const originalConsoleInfo = console.info;

/**
 * Verifica si una cadena es un JSON válido
 * @param {string} str - Cadena a verificar
 * @returns {boolean} True si es JSON válido
 */
function isValidJson(str) {
    if (typeof str !== 'string') return false;
    
    // Eliminar espacios en blanco al inicio y fin
    str = str.trim();
    
    // Verificar si comienza con { o [ (indicador básico de JSON)
    if (!(str.startsWith('{') || str.startsWith('['))) {
        return false;
    }
    
    try {
        JSON.parse(str);
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Activa el modo estricto MCP
 */
function activateMCPGuard() {
    originalStderrWrite("[MCP-GUARD] Activando protección del Model Context Protocol\n");
    
    // Interceptar process.stdout.write
    process.stdout.write = function(chunk, encoding, callback) {
        const data = chunk.toString();
        
        // Si es JSON válido, permitir que se escriba a stdout
        if (isValidJson(data)) {
            return originalStdoutWrite(chunk, encoding, callback);
        } else {
            // Si no es JSON válido, redirigir a stderr con prefijo
            originalStderrWrite(`[MCP-GUARD] Redirigiendo mensajes no-JSON a stderr: ${data}`);
            
            // Mantener la funcionalidad del callback
            if (typeof callback === 'function') {
                callback();
            }
            return true;
        }
    };
    
    // Redirigir todos los métodos de console a stderr
    console.log = function(...args) {
        originalStderrWrite(`[LOG] ${args.join(' ')}\n`);
    };
    
    console.info = function(...args) {
        originalStderrWrite(`[INFO] ${args.join(' ')}\n`);
    };
    
    console.warn = function(...args) {
        originalStderrWrite(`[WARN] ${args.join(' ')}\n`);
    };
    
    console.error = function(...args) {
        originalStderrWrite(`[ERROR] ${args.join(' ')}\n`);
    };
    
    originalStderrWrite("[MCP-GUARD] Protección activada - Solo JSON válido irá a stdout\n");
}

// Activar la protección MCP inmediatamente antes de cualquier otra operación
activateMCPGuard();

// Cargar y ejecutar el servidor
originalStderrWrite("[MCP-GUARD] Iniciando servidor MCP Firebird...\n");

// Importar el módulo del servidor y manejar cualquier error
import('./dist/index.js').catch(err => {
    originalStderrWrite(`[FATAL] Error al cargar el servidor MCP: ${err}\n`);
    if (err.stack) {
        originalStderrWrite(`[FATAL] Stack de error: ${err.stack}\n`);
    }
    process.exit(1);
});
