// MCP Firebird - Punto de entrada principal
import './utils/stdout-guard.js';
import { createLogger } from './utils/logger.js';
import { initializeServer } from './server/index.js';

// Logger principal
const logger = createLogger('main');

// Entrada principal
(async () => {
    try {
        // Cargar módulos dinámicamente para compatibilidad ESM/CJS
        logger.info('Cargando módulos necesarios...');
        const serverModule = await import('@modelcontextprotocol/sdk/server/mcp.js');
        const stdioModule = await import('@modelcontextprotocol/sdk/server/stdio.js');
        
        // Crear transporte STDIO
        logger.info('Creando transporte STDIO...');
        const transport = new stdioModule.StdioServerTransport();
        process.stderr.write("[INIT] Transporte STDIO creado\n");
        
        // Inicializar servidor
        logger.info('Inicializando servidor MCP...');
        await initializeServer(serverModule, transport);
        
    } catch (error: any) {
        logger.error('Error al iniciar servidor: ' + error);
        process.exit(1);
    }
})().catch((error: any) => {
    logger.error('Error al cargar módulos: ' + error);
    process.exit(1);
});
