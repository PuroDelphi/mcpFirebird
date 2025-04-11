# SSE Transport Usage Examples in MCP Firebird

This document provides detailed examples on how to use the SSE (Server-Sent Events) transport with the MCP Firebird server.

## Introduction

The MCP Firebird server supports SSE transport, which allows clients to connect to the server via HTTP and receive real-time updates. This functionality is especially useful for web applications that need to maintain a persistent connection with the server.

## Server Configuration

To start the MCP Firebird server with SSE support, follow these steps:

1. Configure the environment variables in your `.env` file:

```
TRANSPORT_TYPE=sse
SSE_PORT=3003
```

2. Start the server with the command:

```bash
npx mcp-firebird --transport-type sse --sse-port 3003 --database /path/to/database.fdb --host localhost --port 3050 --user SYSDBA --password masterkey
```

The server will be available at `http://localhost:3003`.

## Client Examples

### 1. Basic HTML/JavaScript Client

Create a simple HTML file with the following content:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MCP Firebird SSE Client</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        #output { border: 1px solid #ccc; padding: 10px; height: 300px; overflow-y: auto; }
        button { margin: 10px 0; padding: 5px 10px; }
    </style>
</head>
<body>
    <h1>MCP Firebird SSE Client</h1>

    <div>
        <button id="listTablesBtn">List Tables</button>
        <button id="executeQueryBtn">Execute Query</button>
    </div>

    <h2>Output:</h2>
    <pre id="output"></pre>

    <script>
        const output = document.getElementById('output');
        const listTablesBtn = document.getElementById('listTablesBtn');
        const executeQueryBtn = document.getElementById('executeQueryBtn');

        // Connect to the SSE server
        const eventSource = new EventSource('http://localhost:3003');
        let requestId = 1;

        // Handle incoming messages
        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            output.innerHTML += `Received: ${JSON.stringify(data, null, 2)}\n\n`;
            output.scrollTop = output.scrollHeight;
        };

        // Handle connection open
        eventSource.onopen = () => {
            output.innerHTML += "Connected to MCP Firebird server\n\n";
        };

        // Handle errors
        eventSource.onerror = (error) => {
            output.innerHTML += `Error: ${error.type}\n\n`;
            eventSource.close();
        };

        // Send a request to list tables
        listTablesBtn.addEventListener('click', () => {
            const request = {
                id: requestId++,
                method: 'list-tables',
                params: {}
            };

            fetch('http://localhost:3003', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(request)
            });

            output.innerHTML += `Sent: ${JSON.stringify(request, null, 2)}\n\n`;
        });

        // Send a request to execute a query
        executeQueryBtn.addEventListener('click', () => {
            const request = {
                id: requestId++,
                method: 'execute-query',
                params: {
                    sql: 'SELECT FIRST 5 * FROM RDB$RELATIONS'
                }
            };

            fetch('http://localhost:3003', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(request)
            });

            output.innerHTML += `Sent: ${JSON.stringify(request, null, 2)}\n\n`;
        });
    </script>
</body>
</html>
```

Save this file as `sse-client.html` and open it in a web browser. You can click the buttons to send requests to the MCP Firebird server and see the responses.

### 2. Python Client

Here's an example of a Python client that uses the `requests` and `sseclient` libraries:

```python
import json
import requests
import sseclient
import threading

# Server URL
SERVER_URL = 'http://localhost:3003'

# Request ID counter
request_id = 1

# Function to handle SSE events
def handle_events():
    client = sseclient.SSEClient(SERVER_URL)

    print("Connected to SSE server. Waiting for events...")

    for event in client.events():
        try:
            data = json.loads(event.data)
            print(f"Received: {json.dumps(data, indent=2)}")
        except Exception as e:
            print(f"Error parsing event: {e}")

# Start the event handler in a separate thread
event_thread = threading.Thread(target=handle_events)
event_thread.daemon = True
event_thread.start()

# Function to send a request
def send_request(method, params=None):
    global request_id

    if params is None:
        params = {}

    request = {
        'id': request_id,
        'method': method,
        'params': params
    }

    request_id += 1

    print(f"Sending: {json.dumps(request, indent=2)}")

    response = requests.post(
        SERVER_URL,
        headers={'Content-Type': 'application/json'},
        data=json.dumps(request)
    )

    print(f"HTTP Response: {response.status_code}")

# Interactive menu
while True:
    print("\nMCP Firebird SSE Client")
    print("1. List Tables")
    print("2. Execute Query")
    print("3. Describe Table")
    print("4. Exit")

    choice = input("Enter your choice (1-4): ")

    if choice == '1':
        send_request('list-tables')
    elif choice == '2':
        sql = input("Enter SQL query: ")
        send_request('execute-query', {'sql': sql})
    elif choice == '3':
        table_name = input("Enter table name: ")
        send_request('describe-table', {'tableName': table_name})
    elif choice == '4':
        break
    else:
        print("Invalid choice. Please try again.")
```

Save this file as `sse_client.py` and run it with Python. Make sure to install the required libraries first:

```bash
pip install requests sseclient-py
```

### 3. Node.js Client

Here's an example of a Node.js client that uses the `eventsource` and `node-fetch` libraries:

```javascript
const EventSource = require('eventsource');
const fetch = require('node-fetch');
const readline = require('readline');

// Server URL
const SERVER_URL = 'http://localhost:3003';

// Request ID counter
let requestId = 1;

// Create EventSource for SSE
const eventSource = new EventSource(SERVER_URL);

// Handle incoming messages
eventSource.onmessage = (event) => {
    try {
        const data = JSON.parse(event.data);
        console.log('Received:', JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error parsing event:', error);
    }
};

// Handle connection open
eventSource.onopen = () => {
    console.log('Connected to MCP Firebird server');
};

// Handle errors
eventSource.onerror = (error) => {
    console.error('Error:', error);
    eventSource.close();
};

// Function to send a request
async function sendRequest(method, params = {}) {
    const request = {
        id: requestId++,
        method,
        params
    };

    console.log('Sending:', JSON.stringify(request, null, 2));

    try {
        const response = await fetch(SERVER_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(request)
        });

        console.log('HTTP Response:', response.status);
    } catch (error) {
        console.error('Error sending request:', error);
    }
}

// Create readline interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Interactive menu
function showMenu() {
    console.log('\nMCP Firebird SSE Client');
    console.log('1. List Tables');
    console.log('2. Execute Query');
    console.log('3. Describe Table');
    console.log('4. Exit');

    rl.question('Enter your choice (1-4): ', (choice) => {
        switch (choice) {
            case '1':
                sendRequest('list-tables').then(showMenu);
                break;
            case '2':
                rl.question('Enter SQL query: ', (sql) => {
                    sendRequest('execute-query', { sql }).then(showMenu);
                });
                break;
            case '3':
                rl.question('Enter table name: ', (tableName) => {
                    sendRequest('describe-table', { tableName }).then(showMenu);
                });
                break;
            case '4':
                eventSource.close();
                rl.close();
                break;
            default:
                console.log('Invalid choice. Please try again.');
                showMenu();
                break;
        }
    });
}

// Start the menu
showMenu();
```

Save this file as `sse-client.js` and run it with Node.js. Make sure to install the required libraries first:

```bash
npm install eventsource node-fetch
```

## Using with MCP Inspector

The MCP Inspector is a tool that allows you to interact with MCP servers. You can use it to test your MCP Firebird server with SSE transport:

```bash
npx @modelcontextprotocol/inspector http://localhost:3003
```

This will open the MCP Inspector in your browser, where you can send requests to the MCP Firebird server and see the responses.

## Advanced Configuration

### CORS Support

If you need to access the SSE server from a different domain, you can enable CORS support:

```
CORS_ENABLED=true
CORS_ORIGIN=*
```

Or specify allowed origins:

```
CORS_ENABLED=true
CORS_ORIGIN=https://example.com,https://app.example.com
```

### SSL/TLS Support

For production environments, it's recommended to use SSL/TLS:

```
SSL_ENABLED=true
SSL_CERT=/path/to/cert.pem
SSL_KEY=/path/to/key.pem
```

### Using with a Proxy

If you need to use the SSE server behind a proxy, you can use the included SSE proxy:

```bash
# Start the MCP Firebird server with SSE transport
npx mcp-firebird --transport-type sse --sse-port 3003

# In another terminal, start the SSE proxy
node run-sse-proxy.js
```

The proxy will be available at `http://localhost:3005` and will forward requests to the MCP Firebird server.

## Troubleshooting

### Connection Issues

If you're having trouble connecting to the SSE server, check the following:

1. Make sure the server is running and listening on the correct port.
2. Check for CORS issues if you're connecting from a web browser.
3. Verify that there are no firewalls or network restrictions blocking the connection.

### Event Handling

If you're not receiving events, check the following:

1. Make sure the EventSource is properly initialized.
2. Check the browser console for any errors.
3. Verify that the server is sending events in the correct format.

### Request Format

Make sure your requests follow the MCP protocol format:

```json
{
  "id": 1,
  "method": "method-name",
  "params": {
    "param1": "value1",
    "param2": "value2"
  }
}
```

## Conclusion

The SSE transport provides a convenient way to interact with the MCP Firebird server from web applications and other clients. By following the examples in this document, you should be able to integrate MCP Firebird with your applications using SSE.
