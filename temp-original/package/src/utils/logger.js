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
        }
    };
} 