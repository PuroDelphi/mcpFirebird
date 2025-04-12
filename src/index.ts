/**
 * MCP Firebird - Main entry point
 * This is the main entry point for the MCP Firebird server
 */

// Load environment variables from .env file
import dotenv from 'dotenv';
dotenv.config();

// Import stdout guard to prevent accidental writes to stdout
import './utils/stdout-guard.js';

// Import core dependencies
import { createLogger } from './utils/logger.js';
import { main } from './server/index.js';
import { FirebirdError, MCPError } from './utils/errors.js';
import pkg from '../package.json' with { type: 'json' };
import * as os from 'os';
import * as process from 'process';
const { version } = pkg;

// Create logger
const logger = createLogger('index');

/**
 * Interface for dynamically loaded MCP modules
 */
interface MCPModules {
    serverModule: typeof import('@modelcontextprotocol/sdk/server/mcp.js');
    stdioModule: typeof import('@modelcontextprotocol/sdk/server/stdio.js');
}

/**
 * Handle fatal errors
 * @param error - The error to handle
 * @param exit - Whether to exit the process
 * @param exitCode - The exit code to use
 */
function handleFatalError(error: unknown, exit: boolean = true, exitCode: number = 1): void {
    if (error instanceof MCPError) {
        logger.error(`Fatal error [${error.type}]: ${error.message}`, {
            type: error.type,
            context: error.context,
            originalError: error.originalError
        });
    } else if (error instanceof Error) {
        logger.error(`Fatal error: ${error.message}`, {
            stack: error.stack
        });
    } else {
        logger.error(`Unknown fatal error: ${String(error)}`);
    }

    if (exit) {
        logger.info(`Exiting with code ${exitCode}`);
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

        // Verificar configuración global y variables de entorno
        logger.info('Verificando configuración...');

        // Verificar si existe configuración global
        const globalConfig = (global as any).MCP_FIREBIRD_CONFIG;
        if (globalConfig && globalConfig.database) {
            logger.info('Configuración global encontrada');
            logger.info(`Database: ${globalConfig.database}`);
            logger.info(`Host: ${globalConfig.host}`);
            logger.info(`Port: ${globalConfig.port}`);
            logger.info(`User: ${globalConfig.user}`);
            // No mostrar la contraseña
        } else {
            // Verificar variables de entorno necesarias
            logger.info('Verificando variables de entorno...');
            const requiredEnvVars = ['FIREBIRD_DATABASE', 'FIREBIRD_HOST', 'FIREBIRD_PORT', 'FIREBIRD_USER', 'FIREBIRD_PASSWORD'];
            const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

            if (missingEnvVars.length > 0) {
                logger.warn(`Variables de entorno faltantes: ${missingEnvVars.join(', ')}`);
                logger.warn('Se utilizarán valores predeterminados donde sea posible');
            }
        }

        return true;
    } catch (error) {
        logger.error('Error durante la comprobación de salud');
        handleFatalError(error, false);
        return false;
    }
}

// Display startup banner
logger.info(`Starting MCP Firebird Server v${version}...`);
logger.info(`Platform: ${process.platform}, Node.js: ${process.version}`);

// Configure log file if specified
if (process.env.MCP_LOG_FILE) {
    logger.info(`Log file: ${process.env.MCP_LOG_FILE}`);
}

// Start the server
main().catch(error => {
    // Use our centralized error handling
    handleFatalError(error);
});
