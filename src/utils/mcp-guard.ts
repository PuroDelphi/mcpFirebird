/**
 * MCP Guard - Utilidades para cumplimiento del Model Context Protocol
 * 
 * El Model Context Protocol requiere que:
 * 1. stdout contenga SOLO mensajes JSON válidos
 * 2. Todos los logs y mensajes de error vayan a stderr
 * 3. No haya mezcla de mensajes JSON y no-JSON en stdout
 */

/**
 * Verifica si una cadena es un JSON válido
 * @param text - Texto a verificar
 * @returns true si es un JSON válido, false en caso contrario
 */
export function isValidJson(text: string): boolean {
    if (!text || typeof text !== 'string') return false;
    
    const trimmed = text.trim();
    // Verificación básica de formato JSON
    if (!(trimmed.startsWith('{') && trimmed.endsWith('}'))) {
        return false;
    }
    
    try {
        JSON.parse(trimmed);
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Envía un mensaje de log a stderr
 * @param message - Mensaje a enviar
 * @param level - Nivel de log (default: 'INFO')
 */
export function logToStderr(message: string, level: string = 'INFO'): void {
    process.stderr.write(`[${level}] ${message}\n`);
}

/**
 * Envía un mensaje JSON a stdout si es válido, o a stderr si no lo es
 * @param data - Datos a enviar (objeto o cadena JSON)
 * @returns true si se envió a stdout, false si se redirigió a stderr
 */
export function sendJsonToOutput(data: any): boolean {
    let jsonString: string;
    
    // Si ya es una cadena, usarla directamente
    if (typeof data === 'string') {
        jsonString = data;
    } else {
        // Intentar convertir a JSON
        try {
            jsonString = JSON.stringify(data);
        } catch (e) {
            logToStderr(`Error al convertir a JSON: ${e}`, 'ERROR');
            return false;
        }
    }
    
    // Verificar si es JSON válido
    if (isValidJson(jsonString)) {
        process.stdout.write(jsonString + '\n');
        return true;
    } else {
        logToStderr(`Mensaje JSON inválido redirigido a stderr: ${jsonString}`, 'WARN');
        return false;
    }
}

export default {
    isValidJson,
    logToStderr,
    sendJsonToOutput
};
