// Script to run the MCP inspector with the MCP Firebird server in STDIO mode
import { spawn, execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get the path to the MCP Firebird server
const mcpFirebirdPath = path.resolve(__dirname, 'dist/cli.js');
console.log(`MCP Firebird path: ${mcpFirebirdPath}`);

// Get the database path from environment variables
let databasePath = process.env.FIREBIRD_DATABASE || process.env.FB_DATABASE || 'F:\\Proyectos\\SAI\\EMPLOYEE.FDB';
console.log(`Database path: ${databasePath}`);

// Start the MCP Firebird server
const mcpFirebirdProcess = spawn('node', [mcpFirebirdPath, '--database', databasePath], {
  stdio: ['pipe', 'pipe', 'pipe']
});

console.log('Started MCP Firebird server');

// Log MCP Firebird server output
mcpFirebirdProcess.stdout.on('data', (data) => {
  console.log(`MCP Firebird: ${data}`);
});

mcpFirebirdProcess.stderr.on('data', (data) => {
  console.error(`MCP Firebird error: ${data}`);
});

// Handle MCP Firebird server exit
mcpFirebirdProcess.on('exit', (code) => {
  console.log(`MCP Firebird server exited with code ${code}`);
  process.exit(code);
});

// Wait for the MCP Firebird server to start
setTimeout(() => {
  // Start the MCP Inspector
  console.log('Starting MCP Inspector...');

  try {
    // Use execSync to run the MCP Inspector
    execSync('npx @modelcontextprotocol/inspector', {
      stdio: 'inherit'
    });
  } catch (error) {
    console.error(`Error starting MCP Inspector: ${error.message}`);
  }
}, 2000);
