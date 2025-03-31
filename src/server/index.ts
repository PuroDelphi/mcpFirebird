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
            version: '1.1.2',
            description: 'Servidor MCP para bases de datos Firebird SQL'
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
        
        // Conectamos el servidor al transporte con manejo de errores mejorado
        try {
            // Esto es crítico: aseguramos que el console.log original esté disponible
            // para que el transporte pueda comunicarse directamente con stdout
            const originalConsoleLog = console.log;
            
            // Restaurar temporalmente console.log para la conexión
            console.log = originalConsoleLog;
            
            // Conectar el servidor al transporte
            await server.connect(transport);
            
            // El SDK MCP ya está conectado, podemos volver a redireccionar logs futuros
            console.log = (...args) => {
                process.stderr.write(`[LOG] ${args.join(' ')}\n`);
            };
            
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
