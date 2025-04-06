// Script to run the MCP inspector with SSE transport
import dotenv from 'dotenv';
import { spawn } from 'child_process';
import * as path from 'path';

dotenv.config();

console.log('Loading environment variables from .env file...');

// Get the SSE port from environment variables or use default
const ssePort = process.env.SSE_PORT || 3003;
console.log(`SSE_PORT: ${ssePort}`);

// Create a child process with the environment variables
const child = spawn('npx', ['@modelcontextprotocol/inspector', `http://localhost:${ssePort}`], {
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
