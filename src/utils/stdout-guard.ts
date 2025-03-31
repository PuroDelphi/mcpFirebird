/**
 * Este archivo contiene utilidades para proteger stdout
 * El Model Context Protocol requiere que stdout esté completamente limpio
 * y que solo se envíen mensajes JSON válidos a stdout.
 * Todos los demás mensajes (logs, advertencias, errores) deben ir a stderr.
 */

// Guardar referencia original
const originalStdoutWrite = process.stdout.write.bind(process.stdout);
const originalStderrWrite = process.stderr.write.bind(process.stderr);

// Controlar si el guard está activo o no
let guardActive = false;

/**
 * Configura la protección de stdout según los lineamientos MCP
 * - Si el mensaje es un objeto JSON válido, se envía a stdout
 * - De lo contrario, se redirige a stderr
 */
export function setupStdoutGuard(): void {
    guardActive = true;
    
    // Log inicial (va a stderr)
    process.stderr.write('[stdout-guard] INFO: Protección de stdout activada\n');
    
    // Reemplazar stdout.write
    process.stdout.write = function (buffer: string | Uint8Array, ...args: any[]): boolean {
        if (!guardActive) {
            return originalStdoutWrite(buffer, ...args);
        }
        
        // Convertir a string
        const str = buffer instanceof Uint8Array 
            ? Buffer.from(buffer).toString('utf8')
            : buffer.toString();
        
        // Ignorar cadenas vacías
        if (!str.trim()) {
            return true;
        }
        
        // Verificar si es un posible mensaje JSON
        const trimmed = str.trim();
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            // Enviar a stdout sin validar (para evitar problemas con JSON parcial)
            return originalStdoutWrite(buffer, ...args);
        } else {
            // Redirigir cualquier otro mensaje a stderr
            return originalStderrWrite(buffer, ...args);
        }
    };
}

/**
 * Restaura el comportamiento original de stdout
 */
export function restoreStdout(): void {
    if (guardActive) {
        process.stderr.write('[stdout-guard] INFO: Protección de stdout desactivada\n');
        process.stdout.write = originalStdoutWrite;
        process.stderr.write = originalStderrWrite;
        guardActive = false;
    }
}

/**
 * Envía un mensaje directamente a stderr, incluso si stdout-guard está activo
 * @param {string} message - Mensaje a enviar
 */
export function logToStderr(message: string): void {
    originalStderrWrite(`${message}\n`);
}

/**
 * Envía un mensaje formateado a stderr
 * @param {string} tag - Etiqueta para el mensaje
 * @param {string} message - Contenido del mensaje
 * @param {string} level - Nivel del mensaje (INFO, WARN, ERROR)
 */
export function logTagged(tag: string, message: string, level: string = 'INFO'): void {
    logToStderr(`[${tag}] ${level}: ${message}`);
}

// Exportar funciones
export default {
    setupStdoutGuard,
    restoreStdout,
    logToStderr,
    logTagged
};