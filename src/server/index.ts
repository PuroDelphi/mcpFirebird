// Punto de entrada principal del servidor MCP
import { createLogger } from '../utils/logger.js';
import { loadServerConfig } from './config.js';
import { setupDatabaseTools } from '../tools/database.js';
import { setupMetadataTools } from '../tools/metadata.js';
import { setupSqlPrompts } from '../prompts/sql.js';
import { setupDatabasePrompts } from '../prompts/database.js';
import { setupDatabaseResources } from '../resources/database.js';

const logger = createLogger('server');

/**
 * Inicializa el servidor MCP con todas sus herramientas y recursos
 * @param {Object} serverModule - Módulo de servidor MCP importado
 * @param {Object} transport - Transporte para la comunicación con el servidor
 * @returns {Promise<Object>} Instancia del servidor MCP
 */
export const initializeServer = async (serverModule: any, transport: any) => {
    try {
        // Cargar configuración
        const config = loadServerConfig();
        logger.info(`Iniciando servidor MCP Firebird`);
        
        // Crear servidor MCP
        process.stderr.write("[INIT] Creando servidor MCP...\n");
        const server = new serverModule.McpServer({
            name: 'Firebird MCP',
            version: '1.1.1',
            description: 'Servidor MCP para bases de datos Firebird SQL'
        });
        
        // Captura de errores no manejados para evitar que el servidor se cierre
        process.on('uncaughtException', (error) => {
            process.stderr.write(`[ERROR] Excepción no capturada: ${error.message}\n`);
            logger.error(`Excepción no capturada: ${error.message}\n${error.stack}`);
            // No salimos del proceso para que el servidor continúe funcionando
        });
        
        process.on('unhandledRejection', (reason, promise) => {
            process.stderr.write(`[ERROR] Promesa rechazada no manejada: ${reason}\n`);
            logger.error(`Promesa rechazada no manejada: ${reason}`);
            // No salimos del proceso para que el servidor continúe funcionando
        });
        
        // Configurar con manejo de errores para evitar fallos por nombres duplicados
        try {
            // Configurar herramientas
            process.stderr.write("[INIT] Registrando herramientas...\n");
            setupDatabaseTools(server);
            process.stderr.write("[INIT] Herramientas de base de datos registradas\n");
            
            setupMetadataTools(server);
            process.stderr.write("[INIT] Herramientas de metadatos registradas\n");
            
            // Configurar prompts
            process.stderr.write("[INIT] Registrando prompts...\n");
            setupSqlPrompts(server);
            process.stderr.write("[INIT] Prompts SQL registrados\n");
            
            setupDatabasePrompts(server);
            process.stderr.write("[INIT] Prompts de base de datos registrados\n");
            
            // Configurar recursos
            process.stderr.write("[INIT] Registrando recursos...\n");
            setupDatabaseResources(server, serverModule);
            process.stderr.write("[INIT] Recursos de base de datos registrados\n");
        } catch (toolError) {
            logger.error(`Error al registrar herramientas o prompts: ${toolError}`);
            process.stderr.write(`[ERROR] Falló el registro de algunas herramientas: ${toolError}\n`);
            // Continuamos a pesar del error para que el servidor pueda iniciar con las herramientas que sí funcionan
        }
        
        // Conectar el servidor al transporte
        process.stderr.write("[INIT] Conectando servidor al transporte...\n");
        
        // Configuramos manejadores para eventos del servidor
        server.on('error', (error: any) => {
            process.stderr.write(`[ERROR] Error en el servidor MCP: ${error.message}\n`);
            logger.error(`Error en el servidor MCP: ${error.message}\n${error.stack}`);
        });
        
        // Conectamos el servidor al transporte con manejo de errores mejorado
        try {
            await server.connect(transport);
            process.stderr.write("[INIT] Servidor conectado y listo para recibir peticiones\n");
            
            // Notificar que el servidor está listo
            logger.info('Servidor MCP conectado y listo');
            return server;
        } catch (connectError) {
            process.stderr.write(`[ERROR] Error al conectar el servidor al transporte: ${connectError}\n`);
            logger.error(`Error al conectar el servidor al transporte: ${connectError}`);
            throw connectError;
        }
    } catch (error) {
        process.stderr.write(`[FATAL] Error al inicializar el servidor MCP: ${error}\n`);
        logger.error(`Error al inicializar el servidor MCP: ${error}`);
        throw error;
    }
};
