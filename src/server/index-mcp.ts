/**
 * Entry point for the MCP Firebird server using the modern McpServer implementation
 * This file provides a clean entry point for the new implementation while maintaining
 * backward compatibility with the old implementation.
 */

import { startMcpServer } from './mcp-server.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('server:index-mcp');

/**
 * Main function to start the MCP Firebird server
 * @returns A promise that resolves when the server is started
 */
export async function startServer(): Promise<void> {
    try {
        logger.info('Starting MCP Firebird server with modern McpServer implementation...');
        await startMcpServer();
    } catch (error) {
        logger.error(`Error starting MCP Firebird server: ${error instanceof Error ? error.message : String(error)}`, {
            stack: error instanceof Error ? error.stack : undefined
        });
        process.exit(1);
    }
}

// If this file is run directly, start the server
if (import.meta.url === import.meta.resolve(process.argv[1])) {
    startServer().catch(error => {
        console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    });
}
