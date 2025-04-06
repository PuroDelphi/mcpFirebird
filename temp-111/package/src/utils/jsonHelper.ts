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
