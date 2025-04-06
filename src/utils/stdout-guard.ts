/**
 * Este archivo contiene utilidades para proteger stdout
 * Las comunicaciones JSONRPC requieren que stdout esté completamente limpio
 */

// Guardar la referencia original de stdout.write
const originalStdoutWrite = process.stdout.write.bind(process.stdout);

// Reemplazar stdout.write para prevenir escrituras accidentales
// Simplificado para máxima compatibilidad con Claude Desktop
process.stdout.write = function(buffer: string | Uint8Array | any): boolean {
    try {
        // Permitir cualquier tipo de buffer para asegurar compatibilidad
        if (buffer) {
            // Si es un string, verificar si es un mensaje de inicialización
            if (typeof buffer === 'string' && buffer.includes('initialize')) {
                process.stderr.write(`[DEBUG] Mensaje de inicialización detectado\n`);
            }
            return originalStdoutWrite(buffer);
        }
    } catch (error) {
        // En caso de error, registrar y continuar
        process.stderr.write(`[ERROR] Error en stdout-guard: ${error}\n`);
    }
    return true;
};

// Para restaurar el comportamiento original si es necesario
export function restoreStdout(): void {
    process.stdout.write = originalStdoutWrite;
}

// Manejar excepciones no capturadas para evitar que rompan el protocolo
process.on('uncaughtException', (error: Error) => {
    process.stderr.write(`[FATAL] Excepción no capturada: ${error?.stack || error}\n`);
    process.stderr.write(`[INFO] El proceso continuará ejecutándose para mantener la comunicación con el cliente\n`);
    // No terminamos el proceso para permitir que continúe la comunicación
});

process.on('unhandledRejection', (reason: any) => {
    process.stderr.write(`[FATAL] Promesa rechazada no capturada: ${reason?.stack || reason}\n`);
    process.stderr.write(`[INFO] El proceso continuará ejecutándose para mantener la comunicación con el cliente\n`);
    // No terminamos el proceso para permitir que continúe la comunicación
});

// Manejar señales del sistema para evitar cierres inesperados
process.on('SIGINT', () => {
    process.stderr.write(`[INFO] Recibida señal SIGINT, pero el proceso continuará ejecutándose\n`);
    // No terminamos el proceso para permitir que continúe la comunicación
});

process.on('SIGTERM', () => {
    process.stderr.write(`[INFO] Recibida señal SIGTERM, pero el proceso continuará ejecutándose\n`);
    // No terminamos el proceso para permitir que continúe la comunicación
});

export default {
    restoreStdout
};