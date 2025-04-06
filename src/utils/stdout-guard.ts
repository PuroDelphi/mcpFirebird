/**
 * Este archivo contiene utilidades para proteger stdout
 * Las comunicaciones JSONRPC requieren que stdout esté completamente limpio
 */

// Guardar la referencia original de stdout.write
const originalStdoutWrite = process.stdout.write.bind(process.stdout);

// Reemplazar stdout.write para prevenir escrituras accidentales
process.stdout.write = function(buffer: string | Uint8Array | any): boolean {
    // Si parece JSON válido o está en formato esperado por el protocolo, permitirlo
    if (buffer && typeof buffer === 'string') {
        const trimmed = buffer.trim();
        // Permitir JSON y mensajes del protocolo MCP
        if (trimmed.startsWith('{') || trimmed.startsWith('[') ||
            trimmed.includes('jsonrpc') || trimmed.includes('method') ||
            trimmed.includes('params') || trimmed.includes('id')) {
            return originalStdoutWrite(buffer);
        }
    } else if (buffer) {
        // Permitir buffers binarios y otros tipos de datos
        return originalStdoutWrite(buffer);
    }

    // De lo contrario, redirigir a stderr con más información para depuración
    process.stderr.write(`[WARN] Redirigido a stderr: ${typeof buffer === 'string' ? buffer : 'Buffer no string'} (tipo: ${typeof buffer})\n`);
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