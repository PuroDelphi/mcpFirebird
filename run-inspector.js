// Script to run the MCP inspector with environment variables from .env
import dotenv from 'dotenv';
import { spawn } from 'child_process';
import path from 'path';

dotenv.config();

console.log('Loading environment variables from .env file...');

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
const child = spawn('npx', ['@modelcontextprotocol/inspector', 'node', 'dist/index.js'], {
  env: process.env,
  stdio: 'inherit'
});

// Handle process exit
child.on('exit', (code) => {
  process.exit(code);
});
