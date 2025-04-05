// Configuración del servidor MCP
import { createLogger } from '../utils/logger.js';
import { DEFAULT_CONFIG as DEFAULT_DB_CONFIG, ConfigOptions } from '../db/connection.js'; // Importar config por defecto y tipo

const logger = createLogger('server:config');

/**
 * Carga la configuración de conexión a la BD desde variables de entorno.
 * @returns {ConfigOptions} Configuración para la conexión a Firebird.
 */
export const getConfig = (): ConfigOptions => {
    logger.info('Cargando configuración de conexión a la base de datos...');

    try {
        const config: ConfigOptions = {
            host: process.env.FB_HOST || DEFAULT_DB_CONFIG.host,
            port: parseInt(process.env.FB_PORT || String(DEFAULT_DB_CONFIG.port), 10),
            database: process.env.FB_DATABASE || DEFAULT_DB_CONFIG.database, // Restore env var loading
            user: process.env.FB_USER || DEFAULT_DB_CONFIG.user,
            password: process.env.FB_PASSWORD || DEFAULT_DB_CONFIG.password,
            role: process.env.FB_ROLE || DEFAULT_DB_CONFIG.role,
            pageSize: DEFAULT_DB_CONFIG.pageSize, // Tomar siempre el default por ahora
            lowercase_keys: DEFAULT_DB_CONFIG.lowercase_keys // Tomar siempre el default
        };

        // Validación básica
        if (!config.database) { // Restore validation
            logger.error('La variable de entorno FB_DATABASE es obligatoria.');
            throw new Error('Configuración de base de datos incompleta: falta FB_DATABASE.');
        }
        if (isNaN(config.port)) {
            logger.warn(`Puerto inválido (FB_PORT=${process.env.FB_PORT}), usando puerto por defecto ${DEFAULT_DB_CONFIG.port}`);
            config.port = DEFAULT_DB_CONFIG.port;
        }

        logger.debug('Configuración de BD cargada: %o', { ...config, password: '***' }); // Usar formato %o
        return config;

    } catch (error) {
        logger.error(`Error cargando configuración de BD: ${error}. Usando configuración por defecto.`);
        // Devolver la configuración por defecto de la BD
        return DEFAULT_DB_CONFIG;
    }
};
