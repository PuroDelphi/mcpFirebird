#!/usr/bin/env node

require('dotenv').config();
const express = require('express');
const fb = require('node-firebird');
const morgan = require('morgan');
const cors = require('cors');
const http = require('http');
const net = require('net');
const lockfile = require('lockfile');
const path = require('path');
const { Writable } = require('stream');
const WebSocket = require('ws');

// Función para enviar mensajes en formato JSON-RPC
function sendJsonRpcNotification(method, params = {}) {
    const notification = {
        jsonrpc: "2.0",
        method: method,
        params: params
    };
    process.stderr.write(JSON.stringify(notification) + '\n');
}

const app = express();
let port = parseInt(process.env.PORT || 3001);
let wsPort = parseInt(process.env.WS_PORT || 3002);
const maxPortRetries = 10;
const lockFilePath = path.join(__dirname, 'server.lock');

// Stream personalizado para morgan que usa JSON-RPC
const morganStream = new Writable({
    write(chunk, encoding, callback) {
        try {
            const message = JSON.parse(chunk);
            process.stderr.write(JSON.stringify(message) + '\n');
        } catch (error) {
            sendJsonRpcNotification("server/log", {
                message: chunk.toString()
            });
        }
        callback();
    }
});

// Formato personalizado para morgan que usa JSON-RPC
morgan.format('jsonrpc', (tokens, req, res) => {
    return JSON.stringify({
        jsonrpc: "2.0",
        method: "http/request",
        params: {
            method: tokens.method(req, res),
            url: tokens.url(req, res),
            status: parseInt(tokens.status(req, res)),
            responseTime: parseFloat(tokens['response-time'](req, res)),
            contentLength: tokens.res(req, res, 'content-length')
        }
    });
});

// Configurar morgan
app.use(morgan('jsonrpc', { stream: morganStream }));

// Middleware
app.use(cors());
app.use(express.json());

// Configuración de Firebird
const options = {
    host: process.env.FIREBIRD_HOST || 'localhost',
    port: process.env.FIREBIRD_PORT || 3050,
    database: process.env.FIREBIRD_DATABASE,
    user: process.env.FIREBIRD_USER || 'SYSDBA',
    password: process.env.FIREBIRD_PASSWORD || 'masterkey',
    lowercase_keys: false,
    role: null,
    pageSize: 4096
};

// Función para conectar a la base de datos
function connectToDatabase(callback) {
    fb.attach(options, function(err, db) {
        if (err) {
            sendJsonRpcNotification("database/error", {
                message: "Connection error",
                error: err.message
            });
            return callback(err);
        }
        callback(null, db);
    });
}

// Endpoint de estado
app.get('/status', (req, res) => {
    res.json({ 
        status: 'ready',
        port: port,
        wsPort: wsPort,
        serverInfo: {
            name: "mcp-firebird",
            version: "1.0.34"
        }
    });
});

// Endpoint de ping
app.get('/ping', (req, res) => {
    res.json({ status: 'alive', message: 'Server is running' });
});

// Función para manejar solicitudes JSON-RPC
function handleJsonRpcRequest(request) {
    const notification = {
        jsonrpc: "2.0",
        method: "server/message",
        params: {
            type: "received",
            message: request
        }
    };
    process.stderr.write(JSON.stringify(notification) + '\n');

    if (!request.jsonrpc || request.jsonrpc !== "2.0") {
        return {
            jsonrpc: "2.0",
            id: request.id || null,
            error: {
                code: -32600,
                message: "Invalid Request"
            }
        };
    }

    switch (request.method) {
        case "initialize":
            return {
                jsonrpc: "2.0",
                id: request.id,
                result: {
                    protocolVersion: "2024-11-05",
                    capabilities: {
                        dataProvider: true,
                        tools: {}
                    },
                    serverInfo: {
                        name: "mcp-firebird",
                        version: "1.0.34"
                    }
                }
            };
        case "notifications/initialized":
            process.stderr.write(JSON.stringify({
                jsonrpc: "2.0",
                method: "server/status",
                params: {
                    status: "initialized",
                    clientInfo: request.params?.clientInfo
                }
            }) + '\n');
            return null;
        default:
            return {
                jsonrpc: "2.0",
                id: request.id,
                error: {
                    code: -32601,
                    message: "Method not found"
                }
            };
    }
}

// Función para iniciar el servidor WebSocket
function startWebSocketServer(port, callback) {
    try {
        if (lockfile.checkSync(lockFilePath)) {
            try {
                lockfile.unlockSync(lockFilePath);
            } catch (error) {
                sendJsonRpcNotification("server/lock", {
                    message: "Error removing lock file",
                    error: error.message
                });
            }
        }

        const wss = new WebSocket.Server({ port });
        
        wss.on('connection', (ws) => {
            sendJsonRpcNotification("websocket/connection", {
                status: "connected"
            });

            ws.on('message', (message) => {
                try {
                    const request = JSON.parse(message);
                    const response = handleJsonRpcRequest(request);
                    
                    if (response === null) return;
                    
                    if (response instanceof Promise) {
                        response.then(res => {
                            ws.send(JSON.stringify(res));
                        });
                    } else {
                        ws.send(JSON.stringify(response));
                    }
                } catch (error) {
                    sendJsonRpcNotification("websocket/error", {
                        message: "Message parsing error",
                        error: error.message
                    });
                    ws.send(JSON.stringify({
                        jsonrpc: "2.0",
                        id: null,
                        error: {
                            code: -32700,
                            message: "Parse error"
                        }
                    }));
                }
            });

            ws.on('close', () => {
                sendJsonRpcNotification("websocket/connection", {
                    status: "disconnected"
                });
            });

            ws.on('error', (error) => {
                sendJsonRpcNotification("websocket/error", {
                    message: "WebSocket error",
                    error: error.message
                });
            });
        });

        try {
            lockfile.lockSync(lockFilePath, {
                stale: 10000,
                retries: 0
            });
        } catch (error) {
            sendJsonRpcNotification("server/lock", {
                message: "Lock file exists",
                error: error.message
            });
        }

        callback(null, port);
    } catch (error) {
        callback(error);
    }
}

// Función de limpieza
function cleanup() {
    sendJsonRpcNotification("server/cleanup", {
        message: "Cleaning up resources"
    });
    try {
        if (lockfile.checkSync(lockFilePath)) {
            lockfile.unlockSync(lockFilePath);
        }
    } catch (error) {
        sendJsonRpcNotification("server/error", {
            message: "Cleanup error",
            error: error.message
        });
    }
    process.exit(0);
}

// Manejar señales de terminación
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

// Iniciar el servidor HTTP
checkPort(port, function(availablePort) {
    port = availablePort;
    const server = http.createServer(app);
    
    server.listen(port, () => {
        sendJsonRpcNotification("server/http", {
            status: "listening",
            port: port
        });
        
        checkWsPort(wsPort, function(availableWsPort) {
            wsPort = availableWsPort;
            startWebSocketServer(wsPort, function(err) {
                if (err) {
                    sendJsonRpcNotification("server/websocket", {
                        status: "error",
                        error: err.message
                    });
                    cleanup();
                } else {
                    sendJsonRpcNotification("server/websocket", {
                        status: "listening",
                        port: wsPort
                    });
                }
            });
        });
    });
    
    server.on('error', (error) => {
        sendJsonRpcNotification("server/http", {
            status: "error",
            error: error.message
        });
        cleanup();
    });
}); 