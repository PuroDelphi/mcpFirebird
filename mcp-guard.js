/**
 * MCP-Guard - Implementación del Model Context Protocol para Node.js
 * 
 * Este módulo proporciona funciones para filtrar la salida según el
 * Model Context Protocol (solo JSON válido a stdout).
 */

/**
 * Verifica si una cadena es JSON válido
 * @param {string} str - Cadena a verificar
 * @returns {boolean} True si es JSON válido
 */
function isValidJson(str) {
    if (typeof str !== 'string') return false;
    str = str.trim();
    
    try {
        JSON.parse(str);
        return true;
    } catch (e) {
        return false;
    }
}

// Exportar funciones
module.exports = {
    isValidJson
};
