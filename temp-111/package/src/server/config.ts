// Configuración del servidor MCP
import { createLogger } from '../utils/logger.js';

const logger = createLogger('server:config');

// Opciones predeterminadas para la conexión a la base de datos
export const DEFAULT_SERVER_CONFIG = {
    port: process.env.PORT || 3000,
    host: process.env.HOST || 'localhost'
};

/**
 * Carga la configuración del servidor
 * @returns {object} Configuración del servidor
 */
export const loadServerConfig = () => {
    logger.info('Cargando configuración del servidor');
    
    try {
        return {
            port: parseInt(process.env.PORT || '3000', 10),
            host: process.env.HOST || 'localhost',
            database: {
                host: process.env.FB_HOST || 'localhost',
                port: parseInt(process.env.FB_PORT || '3050', 10),
                database: process.env.FB_DATABASE || '',
                user: process.env.FB_USER || 'SYSDBA',
                password: process.env.FB_PASSWORD || 'masterkey',
                role: process.env.FB_ROLE || null,
                pageSize: 4096
            },
            databaseDirectory: process.env.FIREBIRD_DB_DIR || './databases'
        };
    } catch (error) {
        logger.error(`Error cargando configuración: ${error}`);
        return DEFAULT_SERVER_CONFIG;
    }
};
