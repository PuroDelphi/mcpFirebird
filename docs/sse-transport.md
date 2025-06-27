# SSE Transport Configuration Guide

This guide covers the Server-Sent Events (SSE) transport configuration for MCP Firebird, which allows the server to run as a web service for remote access and web application integration.

## Overview

SSE (Server-Sent Events) transport enables MCP Firebird to run as a web server, making it accessible to web applications, remote clients, and development tools like the MCP Inspector. This is particularly useful for:

- Web application integration
- Remote database access
- Development and testing with MCP Inspector
- Multi-client scenarios
- Load balancing and scaling

## Basic SSE Configuration

### Command Line Usage

```bash
# Basic SSE server
npx mcp-firebird --transport-type sse --database /path/to/database.fdb

# With custom port
npx mcp-firebird --transport-type sse --sse-port 3003 --database /path/to/database.fdb

# Full configuration
npx mcp-firebird \
  --transport-type sse \
  --sse-port 3003 \
  --host localhost \
  --port 3050 \
  --database /path/to/database.fdb \
  --user SYSDBA \
  --password masterkey
```

### Environment Variables

```bash
# Transport configuration
export TRANSPORT_TYPE=sse
export SSE_PORT=3003

# Database configuration
export DB_HOST=localhost
export DB_PORT=3050
export DB_DATABASE=/path/to/database.fdb
export DB_USER=SYSDBA
export DB_PASSWORD=masterkey

# Start server
npx mcp-firebird
```

## Advanced Configuration

### Session Management

Configure session timeouts and limits for optimal performance:

```bash
# Session configuration
export SSE_SESSION_TIMEOUT_MS=1800000    # 30 minutes (default)
export MAX_SESSIONS=1000                 # Maximum concurrent sessions
export SESSION_CLEANUP_INTERVAL_MS=60000 # Cleanup every minute

# Start with session management
npx mcp-firebird --transport-type sse
```

### CORS Configuration

For web applications, configure Cross-Origin Resource Sharing:

```bash
# CORS settings
export CORS_ORIGIN="https://myapp.com,https://localhost:3000"
export CORS_METHODS="GET,POST,OPTIONS"
export CORS_HEADERS="Content-Type,mcp-session-id,Cache-Control"
export CORS_CREDENTIALS=false

# Development (allow all origins)
export CORS_ORIGIN="*"

npx mcp-firebird --transport-type sse
```

### Logging Configuration

```bash
# Enable debug logging
export LOG_LEVEL=debug

# Custom log format
export LOG_FORMAT=json

npx mcp-firebird --transport-type sse
```

## SSE Endpoints

When running in SSE mode, the server exposes several endpoints:

### Main Endpoints

- **SSE Connection**: `GET http://localhost:3003/sse`
  - Establishes SSE connection for real-time communication
  - Returns `text/event-stream` content type
  - Handles session management automatically

- **Message Handling**: `POST http://localhost:3003/messages?sessionId={id}`
  - Sends messages to the server
  - Requires valid session ID from SSE connection
  - Content-Type: `application/json`

- **Health Check**: `GET http://localhost:3003/health`
  - Returns server status and metrics
  - Useful for monitoring and load balancing

### Health Check Response

```json
{
  "status": "healthy",
  "activeSessions": 5,
  "uptime": 3600,
  "protocols": {
    "sse": true,
    "streamableHttp": false
  },
  "sessions": {
    "totalSessions": 25,
    "activeSessions": 5,
    "expiredSessions": 20,
    "averageSessionDuration": 1200000
  }
}
```

## Client Integration

### JavaScript/Web Client Example

```javascript
// Establish SSE connection
const eventSource = new EventSource('http://localhost:3003/sse');
let sessionId = null;

eventSource.onopen = function(event) {
    console.log('SSE connection established');
};

eventSource.onmessage = function(event) {
    const data = JSON.parse(event.data);
    
    // Extract session ID from first message
    if (data.sessionId && !sessionId) {
        sessionId = data.sessionId;
        console.log('Session ID:', sessionId);
    }
    
    // Handle server responses
    console.log('Server response:', data);
};

// Send message to server
async function sendMessage(message) {
    if (!sessionId) {
        throw new Error('No active session');
    }
    
    const response = await fetch(`http://localhost:3003/messages?sessionId=${sessionId}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(message)
    });
    
    return response.json();
}

// Example: List tables
sendMessage({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
        name: 'list-tables'
    }
});
```

### Python Client Example

```python
import requests
import sseclient
import json

class MCPFirebirdSSEClient:
    def __init__(self, base_url='http://localhost:3003'):
        self.base_url = base_url
        self.session_id = None
        self.sse_client = None
    
    def connect(self):
        """Establish SSE connection"""
        sse_url = f"{self.base_url}/sse"
        response = requests.get(sse_url, stream=True)
        self.sse_client = sseclient.SSEClient(response)
        
        # Get session ID from first message
        for event in self.sse_client.events():
            data = json.loads(event.data)
            if 'sessionId' in data:
                self.session_id = data['sessionId']
                break
    
    def send_message(self, message):
        """Send message to server"""
        if not self.session_id:
            raise Exception('No active session')
        
        url = f"{self.base_url}/messages"
        params = {'sessionId': self.session_id}
        
        response = requests.post(url, json=message, params=params)
        return response.json()
    
    def list_tables(self):
        """List database tables"""
        message = {
            'jsonrpc': '2.0',
            'id': 1,
            'method': 'tools/call',
            'params': {
                'name': 'list-tables'
            }
        }
        return self.send_message(message)

# Usage
client = MCPFirebirdSSEClient()
client.connect()
tables = client.list_tables()
print(tables)
```

## Production Deployment

### Using PM2

```bash
# Install PM2
npm install -g pm2

# Create ecosystem file
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'mcp-firebird-sse',
    script: 'npx',
    args: 'mcp-firebird',
    env: {
      TRANSPORT_TYPE: 'sse',
      SSE_PORT: 3003,
      DB_DATABASE: '/var/lib/firebird/production.fdb',
      DB_USER: 'APP_USER',
      DB_PASSWORD: process.env.DB_PASSWORD,
      LOG_LEVEL: 'info'
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G'
  }]
};
EOF

# Start with PM2
pm2 start ecosystem.config.js
```

### Using Docker

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Install MCP Firebird
RUN npm install -g mcp-firebird@alpha

# Expose SSE port
EXPOSE 3003

# Set environment variables
ENV TRANSPORT_TYPE=sse
ENV SSE_PORT=3003

# Start server
CMD ["npx", "mcp-firebird"]
```

```bash
# Build and run
docker build -t mcp-firebird-sse .
docker run -d \
  --name mcp-firebird \
  -p 3003:3003 \
  -e DB_DATABASE=/data/database.fdb \
  -e DB_USER=SYSDBA \
  -e DB_PASSWORD=masterkey \
  -v /path/to/database:/data \
  mcp-firebird-sse
```

### Nginx Reverse Proxy

```nginx
upstream mcp_firebird {
    server localhost:3003;
}

server {
    listen 80;
    server_name mcp-firebird.yourdomain.com;
    
    location / {
        proxy_pass http://mcp_firebird;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # SSE specific settings
        proxy_buffering off;
        proxy_read_timeout 24h;
        proxy_send_timeout 24h;
    }
}
```

## Troubleshooting

### Common Issues

1. **Connection Refused**
   ```bash
   # Check if server is running
   curl http://localhost:3003/health
   
   # Check port availability
   netstat -an | grep 3003
   ```

2. **Session Timeout**
   ```bash
   # Increase session timeout
   export SSE_SESSION_TIMEOUT_MS=3600000  # 1 hour
   ```

3. **CORS Errors**
   ```bash
   # Allow specific origins
   export CORS_ORIGIN="https://yourapp.com"
   
   # Development: allow all origins
   export CORS_ORIGIN="*"
   ```

4. **Memory Issues**
   ```bash
   # Reduce max sessions
   export MAX_SESSIONS=100
   
   # More frequent cleanup
   export SESSION_CLEANUP_INTERVAL_MS=30000
   ```

### Monitoring

```bash
# Check server health
curl http://localhost:3003/health | jq

# Monitor active sessions
watch -n 5 'curl -s http://localhost:3003/health | jq .sessions'

# Enable debug logging
export LOG_LEVEL=debug
npx mcp-firebird --transport-type sse
```

## Security Considerations

- Use environment variables for sensitive configuration
- Implement proper CORS policies for production
- Use HTTPS in production with reverse proxy
- Monitor session usage and implement rate limiting
- Regularly update to latest versions
- Use strong database credentials
- Consider firewall rules for port access

## Next Steps

- [Streamable HTTP Transport](./streamable-http.md)
- [Transport Comparison](./transport-comparison.md)
- [Session Management](./session-management.md)
- [Security Guide](./security.md)
