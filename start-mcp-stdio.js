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

// Print environment variables for debugging
console.log('Environment variables before starting MCP Firebird:');
console.log(`FIREBIRD_DATABASE: ${env.FIREBIRD_DATABASE}`);
console.log(`FB_DATABASE: ${env.FB_DATABASE}`);

// Create a batch file to set environment variables and run the MCP Firebird server
const batchContent = `
@echo off
set FIREBIRD_DATABASE=${databasePath.replace(/\//g, '\\')}
set FB_DATABASE=${databasePath.replace(/\//g, '\\')}
set FIREBIRD_HOST=localhost
set FB_HOST=localhost
set FIREBIRD_PORT=3050
set FB_PORT=3050
set FIREBIRD_USER=SYSDBA
set FB_USER=SYSDBA
set FIREBIRD_PASSWORD=masterkey
set FB_PASSWORD=masterkey

node "${path.join(__dirname, 'dist/cli.js')}" --database "${databasePath}" --host localhost --port 3050 --user SYSDBA --password masterkey

echo "Database path: ${databasePath.replace(/\//g, '\\')}"
`;

// Write the batch file
const batchFilePath = path.join(__dirname, 'run-mcp-temp.bat');
fs.writeFileSync(batchFilePath, batchContent);
console.log(`Created temporary batch file: ${batchFilePath}`);

// Start the MCP Firebird server using the batch file
const mcpProcess = spawn(batchFilePath, [], {
  stdio: 'inherit',
  shell: true
});

// Clean up the batch file when the process exits
mcpProcess.on('exit', () => {
  try {
    fs.unlinkSync(batchFilePath);
    console.log(`Removed temporary batch file: ${batchFilePath}`);
  } catch (error) {
    console.error(`Error removing temporary batch file: ${error}`);
  }
});

// Handle process exit
process.on('SIGINT', () => {
  console.log('Stopping MCP Firebird server...');
  mcpProcess.kill();
  process.exit(0);
});

// Keep the process running
process.stdin.resume();
