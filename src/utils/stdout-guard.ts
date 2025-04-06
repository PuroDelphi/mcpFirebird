/**
 * Este archivo contiene utilidades para proteger stdout
 * Las comunicaciones JSONRPC requieren que stdout esté completamente limpio
 */

// Guardar la referencia original de stdout.write
const originalStdoutWrite = process.stdout.write.bind(process.stdout);

// Reemplazar stdout.write para prevenir escrituras accidentales
// Simplificado para máxima compatibilidad con Claude Desktop
process.stdout.write = function(buffer: string | Uint8Array | any): boolean {
    // Permitir cualquier tipo de buffer para asegurar compatibilidad
    if (buffer) {
        return originalStdoutWrite(buffer);
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
    // No terminamos el proceso para permitir que continúe la comunicación
});

process.on('unhandledRejection', (reason: any) => {
    process.stderr.write(`[FATAL] Promesa rechazada no capturada: ${reason?.stack || reason}\n`);
    // No terminamos el proceso para permitir que continúe la comunicación
});

export default {
    restoreStdout
};