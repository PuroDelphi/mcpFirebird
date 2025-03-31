/**
 * MCP Logger - Sistema de logging compatible con Model Context Protocol
 * 
 * Este módulo reemplaza los métodos de logging estándar para asegurar que:
 * 1. stdout se mantenga limpio para la comunicación MCP
 * 2. Todos los logs se dirijan a stderr
 */

// Referencias originales
const originalConsoleLog = console.log;
const originalConsoleInfo = console.info;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

/**
 * Configura el sistema de logging para cumplir con Model Context Protocol
 * Redirecciona todo console.* a stderr manteniendo stdout limpio
 */
export function setupMCPLogger(): void {
    // Redirige console.log a stderr con prefijo
    console.log = (...args: any[]) => {
        process.stderr.write(`[LOG] ${args.join(' ')}\n`);
    };
    
    // Redirige console.info a stderr con prefijo
    console.info = (...args: any[]) => {
        process.stderr.write(`[INFO] ${args.join(' ')}\n`);
    };
    
    // Redirige console.warn a stderr con prefijo
    console.warn = (...args: any[]) => {
        process.stderr.write(`[WARN] ${args.join(' ')}\n`);
    };
    
    // Redirige console.error a stderr con prefijo
    console.error = (...args: any[]) => {
        process.stderr.write(`[ERROR] ${args.join(' ')}\n`);
    };
    
    // Notifica que el logger está activo
    process.stderr.write('[mcp-logger] INFO: Logger MCP activado - stdout reservado para JSON\n');
}

/**
 * Restaura los comportamientos originales de console.*
 */
export function restoreMCPLogger(): void {
    console.log = originalConsoleLog;
    console.info = originalConsoleInfo;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    
    process.stderr.write('[mcp-logger] INFO: Logger MCP desactivado\n');
}

/**
 * Log directo a stderr con prefijo personalizado
 * @param {string} message - Mensaje a loggear
 * @param {string} [level='INFO'] - Nivel de log (INFO, WARN, ERROR)
 * @param {string} [tag='app'] - Etiqueta para categorizar el log
 */
export function log(message: string, level: string = 'INFO', tag: string = 'app'): void {
    process.stderr.write(`[${tag}] ${level}: ${message}\n`);
}

export default {
    setupMCPLogger,
    restoreMCPLogger,
    log
};
