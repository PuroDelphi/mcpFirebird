// MCP Firebird - Punto de entrada principal
import { createLogger } from './utils/logger.js';
import { initializeServer } from './server/index.js';
import { FirebirdError } from './db/connection.js';
// Import package.json with proper attribute for Node.js v22
import pkgJson from '../package.json' with { type: 'json' };
const { version } = pkgJson;
import * as os from 'os';
import * as process from 'process';
import { logToStderr } from './utils/mcp-guard.js';

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
        logToStderr(`Error fatal [${error.type}]: ${error.message}`, 'ERROR');
        if (error.originalError) {
            logToStderr(`Error original: ${error.originalError}`, 'ERROR');
        }
    } else if (error instanceof Error) {
        logToStderr(`Error fatal: ${error.message}`, 'ERROR');
        if (error.stack) {
            logToStderr(`Error stack: ${error.stack}`, 'ERROR');
        }
    } else {
        logToStderr(`Error fatal desconocido: ${String(error)}`, 'ERROR');
    }
    
    if (exit) {
        logToStderr(`Saliendo con código de error: ${exitCode}`, 'ERROR');
        process.exit(exitCode);
    }
}

/**
 * Carga los módulos MCP necesarios
 * @returns {Promise<MCPModules>} Módulos cargados
 */
async function loadMCPModules(): Promise<MCPModules> {
    logToStderr('Cargando módulos MCP necesarios...', 'INFO');
    
    try {
        // Importar módulos MCP
        const serverModule = await import('@modelcontextprotocol/sdk/server/mcp.js');
        const stdioModule = await import('@modelcontextprotocol/sdk/server/stdio.js');
        
        logToStderr('Módulos MCP cargados correctamente', 'INFO');
        return { serverModule, stdioModule };
    } catch (error) {
        logToStderr(`Error al cargar módulos MCP: ${error}`, 'ERROR');
        throw error;
    }
}

/**
 * Imprime información del sistema en el inicio
 */
function logSystemInfo(): void {
    logToStderr(`Versión MCP Firebird: ${version}`, 'INFO');
    logToStderr(`Plataforma: ${os.platform()} ${os.release()}`, 'INFO');
    logToStderr(`Node.js: ${process.version}`, 'INFO');
    logToStderr(`Memoria total: ${Math.round(os.totalmem() / (1024 * 1024))} MB`, 'INFO');
    logToStderr(`CPUs: ${os.cpus().length}`, 'INFO');
}

/**
 * Configura manejadores para señales del sistema
 */
function setupSignalHandlers(): void {
    // Manejar cierre limpio en SIGINT (Ctrl+C)
    if (process.on) {
        process.on('SIGINT', () => {
            logToStderr('Recibida señal SIGINT. Cerrando servidor...', 'INFO');
            process.exit(0);
        });
        
        // Manejar otras señales comunes
        process.on('SIGTERM', () => {
            logToStderr('Recibida señal SIGTERM. Cerrando servidor...', 'INFO');
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
        logToStderr('No se pudo configurar manejadores de señales estándar.', 'WARN');
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
        logToStderr(`Variables de entorno faltantes: ${missingVars.join(', ')}`, 'WARN');
        logToStderr('Se utilizarán valores predeterminados donde sea posible', 'WARN');
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
        logToStderr('Cargando módulos MCP necesarios...', 'INFO');
        const { serverModule, stdioModule } = await loadMCPModules();
        
        // Crear transporte STDIO
        logToStderr('Creando transporte STDIO...', 'INFO');
        
        // Crear el transporte STDIO 
        const transport = new stdioModule.StdioServerTransport();
        logToStderr('Transporte STDIO creado', 'INFO');
        
        // Inicializar el servidor
        logToStderr('Inicializando servidor MCP...', 'INFO');
        const server = await initializeServer(serverModule, transport);
        
        // Permitir que el SDK maneje la lógica de cierre
        logToStderr('Servidor MCP inicializado correctamente', 'INFO');
        
    } catch (error) {
        // Manejar cualquier error durante la inicialización
        handleFatalError(error);
    }
}

// Entrada principal
(async () => {
    await main();
})();
