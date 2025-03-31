/**
 * Este archivo contiene utilidades para proteger stdout
 * El Model Context Protocol requiere que stdout esté completamente limpio
 * y solo contenga mensajes JSON válidos
 */

// Guardar la referencia original de stdout.write
const originalStdoutWrite = process.stdout.write.bind(process.stdout);

/**
 * Verifica si un mensaje es JSON válido según los requisitos de MCP
 * @param {any} buffer - Buffer a verificar
 * @returns {boolean} - Verdadero si es JSON válido
 */
function isValidJson(buffer: any): boolean {
    if (!buffer || typeof buffer !== 'string') {
        return false;
    }
    
    const text = buffer.toString().trim();
    
    // Verificación básica de formato JSON
    if (!(text.startsWith('{') && text.endsWith('}')) && 
        !(text.startsWith('[') && text.endsWith(']'))) {
        return false;
    }
    
    // Verificar que sea JSON válido mediante parser
    try {
        JSON.parse(text);
        return true;
    } catch (e) {
        return false;
    }
}

// Reemplazar stdout.write para prevenir escrituras accidentales
process.stdout.write = function(buffer: string | Uint8Array | any): boolean {
    // Si es JSON válido según MCP, permitirlo
    if (isValidJson(buffer)) {
        return originalStdoutWrite(buffer);
    }
    
    // De lo contrario, redirigir a stderr sin alterar el mensaje
    process.stderr.write(`${buffer}`);
    return true;
};

// Para restaurar el comportamiento original si es necesario
export function restoreStdout(): void {
    process.stdout.write = originalStdoutWrite;
}

// No registramos manejadores de excepciones aquí porque
// esto podría entrar en conflicto con los manejadores de errores en index.ts

export default {
    restoreStdout,
    isValidJson
};