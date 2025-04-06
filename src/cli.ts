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

// Create database configuration object directly from command line arguments
export const dbConfig: ConfigOptions = {
  host: argv.host || 'localhost',
  port: argv.port ? parseInt(argv.port, 10) : 3050,
  database: argv.database ? normalizeDatabasePath(argv.database) : '',
  user: argv.user || 'SYSDBA',
  password: argv.password || 'masterkey',
  role: argv.role,
  pageSize: 4096
};

// Make the configuration globally available
(global as any).MCP_FIREBIRD_CONFIG = dbConfig;

// Load security configuration if provided
if (argv['security-config']) {
  try {
    const fs = await import('fs');
    const securityConfigPath = argv['security-config'];
    console.error(`Loading security configuration from ${securityConfigPath}`);
    const securityConfigContent = fs.readFileSync(securityConfigPath, 'utf8');
    const securityConfig = JSON.parse(securityConfigContent);
    console.error('Security configuration loaded successfully');
    console.error(`Security config: ${JSON.stringify(securityConfig, null, 2)}`);
    (global as any).MCP_SECURITY_CONFIG = securityConfig;
  } catch (error) {
    console.error(`Error loading security configuration: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Also set environment variables for backward compatibility
if (argv.database) {
  process.env.FIREBIRD_DATABASE = argv.database;
  process.env.FB_DATABASE = argv.database;
  console.error(`Setting FIREBIRD_DATABASE to ${argv.database}`);
}
if (argv.user) {
  process.env.FIREBIRD_USER = argv.user;
  process.env.FB_USER = argv.user;
  console.error(`Setting FIREBIRD_USER to ${argv.user}`);
}
if (argv.password) {
  process.env.FIREBIRD_PASSWORD = argv.password;
  process.env.FB_PASSWORD = argv.password;
  console.error('Setting FIREBIRD_PASSWORD (value hidden)');
}
if (argv.host) {
  process.env.FIREBIRD_HOST = argv.host;
  process.env.FB_HOST = argv.host;
  console.error(`Setting FIREBIRD_HOST to ${argv.host}`);
}
if (argv.port) {
  process.env.FIREBIRD_PORT = argv.port;
  process.env.FB_PORT = argv.port;
  console.error(`Setting FIREBIRD_PORT to ${argv.port}`);
}
if (argv.role) {
  process.env.FIREBIRD_ROLE = argv.role;
  process.env.FB_ROLE = argv.role;
  console.error(`Setting FIREBIRD_ROLE to ${argv.role}`);
}

// Load environment variables from .env file (will not override existing env vars)
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
