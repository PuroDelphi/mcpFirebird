/**
 * Funciones de utilidad para manejar JSON.
 */

/**
 * Convierte un objeto a una cadena JSON compacta sin saltos de línea.
 * Esto es útil para asegurar que las respuestas MCP sean lo más compactas posible.
 *
 * @param obj - El objeto a convertir en cadena JSON.
 * @returns Una cadena JSON sin saltos de línea ni retornos de carro.
 */
export const stringifyCompact = (obj: any): string => {
    // Primero, convierte el objeto a JSON estándar
    const jsonString = JSON.stringify(obj);
    
    // Luego, elimina todos los caracteres de nueva línea (\n) y retorno de carro (\r)
    // para asegurar que la salida sea una sola línea compacta.
    return jsonString.replace(/[\n\r]/g, ''); 
};

import { FirebirdError } from '../db/connection.js';

/**
 * Envuelve una respuesta exitosa en el formato esperado por MCP
 * @param result El resultado exitoso
 * @returns Un objeto de respuesta MCP exitoso
 */
export function wrapSuccess<T>(result: T): { success: true, result: T } {
    return { success: true, result };
}

/**
 * Envuelve un error en el formato esperado por MCP
 * @param error El objeto de error
 * @returns Un objeto de respuesta MCP de error
 */
export function wrapError(error: unknown): { success: false, error: string, errorType?: string } {
    if (error instanceof FirebirdError) {
        // Asumir que FirebirdError tiene errorType. Si no, habrá que añadirlo en connection.ts
        return { success: false, error: error.message, errorType: (error as FirebirdError).type || 'FIREBIRD_ERROR' };
    } else if (error instanceof Error) {
        return { success: false, error: error.message, errorType: 'UNKNOWN_ERROR' };
    } else {
        return { success: false, error: String(error), errorType: 'UNKNOWN_ERROR' };
    }
}
