#!/usr/bin/env node

/**
 * MCP Firebird - CLI entry point
 * This is the main entry point for the MCP Firebird server when run from the command line
 */

// Process command line arguments first
import minimist from 'minimist';
import { normalizeDatabasePath, ConfigOptions } from './db/connection.js';
const argv = minimist(process.argv.slice(2));

// Debug: Log all command line arguments
console.error('Command line arguments:', JSON.stringify(argv));
console.error('Raw process.argv:', JSON.stringify(process.argv));

// Load environment variables from .env file first (will be overridden by command line args)
import dotenv from 'dotenv';
dotenv.config();

// Create database configuration object from command line arguments and environment variables
export const dbConfig: ConfigOptions = {
  host: argv.host || process.env.FIREBIRD_HOST || process.env.FB_HOST || 'localhost',
  port: argv.port ? parseInt(argv.port, 10) : process.env.FIREBIRD_PORT ? parseInt(process.env.FIREBIRD_PORT, 10) : process.env.FB_PORT ? parseInt(process.env.FB_PORT, 10) : 3050,
  database: argv.database ? normalizeDatabasePath(argv.database) : process.env.FIREBIRD_DATABASE ? normalizeDatabasePath(process.env.FIREBIRD_DATABASE) : process.env.FB_DATABASE ? normalizeDatabasePath(process.env.FB_DATABASE) : '',
  user: argv.user || process.env.FIREBIRD_USER || process.env.FB_USER || 'SYSDBA',
  password: argv.password || process.env.FIREBIRD_PASSWORD || process.env.FB_PASSWORD || 'masterkey',
  role: argv.role || process.env.FIREBIRD_ROLE || process.env.FB_ROLE,
  pageSize: 4096
};

// Make the configuration globally available
(global as any).MCP_FIREBIRD_CONFIG = dbConfig;

// Also set environment variables for backward compatibility and to ensure they're available throughout the application
if (argv.database || dbConfig.database) {
  process.env.FIREBIRD_DATABASE = dbConfig.database;
  process.env.FB_DATABASE = dbConfig.database;
  console.error(`Setting FIREBIRD_DATABASE to ${dbConfig.database}`);
}
if (argv.user || dbConfig.user) {
  process.env.FIREBIRD_USER = dbConfig.user;
  process.env.FB_USER = dbConfig.user;
  console.error(`Setting FIREBIRD_USER to ${dbConfig.user}`);
}
if (argv.password || dbConfig.password) {
  process.env.FIREBIRD_PASSWORD = dbConfig.password;
  process.env.FB_PASSWORD = dbConfig.password;
  console.error('Setting FIREBIRD_PASSWORD (value hidden)');
}
if (argv.host || dbConfig.host) {
  process.env.FIREBIRD_HOST = dbConfig.host;
  process.env.FB_HOST = dbConfig.host;
  console.error(`Setting FIREBIRD_HOST to ${dbConfig.host}`);
}
if (argv.port || dbConfig.port) {
  process.env.FIREBIRD_PORT = String(dbConfig.port);
  process.env.FB_PORT = String(dbConfig.port);
  console.error(`Setting FIREBIRD_PORT to ${dbConfig.port}`);
}
if (argv.role || dbConfig.role) {
  process.env.FIREBIRD_ROLE = dbConfig.role || '';
  process.env.FB_ROLE = dbConfig.role || '';
  console.error(`Setting FIREBIRD_ROLE to ${dbConfig.role || 'not set'}`);
}

// Environment variables are already loaded above

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

  // Log the database connection parameters (without sensitive info)
  logger.info(`Database connection parameters:`);
  logger.info(`- Host: ${dbConfig.host}`);
  logger.info(`- Port: ${dbConfig.port}`);
  logger.info(`- Database: ${dbConfig.database || 'Not specified'}`);
  logger.info(`- User: ${dbConfig.user}`);
  // Don't log the password
  logger.info(`- Role: ${dbConfig.role || 'Not specified'}`);

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
