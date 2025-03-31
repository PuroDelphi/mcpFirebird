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
            version: '1.0.93',
            description: 'Servidor MCP para bases de datos Firebird SQL'
        });
        
        // Configurar herramientas
        process.stderr.write("[INIT] Registrando herramientas...\n");
        setupDatabaseTools(server);
        setupMetadataTools(server);
        
        // Configurar prompts
        process.stderr.write("[INIT] Registrando prompts...\n");
        setupSqlPrompts(server);
        setupDatabasePrompts(server);
        
        // Configurar recursos
        process.stderr.write("[INIT] Registrando recursos...\n");
        setupDatabaseResources(server, serverModule);
        
        // Conectar el servidor al transporte
        process.stderr.write("[INIT] Conectando servidor al transporte...\n");
        await server.connect(transport);
        process.stderr.write("[INIT] Servidor conectado y listo para recibir peticiones\n");
        
        // Notificar que el servidor está listo
        logger.info('Servidor MCP Firebird inicializado correctamente');
        
        return server;
    } catch (error) {
        logger.error(`Error al iniciar servidor: ${error}`);
        throw error;
    }
};
