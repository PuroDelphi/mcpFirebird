#!/usr/bin/env node

/**
 * MCP Firebird - CLI entry point
 * This is the main entry point for the MCP Firebird server when run from the command line
 */

// Load environment variables from .env file
import dotenv from 'dotenv';
dotenv.config();

// Import stdout guard to prevent accidental writes to stdout
import './utils/stdout-guard.js';

// Import core dependencies
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from './server/create-server.js';
import { createLogger } from './utils/logger.js';
import pkg from '../package.json' with { type: 'json' };

const { version } = pkg;
const logger = createLogger('cli');

/**
 * Main function to start the server
 */
async function main() {
  logger.info(`Starting MCP Firebird Server v${version}...`);
  logger.info(`Platform: ${process.platform}, Node.js: ${process.version}`);

  try {
    // Create the server
    const { server } = await createServer();

    // Create the stdio transport
    const transport = new StdioServerTransport();

    // Connect the server to the transport
    await server.connect(transport);

    // Setup cleanup function for SIGINT (Ctrl+C)
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT signal, cleaning up...');
      logger.info('Closing stdio transport...');
      await server.close();
      logger.info('Server closed successfully');
      process.exit(0);
    });

    // Setup cleanup function for SIGTERM
    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM signal, cleaning up...');
      logger.info('Closing stdio transport...');
      await server.close();
      logger.info('Server closed successfully');
      process.exit(0);
    });

    logger.info('MCP Firebird server with stdio transport connected and ready to receive requests.');
    logger.info('Server waiting for requests...');
  } catch (error) {
    logger.error(`Error starting server: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// Start the server
main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
