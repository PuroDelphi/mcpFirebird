// Script to run both the MCP Firebird server in STDIO mode and the MCP Inspector
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Get the current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database path - hardcoded to avoid path issues
const databasePath = 'F:/Proyectos/SAI/EMPLOYEE.FDB';

// Create a batch file to set environment variables for the MCP Inspector
const inspectorBatchContent = `
@echo off
set FIREBIRD_DATABASE=${databasePath.replace(/\//g, '\\')}
set FB_DATABASE=${databasePath.replace(/\//g, '\\')}
npx @modelcontextprotocol/inspector
`;

const inspectorBatchPath = path.join(__dirname, 'run-inspector-temp.bat');
fs.writeFileSync(inspectorBatchPath, inspectorBatchContent);
console.log(`Created temporary inspector batch file: ${inspectorBatchPath}`);

console.log('Starting MCP Inspector...');

// Start the MCP Inspector using the batch file
const inspectorProcess = spawn(inspectorBatchPath, [], {
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

    // Clean up the batch file
    try {
      fs.unlinkSync(inspectorBatchPath);
      console.log(`Removed temporary inspector batch file: ${inspectorBatchPath}`);
    } catch (error) {
      console.error(`Error removing temporary inspector batch file: ${error}`);
    }

    process.exit(0);
  });
}, 3000);
