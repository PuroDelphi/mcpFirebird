// Logger optimizado para cumplimiento del Model Context Protocol
// Asegura que todos los mensajes de log vayan a stderr y no a stdout

/**
 * Crea un logger con el namespace especificado
 * @param {string} namespace - Namespace para categorizar logs
 * @returns {Object} Objeto logger con métodos info, error, debug, warn
 */
export function createLogger(namespace) {
    return {
        info: (message, context) => {
            const timestamp = new Date().toISOString();
            const contextStr = context ? ` ${JSON.stringify(context)}` : '';
            process.stderr.write(`[${timestamp}] [INFO] [${namespace}] ${message}${contextStr}\n`);
        },
        error: (message, error) => {
            const timestamp = new Date().toISOString();
            const errorStr = error ? ` ${error instanceof Error ? error.stack : JSON.stringify(error)}` : '';
            process.stderr.write(`[${timestamp}] [ERROR] [${namespace}] ${message}${errorStr}\n`);
        },
        debug: (message, data) => {
            const timestamp = new Date().toISOString();
            const dataStr = data ? ` ${JSON.stringify(data)}` : '';
            process.stderr.write(`[${timestamp}] [DEBUG] [${namespace}] ${message}${dataStr}\n`);
        },
        warn: (message, data) => {
            const timestamp = new Date().toISOString();
            const dataStr = data ? ` ${JSON.stringify(data)}` : '';
            process.stderr.write(`[${timestamp}] [WARN] [${namespace}] ${message}${dataStr}\n`);
        }
    };
}