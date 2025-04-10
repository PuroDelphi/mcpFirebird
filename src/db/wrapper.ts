/**
 * Database function wrapper module
 * 
 * Este módulo proporciona wrappers para las funciones de base de datos
 * que garantizan que siempre se use la configuración correcta.
 */

import { ConfigOptions, getGlobalConfig } from './connection.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('db:wrapper');

/**
 * Wrapper para funciones de base de datos que garantiza el uso de la configuración correcta
 * @param fn Función original que acepta un parámetro de configuración
 * @returns Función wrapped que siempre usa la configuración correcta
 */
export function withCorrectConfig<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    configParamIndex: number = -1 // Por defecto, asume que config es el último parámetro
): T {
    return (async (...args: any[]) => {
        try {
            // Obtener la configuración global
            const globalConfig = getGlobalConfig();
            
            // Si no se especificó el índice del parámetro de configuración, asumimos que es el último
            const actualConfigIndex = configParamIndex >= 0 ? configParamIndex : args.length - 1;
            
            // Si hay una configuración global y el parámetro de configuración no se proporcionó o es undefined
            if (globalConfig && (!args[actualConfigIndex] || args.length <= actualConfigIndex)) {
                // Si necesitamos extender el array de argumentos
                if (args.length <= actualConfigIndex) {
                    // Crear un nuevo array con la longitud necesaria
                    const newArgs = [...args];
                    // Rellenar con undefined si es necesario
                    while (newArgs.length < actualConfigIndex) {
                        newArgs.push(undefined);
                    }
                    // Añadir la configuración global
                    newArgs.push(globalConfig);
                    // Llamar a la función original con los nuevos argumentos
                    return await fn(...newArgs);
                } else {
                    // Simplemente reemplazar el parámetro de configuración
                    args[actualConfigIndex] = globalConfig;
                }
            }
            
            // Llamar a la función original con los argumentos (posiblemente modificados)
            return await fn(...args);
        } catch (error) {
            // Registrar el error y relanzarlo
            logger.error(`Error en función wrapped: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }) as T;
}

/**
 * Wrapper para funciones de base de datos que no tienen un parámetro de configuración
 * @param fn Función original
 * @param configFactory Función que devuelve la configuración a usar
 * @returns Función wrapped
 */
export function withConfig<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    configFactory: () => ConfigOptions
): T {
    return (async (...args: any[]) => {
        try {
            // Obtener la configuración
            const config = configFactory();
            
            // Añadir la configuración como último argumento
            const newArgs = [...args, config];
            
            // Llamar a la función original con los nuevos argumentos
            return await fn(...newArgs);
        } catch (error) {
            // Registrar el error y relanzarlo
            logger.error(`Error en función wrapped con config: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }) as T;
}
