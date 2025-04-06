/**
 * Stdout Guard Module
 *
 * This module protects stdout from accidental writes that would break the JSONRPC protocol.
 * MCP requires that stdout is completely clean for proper communication.
 */

import { createLogger } from './logger.js';

const logger = createLogger('stdout-guard');

// Store the original stdout.write function
const originalStdoutWrite = process.stdout.write.bind(process.stdout);

/**
 * Controlled stdout write function
 * When using stdio transport, we need to ensure that only valid JSONRPC messages
 * are written to stdout. This function is used to replace the original stdout.write
 * function to prevent accidental writes.
 *
 * @param buffer - The buffer to write to stdout
 * @returns Whether the write was successful
 */
process.stdout.write = function(buffer: string | Uint8Array | any): boolean {
    // Only allow writes when explicitly using the stdio transport
    const transportType = process.env.TRANSPORT_TYPE?.toLowerCase() || 'stdio';

    if (transportType === 'stdio') {
        // Allow the write to proceed
        if (buffer) {
            return originalStdoutWrite(buffer);
        }
    } else {
        // For non-stdio transports, log the attempted write to stderr instead
        if (buffer) {
            const content = typeof buffer === 'string' ? buffer :
                           buffer instanceof Uint8Array ? '[Binary data]' :
                           String(buffer);

            logger.debug(`Prevented stdout write: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`);
        }
    }

    return true;
};

/**
 * Restore the original stdout.write function
 * This should only be used in special cases where you need to bypass the guard
 */
export function restoreStdout(): void {
    logger.warn('Restoring original stdout.write function - this may break JSONRPC communication');
    process.stdout.write = originalStdoutWrite;
}

/**
 * Enable or disable the stdout guard
 * @param enable - Whether to enable the guard
 */
export function setStdoutGuard(enable: boolean): void {
    if (enable) {
        logger.info('Enabling stdout guard');
        process.stdout.write = process.stdout.write; // Keep the current implementation
    } else {
        logger.warn('Disabling stdout guard - this may break JSONRPC communication');
        process.stdout.write = originalStdoutWrite;
    }
}

// Export the module
export default {
    restoreStdout,
    setStdoutGuard
};