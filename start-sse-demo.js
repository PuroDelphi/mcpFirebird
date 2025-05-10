// Script to start the SSE server and open the HTML client
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import open from 'open';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Start the SSE server
console.log('Starting SSE server...');
const sseServer = spawn('node', ['run-sse-server.js'], {
  stdio: 'inherit',
  shell: true
});

// Wait for the SSE server to start
setTimeout(() => {
  // Start a simple HTTP server to serve the HTML client
  const htmlPath = path.join(__dirname, 'examples', 'sse-client.html');
  const server = http.createServer((req, res) => {
    if (req.url === '/') {
      fs.readFile(htmlPath, (err, data) => {
        if (err) {
          res.writeHead(500);
          res.end('Error loading HTML file');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data);
      });
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  const port = 8080;
  server.listen(port, () => {
    console.log(`HTML client server running at http://localhost:${port}`);
    // Open the HTML client in the browser
    open(`http://localhost:${port}`);
  });

  // Handle process termination
  process.on('SIGINT', () => {
    console.log('Shutting down...');
    sseServer.kill();
    server.close();
    process.exit(0);
  });
}, 2000);

console.log('Press Ctrl+C to stop the servers');
