/**
 * Este archivo contiene utilidades para proteger stdout
 * Las comunicaciones JSONRPC requieren que stdout esté completamente limpio
 */

// Guardar la referencia original de stdout.write
const originalStdoutWrite = process.stdout.write.bind(process.stdout);

// Reemplazar stdout.write para prevenir escrituras accidentales
process.stdout.write = function(buffer: string | Uint8Array | any): boolean {
    // Si parece JSON válido, permitirlo
    if (buffer && 
        typeof buffer === 'string' && 
        (buffer.trim().startsWith('{') || buffer.trim().startsWith('['))) {
        return originalStdoutWrite(buffer);
    }
    
    // De lo contrario, redirigir a stderr
    process.stderr.write(`[WARN] Intento de escribir a stdout redirigido a stderr: ${buffer}`);
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