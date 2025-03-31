/**
 * MCP Guard - Asegura que MCP Firebird cumpla con el Model Context Protocol
 * 
 * El Model Context Protocol requiere que:
 * 1. stdout contenga SOLO mensajes JSON válidos
 * 2. Todos los logs y mensajes de error vayan a stderr
 * 3. No haya mezcla de mensajes JSON y no-JSON en stdout
 */

// Referencias originales
const originalStdoutWrite = process.stdout.write.bind(process.stdout);
const originalStderrWrite = process.stderr.write.bind(process.stderr);
const originalConsoleLog = console.log;
const originalConsoleInfo = console.info;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

/**
 * Activa el guard MCP que asegura:
 * - stdout solo recibirá mensajes JSON válidos
 * - Todos los logs irán a stderr
 * - console.log será redirigido a stderr
 */
export function setupMCPGuard(): void {
    // Sobreescribir stdout.write para asegurar que solo JSON válido pase
    process.stdout.write = function(buffer: string | Uint8Array, ...args: any[]): boolean {
        const str = buffer instanceof Uint8Array
            ? Buffer.from(buffer).toString('utf8')
            : buffer.toString();
        
        // Si está vacío, ignoramos
        if (!str.trim()) return true;
        
        // Verificar si es un posible mensaje JSON
        const trimmed = str.trim();
        
        // Solo permitir objetos JSON completos en stdout
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            try {
                // Intentar parsear como JSON para confirmar que es válido
                JSON.parse(trimmed);
                // Si llega aquí, es JSON válido, enviarlo a stdout
                return originalStdoutWrite(buffer, ...args);
            } catch (e: unknown) {
                // No es JSON válido, enviarlo a stderr con advertencia
                originalStderrWrite(`[mcp-guard] WARN: Mensaje JSON inválido redirigido a stderr: ${e instanceof Error ? e.message : String(e)}\n`);
                return originalStderrWrite(buffer, ...args);
            }
        } else {
            // No es JSON, enviarlo a stderr
            return originalStderrWrite(buffer, ...args);
        }
    };
    
    // Redirigir todos los console.* a stderr
    console.log = (...args: any[]) => {
        originalStderrWrite(`${args.join(' ')}\n`);
    };
    
    console.info = (...args: any[]) => {
        originalStderrWrite(`[INFO] ${args.join(' ')}\n`);
    };
    
    console.warn = (...args: any[]) => {
        originalStderrWrite(`[WARN] ${args.join(' ')}\n`);
    };
    
    console.error = (...args: any[]) => {
        originalStderrWrite(`[ERROR] ${args.join(' ')}\n`);
    };
    
    // Notificar que el guard está activo
    originalStderrWrite('[mcp-guard] INFO: Protección estricta MCP activada\n');
}

/**
 * Restaura el comportamiento original de stdout y console
 */
export function restoreMCPGuard(): void {
    // Restaurar stdout.write
    process.stdout.write = originalStdoutWrite;
    
    // Restaurar console.*
    console.log = originalConsoleLog;
    console.info = originalConsoleInfo;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    
    // Notificar que el guard se ha desactivado
    originalStderrWrite('[mcp-guard] INFO: Protección MCP desactivada\n');
}

/**
 * Envía un mensaje directamente a stderr, sin afectar el comportamiento del guard
 */
export function logToStderr(message: string): void {
    originalStderrWrite(`${message}\n`);
}

export default {
    setupMCPGuard,
    restoreMCPGuard,
    logToStderr
};
