// Script to run the MCP server with SSE transport
import dotenv from 'dotenv';
import { spawn } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

console.log('Loading environment variables from .env file...');

// Set the transport type to SSE
process.env.TRANSPORT_TYPE = 'sse';

// Get the SSE port from environment variables or use default
const ssePort = process.env.SSE_PORT || 3003;
process.env.SSE_PORT = ssePort.toString();
console.log(`SSE_PORT: ${process.env.SSE_PORT}`);

// Fix path format for Windows
if (process.env.FB_DATABASE) {
  process.env.FB_DATABASE = path.normalize(process.env.FB_DATABASE);
  console.log(`FB_DATABASE: ${process.env.FB_DATABASE}`);
}

if (process.env.FIREBIRD_DATABASE) {
  process.env.FIREBIRD_DATABASE = path.normalize(process.env.FIREBIRD_DATABASE);
  console.log(`FIREBIRD_DATABASE: ${process.env.FIREBIRD_DATABASE}`);
}

// Create a child process with the environment variables
const child = spawn('node', ['dist/index.js'], {
  env: process.env,
  stdio: 'inherit',
  shell: true
});

// Handle process exit
child.on('exit', (code) => {
  console.log(`Child process exited with code ${code}`);
  process.exit(code);
});

// Handle process error
child.on('error', (error) => {
  console.error(`Error starting child process: ${error.message}`);
  process.exit(1);
});
