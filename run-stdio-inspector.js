// Script to run the MCP Firebird server in STDIO mode and provide instructions for using the inspector
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
import { createServer } from 'http';
import fs from 'fs';

// Get the current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get the path to the MCP Firebird server
const mcpFirebirdPath = path.resolve(__dirname, 'dist/cli.js');
console.log(`MCP Firebird path: ${mcpFirebirdPath}`);

// Get the database path from environment variables
let databasePath = process.env.FIREBIRD_DATABASE || process.env.FB_DATABASE || 'F:\\Proyectos\\SAI\\EMPLOYEE.FDB';
console.log(`Database path: ${databasePath}`);

// Create a configuration file for Claude Desktop
const claudeConfigPath = path.resolve(__dirname, 'claude-desktop-mcp.json');
const claudeConfigContent = JSON.stringify({
  "mcpServers": {
    "mcp-firebird": {
      "command": "npx",
      "args": [
        "mcp-firebird",
        "--database",
        databasePath.replace(/\\/g, '\\\\'),
        "--host",
        "localhost",
        "--port",
        "3050",
        "--user",
        "SYSDBA",
        "--password",
        "masterkey"
      ],
      "type": "stdio"
    }
  }
}, null, 2);

fs.writeFileSync(claudeConfigPath, claudeConfigContent);
console.log(`Created Claude Desktop configuration file: ${claudeConfigPath}`);

// Create a simple HTTP server to display instructions
const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`
    <html>
      <head>
        <title>MCP Firebird Server (STDIO Mode)</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          h1 { color: #333; }
          h2 { color: #555; margin-top: 30px; }
          pre { background-color: #f5f5f5; padding: 10px; border-radius: 5px; }
          .success { color: green; }
          .error { color: red; }
          .warning { color: orange; }
          .command { background-color: #f0f0f0; padding: 10px; border-radius: 5px; font-family: monospace; }
          .note { background-color: #ffffd0; padding: 10px; border-radius: 5px; }
          .steps { background-color: #e6f7ff; padding: 15px; border-radius: 5px; }
        </style>
      </head>
      <body>
        <h1>MCP Firebird Server (STDIO Mode)</h1>
        <p class="success">✅ MCP Firebird server is ready to be used with the inspector in STDIO mode</p>

        <div class="steps">
          <h2>Using with Claude Desktop</h2>
          <ol>
            <li>A configuration file <code>claude-desktop-mcp.json</code> has been created in the project root directory</li>
            <li>Copy this file to your Claude Desktop configuration directory</li>
            <li>Start Claude Desktop and select the MCP Firebird server from the dropdown</li>
          </ol>
        </div>

        <h2>Easiest Method: All-in-One Script</h2>
        <p>We've created an all-in-one script that starts everything for you:</p>
        <div class="command">node run-all-stdio.js</div>
        <p>This will:</p>
        <ol>
          <li>Start the MCP Inspector</li>
          <li>Open it in your browser</li>
          <li>Display instructions for configuring it</li>
        </ol>
        <p class="note">Then in the inspector interface, configure it with:</p>
        <ul>
          <li>Transport Type: <code>STDIO</code></li>
          <li>Command: <code>node</code> (not node.exe)</li>
          <li>Arguments: <code>start-mcp-stdio.js</code></li>
        </ul>

        <h2>Manual Method</h2>
        <p>If you prefer to do it manually:</p>
        <ol>
          <li>Run: <code>npx @modelcontextprotocol/inspector</code></li>
          <li>Open <a href="http://127.0.0.1:6274" target="_blank">http://127.0.0.1:6274</a> in your browser</li>
          <li>Configure with the settings above</li>
        </ol>

        <h2>Configuration Details</h2>
        <pre>
  Database: ${databasePath}
  Host: localhost
  Port: 3050
  User: SYSDBA
  Transport: STDIO
        </pre>

        <h2>Troubleshooting</h2>
        <ul>
          <li>If you see an error about <code>--env</code> parameter, try configuring the inspector manually through the UI</li>
          <li>Make sure you have the latest version of Node.js installed</li>
          <li>Check that the database path is correct and accessible</li>
          <li>If you're having issues with the inspector, try using Claude Desktop instead</li>
        </ul>

        <p>Press Ctrl+C in the terminal running this script to stop the server.</p>
      </body>
    </html>
  `);
});

// Start the HTTP server
server.listen(3000, () => {
  console.log('Server is running at http://localhost:3000');
  console.log('Open this URL in your browser to see instructions');
});

// Handle process exit
process.on('SIGINT', () => {
  console.log('Stopping server...');
  server.close();
  process.exit(0);
});
