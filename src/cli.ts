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

// Default database path for testing
const DEFAULT_DATABASE_PATH = 'F:/Proyectos/SAI/EMPLOYEE.FDB';

// Check for firebirdHost and firebirdPort in argv (for Smithery compatibility)
const hostParam = argv.host || argv.firebirdHost;
const portParam = argv.port || argv.firebirdPort;
const databaseParam = argv.database || argv.firebirdDatabase;
const userParam = argv.user || argv.firebirdUser;
const passwordParam = argv.password || argv.firebirdPassword;
const roleParam = argv.role || argv.firebirdRole;

// Create database configuration object directly from command line arguments
export const dbConfig: ConfigOptions = {
  host: hostParam || '127.0.0.1', // Use 127.0.0.1 instead of 'localhost'
  port: portParam ? parseInt(String(portParam), 10) : 3050,
  database: databaseParam ? normalizeDatabasePath(databaseParam) : normalizeDatabasePath(DEFAULT_DATABASE_PATH),
  user: userParam || 'SYSDBA',
  password: passwordParam || 'masterkey',
  role: roleParam,
  pageSize: 4096
};

// Set environment variables for the default database if not provided
if (!process.env.FIREBIRD_DATABASE && !process.env.FB_DATABASE && !argv.database) {
  process.env.FIREBIRD_DATABASE = DEFAULT_DATABASE_PATH;
  process.env.FB_DATABASE = DEFAULT_DATABASE_PATH;
  console.error(`Setting default FIREBIRD_DATABASE to ${DEFAULT_DATABASE_PATH}`);
}

// Make the configuration globally available
(global as any).MCP_FIREBIRD_CONFIG = dbConfig;

// Set transport type from command line arguments
if (argv['transport-type']) {
  process.env.TRANSPORT_TYPE = argv['transport-type'];
}
if (argv['sse-port']) {
  process.env.SSE_PORT = String(argv['sse-port']);
}
if (argv['http-port']) {
  process.env.HTTP_PORT = String(argv['http-port']);
}

// Process --env parameter if provided
if (argv.env && typeof argv.env === 'string') {
  try {
    const envVars = JSON.parse(argv.env);
    console.error('Processing --env parameter:', envVars);

    // Apply environment variables from --env parameter
    for (const [key, value] of Object.entries(envVars)) {
      if (typeof value === 'string') {
        process.env[key] = value;
        console.error(`Setting environment variable ${key} from --env parameter`);
      }
    }
  } catch (error) {
    console.error('Error parsing --env parameter:', error);
  }
}

// Also set environment variables for backward compatibility
if (databaseParam) {
  process.env.FIREBIRD_DATABASE = databaseParam;
  process.env.FB_DATABASE = databaseParam;
  console.error(`Setting FIREBIRD_DATABASE to ${databaseParam}`);
}
if (userParam) {
  process.env.FIREBIRD_USER = userParam;
  process.env.FB_USER = userParam;
  console.error(`Setting FIREBIRD_USER to ${userParam}`);
}
if (passwordParam) {
  process.env.FIREBIRD_PASSWORD = passwordParam;
  process.env.FB_PASSWORD = passwordParam;
  console.error('Setting FIREBIRD_PASSWORD (value hidden)');
}
if (hostParam) {
  process.env.FIREBIRD_HOST = hostParam;
  process.env.FB_HOST = hostParam;
  console.error(`Setting FIREBIRD_HOST to ${hostParam}`);
}
if (portParam) {
  process.env.FIREBIRD_PORT = String(portParam);
  process.env.FB_PORT = String(portParam);
  console.error(`Setting FIREBIRD_PORT to ${portParam}`);
}
if (roleParam) {
  process.env.FIREBIRD_ROLE = roleParam;
  process.env.FB_ROLE = roleParam;
  console.error(`Setting FIREBIRD_ROLE to ${roleParam}`);
}

// Debug: Log final environment variables
console.error('Final environment variables:');
console.error(`FIREBIRD_DATABASE: ${process.env.FIREBIRD_DATABASE}`);
console.error(`FB_DATABASE: ${process.env.FB_DATABASE}`);

// Load environment variables from .env file (will not override existing env vars)
import dotenv from 'dotenv';
dotenv.config();

// Import stdout guard to prevent accidental writes to stdout
import './utils/stdout-guard.js';

// Import core dependencies
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
    // Import and use the main function from server/index.ts which handles multiple transports
    const { main: serverMain } = await import('./server/index.js');
    await serverMain();

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
