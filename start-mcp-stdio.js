// Script to start the MCP Firebird server in STDIO mode
// This script is designed to be called by the MCP Inspector

import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

// Get the current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database path - hardcoded to avoid path issues
const databasePath = 'F:/Proyectos/SAI/EMPLOYEE.FDB';

// Start the MCP Firebird server in STDIO mode
const mcpProcess = spawn('node', [
  path.join(__dirname, 'dist/cli.js'),
  '--database', databasePath
], {
  stdio: 'inherit'
});

// Handle process exit
process.on('SIGINT', () => {
  console.log('Stopping MCP Firebird server...');
  mcpProcess.kill();
  process.exit(0);
});

// Keep the process running
process.stdin.resume();
