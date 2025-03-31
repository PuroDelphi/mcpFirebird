/**
 * MCP-Guard - Implementación del Model Context Protocol para Node.js
 * 
 * Este script intercepta stdout para garantizar que solo mensajes JSON válidos
 * se envíen a stdout, mientras todos los logs y mensajes de error van a stderr.
 * Esto es esencial para que el cliente MCP pueda comunicarse correctamente.
 */

// Guardar referencias originales
const originalStdoutWrite = process.stdout.write.bind(process.stdout);
const originalStderrWrite = process.stderr.write.bind(process.stderr);
const originalConsoleLog = console.log;
const originalConsoleInfo = console.info;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

/**
 * Verifica si una cadena es JSON válido
 * @param {string} str - Cadena a verificar
 * @returns {boolean} True si es JSON válido
 */
function isValidJson(str) {
    if (typeof str !== 'string') return false;
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
 * Configurar interceptores para stdout y console.*
 */
function setupMCPGuard() {
    // Interceptar stdout.write
    process.stdout.write = function(chunk, encoding, callback) {
        const data = chunk.toString();
        
        // Si es JSON válido, permitir envío a stdout
        if (isValidJson(data)) {
            return originalStdoutWrite(chunk, encoding, callback);
        } else {
            // Si no es JSON válido, redirigir a stderr
            originalStderrWrite(`[MCP-GUARD] Redirected non-JSON: ${data}`);
            
            // Mantener la interfaz del callback
            if (typeof callback === 'function') {
                callback();
            }
            return true;
        }
    };
    
    // Redirigir console.* a stderr
    console.log = function() {
        const args = Array.from(arguments);
        originalStderrWrite(`[LOG] ${args.join(' ')}\n`);
    };
    
    console.info = function() {
        const args = Array.from(arguments);
        originalStderrWrite(`[INFO] ${args.join(' ')}\n`);
    };
    
    console.warn = function() {
        const args = Array.from(arguments);
        originalStderrWrite(`[WARN] ${args.join(' ')}\n`);
    };
    
    console.error = function() {
        const args = Array.from(arguments);
        originalStderrWrite(`[ERROR] ${args.join(' ')}\n`);
    };
    
    originalStderrWrite('[MCP-GUARD] Activated - All non-JSON output redirected to stderr\n');
}

// Ejecutar el guard inmediatamente
setupMCPGuard();

// Ejecutar el servidor MCP
import('./dist/index.js').catch(err => {
    originalStderrWrite(`[FATAL] Error loading MCP server: ${err}\n`);
    process.exit(1);
});
