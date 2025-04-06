/**
 * Security module for the MCP Firebird server
 */

export * from './config.js';
export * from './audit.js';
export * from './dataMasking.js';
export * from './resourceLimits.js';
export * from './authorization.js';

import { initSecurityConfig } from './config.js';
import { createAuditTable } from './audit.js';
import { createLogger } from '../utils/logger.js';
const logger = createLogger('security:index');

/**
 * Initialize the security module
 * @param {string} configPath - Path to the security configuration file
 */
export async function initSecurity(configPath?: string): Promise<void> {
    try {
        // Initialize security configuration
        initSecurityConfig(configPath);

        // Create audit table if needed
        await createAuditTable();

        logger.info('Security module initialized successfully');
    } catch (error: any) {
        logger.error(`Error initializing security module: ${error.message}`);
    }
}
