// MCP Firebird - Punto de entrada principal
import { createLogger } from './utils/logger.js';
import { initializeServer } from './server/index.js';
import { FirebirdError } from './db/connection.js';
// Import package.json with proper attribute for Node.js v22
import pkgJson from '../package.json' with { type: 'json' };
const { version } = pkgJson;
import * as os from 'os';
import * as process from 'process';

/**
 * Interfaz para los módulos de MCP que se cargan dinámicamente
 */
interface MCPModules {
    serverModule: any;
    stdioModule: any;
}

/**
 * Registro de errores principales
 * @param {Error} error - Error a registrar
 * @param {boolean} [exit=true] - Si se debe salir del proceso
 * @param {number} [exitCode=1] - Código de salida
 */
function handleFatalError(error: Error | FirebirdError | unknown, exit: boolean = true, exitCode: number = 1): void {
    // Escribimos directamente a stderr
    if (error instanceof FirebirdError) {
        process.stderr.write(`[ERROR] Error fatal [${error.type}]: ${error.message}\n`);
        if (error.originalError) {
            process.stderr.write(`[ERROR] Error original: ${error.originalError}\n`);
        }
    } else if (error instanceof Error) {
        process.stderr.write(`[ERROR] Error fatal: ${error.message}\n`);
        if (error.stack) {
            process.stderr.write(`[ERROR] Error stack: ${error.stack}\n`);
        }
    } else {
        process.stderr.write(`[ERROR] Error fatal desconocido: ${String(error)}\n`);
    }
    
    if (exit) {
        process.stderr.write(`[ERROR] Saliendo con código de error: ${exitCode}\n`);
        process.exit(exitCode);
    }
}

/**
 * Carga los módulos MCP necesarios
 * @returns {Promise<MCPModules>} Módulos cargados
 */
async function loadMCPModules(): Promise<MCPModules> {
    process.stderr.write('[INFO] Cargando módulos MCP necesarios...\n');
    
    try {
        // Importar módulos MCP
        const serverModule = await import('@modelcontextprotocol/sdk/server/mcp.js');
        const stdioModule = await import('@modelcontextprotocol/sdk/server/stdio.js');
        
        process.stderr.write('[INFO] Módulos MCP cargados correctamente\n');
        return { serverModule, stdioModule };
    } catch (error) {
        process.stderr.write(`[ERROR] Error al cargar módulos MCP: ${error}\n`);
        throw error;
    }
}

/**
 * Imprime información del sistema en el inicio
 */
function logSystemInfo(): void {
    process.stderr.write(`[INFO] Versión MCP Firebird: ${version}\n`);
    process.stderr.write(`[INFO] Plataforma: ${os.platform()} ${os.release()}\n`);
    process.stderr.write(`[INFO] Node.js: ${process.version}\n`);
    process.stderr.write(`[INFO] Memoria total: ${Math.round(os.totalmem() / (1024 * 1024))} MB\n`);
    process.stderr.write(`[INFO] CPUs: ${os.cpus().length}\n`);
}

/**
 * Configura manejadores para señales del sistema
 */
function setupSignalHandlers(): void {
    // Manejar cierre limpio en SIGINT (Ctrl+C)
    if (process.on) {
        process.on('SIGINT', () => {
            process.stderr.write('[INFO] Recibida señal SIGINT. Cerrando servidor...\n');
            process.exit(0);
        });
        
        // Manejar otras señales comunes
        process.on('SIGTERM', () => {
            process.stderr.write('[INFO] Recibida señal SIGTERM. Cerrando servidor...\n');
            process.exit(0);
        });
        
        // Capturar excepciones no manejadas
        process.on('uncaughtException', (error) => {
            handleFatalError(error);
        });
        
        // Capturar rechazos de promesas no manejados
        process.on('unhandledRejection', (reason) => {
            handleFatalError(reason instanceof Error ? reason : new Error(String(reason)));
        });
    } else {
        process.stderr.write('[WARN] No se pudo configurar manejadores de señales estándar.\n');
    }
}

/**
 * Realiza una comprobación de salud básica del sistema
 * @returns {Promise<boolean>} Resultado de la comprobación
 */
async function performHealthCheck(): Promise<boolean> {
    let checkPassed = true;
    
    // Comprobar variables de entorno necesarias
    const requiredEnvVars = ['FB_DATABASE', 'FB_HOST', 'FB_PORT', 'FB_USER', 'FB_PASSWORD'];
    
    // Comprobar cada variable de entorno requerida
    const missingVars = requiredEnvVars.filter(v => !process.env[v]);
    
    if (missingVars.length > 0) {
        process.stderr.write(`[WARN] Variables de entorno faltantes: ${missingVars.join(', ')}\n`);
        process.stderr.write('[WARN] Se utilizarán valores predeterminados donde sea posible\n');
        checkPassed = false;
    }
    
    return checkPassed;
}

/**
 * Función principal que ejecuta el servidor MCP
 */
async function main(): Promise<void> {
    try {
        // Configurar manejadores de señales
        setupSignalHandlers();
        
        // Realizar comprobación de salud
        await performHealthCheck();
        
        // Mostrar información del sistema
        logSystemInfo();
        
        // Cargar los módulos MCP necesarios
        process.stderr.write('[INFO] Cargando módulos MCP necesarios...\n');
        const { serverModule, stdioModule } = await loadMCPModules();
        
        // Crear transporte STDIO
        process.stderr.write('[INFO] Creando transporte STDIO...\n');
        
        // Crear el transporte STDIO 
        const transport = new stdioModule.StdioServerTransport();
        process.stderr.write('[INFO] Transporte STDIO creado\n');
        
        // Inicializar el servidor
        process.stderr.write('[INFO] Inicializando servidor MCP...\n');
        const server = await initializeServer(serverModule, transport);
        
        // Permitir que el SDK maneje la lógica de cierre
        process.stderr.write('[INFO] Servidor MCP inicializado correctamente\n');
        
    } catch (error) {
        // Manejar cualquier error durante la inicialización
        handleFatalError(error);
    }
}

// Entrada principal
(async () => {
    await main();
})();
