// Script to start the MCP Firebird server in STDIO mode
// This script is designed to be called by the MCP Inspector

import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import fs from 'fs';

// Get the current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database path - hardcoded to avoid path issues
const databasePath = 'F:/Proyectos/SAI/EMPLOYEE.FDB';

// Set environment variables explicitly
process.env.FIREBIRD_DATABASE = databasePath;
process.env.FB_DATABASE = databasePath;
console.log(`Setting FIREBIRD_DATABASE to ${databasePath}`);

// Create a custom environment with the database path
const env = { ...process.env };
env.FIREBIRD_DATABASE = databasePath;
env.FB_DATABASE = databasePath;

// Start the MCP Firebird server in STDIO mode
const mcpProcess = spawn('node', [
  path.join(__dirname, 'dist/cli.js'),
  '--database', databasePath
], {
  stdio: 'inherit',
  env: env
});

// Handle process exit
process.on('SIGINT', () => {
  console.log('Stopping MCP Firebird server...');
  mcpProcess.kill();
  process.exit(0);
});

// Keep the process running
process.stdin.resume();
