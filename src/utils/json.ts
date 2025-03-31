/**
 * Utilidades para manipulación de JSON
 */

/**
 * Realiza la serialización de un objeto a JSON eliminando todos los caracteres de nueva línea
 * para producir un JSON más compacto y eficiente en la respuesta al cliente.
 * @param value - El valor a serializar a JSON
 * @param replacer - Función opcional para transformar el resultado
 * @param space - Parámetro de espaciado (se ignorará para mantener formato compacto)
 * @returns JSON serializado sin caracteres de nueva línea
 */
export function compactJsonStringify(
  value: any,
  replacer?: (this: any, key: string, value: any) => any | (number | string)[] | null,
  space?: string | number
): string {
  // Primero realizamos la serialización normal
  const jsonString = JSON.stringify(value, replacer, space);
  
  // Luego eliminamos los caracteres de nueva línea para un formato más compacto
  return jsonString.replace(/\n/g, "");
}
