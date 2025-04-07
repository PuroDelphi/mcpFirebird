// Script to run the MCP inspector with environment variables from .env
require('dotenv').config();
const { spawn } = require('child_process');
const path = require('path');

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
const npxPath = process.platform === 'win32' ? 'npx.cmd' : 'npx';

console.log(`Using NPX path: ${npxPath}`);

const child = spawn(npxPath, ['@modelcontextprotocol/inspector', '--transportType=stdio', '--command=node', '--args=dist/index.js'], {
  env: process.env,
  stdio: 'inherit',
  shell: true
});

// Handle process exit
child.on('exit', (code) => {
  process.exit(code);
});
