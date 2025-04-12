// Script to run both the MCP Firebird server in STDIO mode and the MCP Inspector
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Starting MCP Inspector...');

// Start the MCP Inspector
const inspectorProcess = spawn('npx', ['@modelcontextprotocol/inspector'], {
  stdio: 'inherit',
  shell: true
});

// Wait for the inspector to start
setTimeout(() => {
  console.log('Opening MCP Inspector in browser...');
  
  // Open the inspector in the browser
  const openBrowserProcess = spawn('start', ['http://127.0.0.1:6274'], {
    stdio: 'inherit',
    shell: true
  });
  
  // Display instructions
  console.log('\n=================================================');
  console.log('MCP Inspector is running at http://127.0.0.1:6274');
  console.log('Configure it with:');
  console.log('  - Transport Type: STDIO');
  console.log('  - Command: node');
  console.log('  - Arguments: start-mcp-stdio.js');
  console.log('=================================================\n');
  
  // Handle process exit
  process.on('SIGINT', () => {
    console.log('Stopping MCP Inspector...');
    inspectorProcess.kill();
    process.exit(0);
  });
}, 3000);
