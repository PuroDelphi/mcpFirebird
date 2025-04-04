// MCP Firebird - Punto de entrada principal
import './utils/stdout-guard.js';
import { createLogger } from './utils/logger.js';
import { initializeServer } from './server/index.js';
import { FirebirdError } from './db/connection.js';
import { version } from '../package.json';
import * as os from 'os';
import * as process from 'process';

/**
 * Interfaz para los módulos de MCP que se cargan dinámicamente
 */
interface MCPModules {
    serverModule: typeof import('@modelcontextprotocol/sdk/server/mcp.js');
    stdioModule: typeof import('@modelcontextprotocol/sdk/server/stdio.js');
}

/**
 * Registro de errores principales
 * @param {Error} error - Error a registrar
 * @param {boolean} [exit=true] - Si se debe salir del proceso
 * @param {number} [exitCode=1] - Código de salida
 */
function handleFatalError(error: Error | FirebirdError | unknown, exit: boolean = true, exitCode: number = 1): void {
    const logger = createLogger('error-handler');
    
    if (error instanceof FirebirdError) {
        logger.error(`Error fatal [${error.type}]: ${error.message}`);
        if (error.originalError) {
            logger.error(`Error original: ${error.originalError}`);
        }
    } else if (error instanceof Error) {
        logger.error(`Error fatal: ${error.message}`);
        if (error.stack) {
            logger.error(`Stack: ${error.stack}`);
        }
    } else {
        logger.error(`Error fatal desconocido: ${String(error)}`);
    }
    
    if (exit) {
        logger.info(`Saliendo con código ${exitCode}`);
        process.exit(exitCode);
    }
}

/**
 * Carga los módulos MCP necesarios
 * @returns {Promise<MCPModules>} Módulos cargados
 */
async function loadMCPModules(): Promise<MCPModules> {
    const logger = createLogger('module-loader');
    
    try {
        logger.info('Cargando módulos MCP necesarios...');
        const serverModule = await import('@modelcontextprotocol/sdk/server/mcp.js');
        const stdioModule = await import('@modelcontextprotocol/sdk/server/stdio.js');
        
        logger.info('Módulos MCP cargados correctamente');
        return { serverModule, stdioModule };
    } catch (error) {
        logger.error('Error al cargar módulos MCP');
        throw new FirebirdError(
            `No se pudieron cargar los módulos MCP: ${error instanceof Error ? error.message : String(error)}`,
            'MODULE_LOAD_ERROR',
            error
        );
    }
}

/**
 * Imprime información del sistema en el inicio
 */
function logSystemInfo(): void {
    const logger = createLogger('system-info');
    
    logger.info(`MCP Firebird v${version}`);
    logger.info(`Node.js ${process.version}`);
    logger.info(`OS: ${os.platform()} ${os.release()}`);
    logger.info(`Arquitectura: ${os.arch()}`);
    logger.info(`CPUs: ${os.cpus().length}`);
    logger.info(`Memoria: ${Math.round(os.totalmem() / 1024 / 1024)} MB`);
    logger.info(`Directorio actual: ${process.cwd()}`);
}

/**
 * Configura manejadores para señales del sistema
 */
function setupSignalHandlers(): void {
    const logger = createLogger('signal-handler');
    
    process.on('SIGINT', () => {
        logger.info('Recibida señal SIGINT, cerrando...');
        process.exit(0);
    });
    
    process.on('SIGTERM', () => {
        logger.info('Recibida señal SIGTERM, cerrando...');
        process.exit(0);
    });
    
    process.on('unhandledRejection', (reason) => {
        logger.error('Promesa rechazada no manejada');
        handleFatalError(reason || new Error('Promesa rechazada desconocida'), false);
    });
    
    process.on('uncaughtException', (error) => {
        logger.error('Excepción no capturada');
        handleFatalError(error, true);
    });
}

/**
 * Realiza una comprobación de salud básica del sistema
 * @returns {Promise<boolean>} Resultado de la comprobación
 */
async function performHealthCheck(): Promise<boolean> {
    const logger = createLogger('health-check');
    
    try {
        // Verificar disponibilidad de módulos críticos
        logger.info('Verificando módulos críticos...');
        await import('./db/connection.js');
        await import('./db/queries.js');
        
        // Verificar variables de entorno necesarias
        logger.info('Verificando variables de entorno...');
        const requiredEnvVars = ['FB_DATABASE', 'FB_HOST', 'FB_PORT', 'FB_USER', 'FB_PASSWORD'];
        const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
        
        if (missingEnvVars.length > 0) {
            logger.warn(`Variables de entorno faltantes: ${missingEnvVars.join(', ')}`);
            logger.warn('Se utilizarán valores predeterminados donde sea posible');
        }
        
        return true;
    } catch (error) {
        logger.error('Error durante la comprobación de salud');
        handleFatalError(error, false);
        return false;
    }
}

// Entrada principal
(async () => {
    // Configurar manejadores de señales
    setupSignalHandlers();
    
    // Logger principal
    const logger = createLogger('main');
    
    try {
        // Mostrar información del sistema
        logSystemInfo();
        
        // Realizar comprobación de salud
        const healthCheckPassed = await performHealthCheck();
        if (!healthCheckPassed) {
            logger.warn('La comprobación de salud ha detectado problemas, continuando con precaución...');
        }
        
        // Cargar módulos MCP
        const { serverModule, stdioModule } = await loadMCPModules();
        
        // Crear transporte STDIO conforme a MCP
        logger.info('Creando transporte STDIO...');
        const transport = new stdioModule.StdioServerTransport();
        process.stderr.write("[INIT] Transporte STDIO creado\n");
        
        // Inicializar servidor MCP
        logger.info('Inicializando servidor MCP...');
        await initializeServer(serverModule, transport);
        logger.info('Servidor MCP inicializado correctamente');
        
    } catch (error) {
        handleFatalError(error);
    }
})().catch((error) => {
    handleFatalError(error);
});
