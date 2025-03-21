#!/usr/bin/env node

require('dotenv').config();
const express = require('express');
const fb = require('node-firebird');
const morgan = require('morgan');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const VERSION = require('./version');
const Firebird = require('node-firebird');

// Configuración de la base de datos
const dbConfig = {
    host: process.env.FB_HOST || 'localhost',
    port: process.env.FB_PORT || 3050,
    database: process.env.FB_DATABASE,
    user: process.env.FB_USER || 'sysdba',
    password: process.env.FB_PASSWORD || 'masterkey',
    maxConnections: parseInt(process.env.MAX_CONNECTIONS) || 50,
    queryTimeout: parseInt(process.env.QUERY_TIMEOUT) || 30000
};

// Pool de conexiones
const connectionPool = new Map();
let poolSize = 0;

// Función para obtener una conexión del pool
async function getConnection() {
    if (poolSize >= dbConfig.maxConnections) {
        throw new Error('Se ha alcanzado el límite máximo de conexiones');
    }

    return new Promise((resolve, reject) => {
        Firebird.attach(dbConfig, (err, db) => {
            if (err) {
                console.error('[DEBUG] Error conectando a la base de datos:', err);
                reject(err);
                return;
            }
            const connectionId = Math.random().toString(36).substring(7);
            connectionPool.set(connectionId, db);
            poolSize++;
            resolve({ id: connectionId, db });
        });
    });
}

// Función para liberar una conexión
function releaseConnection(connectionId) {
    const db = connectionPool.get(connectionId);
    if (db) {
        db.detach();
        connectionPool.delete(connectionId);
        poolSize--;
    }
}

// Función para ejecutar una consulta con timeout
async function executeQuery(connection, query, params = []) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('La consulta ha excedido el tiempo máximo de espera'));
        }, dbConfig.queryTimeout);

        connection.db.query(query, params, (err, result) => {
            clearTimeout(timeout);
            if (err) {
                console.error('[DEBUG] Error ejecutando consulta:', err);
                reject(err);
                return;
            }
            resolve(result);
        });
    });
}

// Función para enviar mensajes en formato JSON-RPC
function sendJsonRpcNotification(method, params = {}) {
    const notification = {
        jsonrpc: "2.0",
        method: method,
        params: params
    };
    process.stdout.write(JSON.stringify(notification) + '\n');
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ 
    noServer: true,
    clientTracking: true
});

// Configurar el servidor HTTP para manejar el upgrade a WebSocket
server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

// Mantener un registro de conexiones activas
const activeConnections = new Set();

// Middleware
app.use(cors());
app.use(express.json());

// Middleware para logging de solicitudes HTTP
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        sendJsonRpcNotification('http/request', {
            method: req.method,
            url: req.url,
            status: res.statusCode,
            responseTime: duration,
            contentLength: res.get('content-length')
        });
    });
    next();
});

// Middleware para validación de mensajes MCP
const validateMCPMessage = (req, res, next) => {
    if (!req.body.jsonrpc || req.body.jsonrpc !== '2.0') {
        return res.status(400).json({
            jsonrpc: '2.0',
            error: {
                code: -32600,
                message: 'Invalid Request: Not a valid JSON-RPC 2.0 message'
            }
        });
    }
    next();
};

// Middleware para manejo de errores MCP
const handleMCPError = (err, req, res, next) => {
    console.error('[DEBUG] Error MCP:', err);
    res.status(500).json({
        jsonrpc: '2.0',
        error: {
            code: -32603,
            message: err.message || 'Internal error',
            data: err.stack
        }
    });
};

// Ruta de estado
app.get('/status', (req, res) => {
    res.json({
        status: 'ready',
        port: process.env.PORT || 3001,
        wsPort: process.env.WS_PORT || 3002,
        serverInfo: {
            name: 'mcp-firebird',
            version: VERSION
        }
    });
});

// Endpoints para información de la base de datos
app.get('/database/info', async (req, res) => {
    try {
        const db = await getConnection();
        const info = await db.query(`
            SELECT 
                MON$DATABASE_NAME as name,
                MON$DATABASE_PAGE_SIZE as pageSize,
                MON$DATABASE_ENCODING as encoding,
                MON$DATABASE_DIALECT as dialect
            FROM MON$DATABASE
        `);
        
        res.json({
            name: info[0].name,
            version: '3.0', // Versión por defecto de Firebird
            pageSize: info[0].pageSize,
            encoding: info[0].encoding,
            dialect: info[0].dialect
        });
    } catch (error) {
        console.error('[DEBUG] Error obteniendo información de la base de datos:', error);
        res.status(500).json({
            error: 'Error al obtener información de la base de datos',
            details: error.message
        });
    }
});

app.get('/database/tables', async (req, res) => {
    try {
        const db = await getConnection();
        const tables = await db.query(`
            SELECT 
                rdb$relation_name as name,
                rdb$field_name as column_name,
                rdb$field_type as field_type,
                rdb$null_flag as nullable
            FROM rdb$relation_fields
            WHERE rdb$system_flag = 0
            ORDER BY rdb$relation_name, rdb$field_position
        `);

        // Agrupar columnas por tabla
        const tableMap = new Map();
        tables.forEach(row => {
            if (!tableMap.has(row.name)) {
                tableMap.set(row.name, {
                    name: row.name,
                    columns: []
                });
            }
            tableMap.get(row.name).columns.push({
                name: row.column_name,
                type: getFieldType(row.field_type),
                nullable: row.nullable === 1
            });
        });

        res.json({
            tables: Array.from(tableMap.values())
        });
    } catch (error) {
        console.error('[DEBUG] Error obteniendo lista de tablas:', error);
        res.status(500).json({
            error: 'Error al obtener lista de tablas',
            details: error.message
        });
    }
});

app.get('/database/tables/:tableName', async (req, res) => {
    try {
        const { tableName } = req.params;
        const db = await getConnection();
        
        // Obtener columnas
        const columns = await db.query(`
            SELECT 
                rdb$field_name as name,
                rdb$field_type as field_type,
                rdb$null_flag as nullable,
                rdb$default_source as default_value
            FROM rdb$relation_fields
            WHERE rdb$relation_name = ?
            ORDER BY rdb$field_position
        `, [tableName]);

        // Obtener clave primaria
        const primaryKey = await db.query(`
            SELECT s.rdb$field_name as column_name
            FROM rdb$indices i
            JOIN rdb$index_segments s ON i.rdb$index_name = s.rdb$index_name
            WHERE i.rdb$relation_name = ?
            AND i.rdb$unique_flag = 1
        `, [tableName]);

        // Obtener claves foráneas
        const foreignKeys = await db.query(`
            SELECT 
                rc.rdb$constraint_name as name,
                rc.rdb$relation_name as table_name,
                rc.rdb$index_name as index_name,
                s.rdb$field_name as column_name
            FROM rdb$relation_constraints rc
            JOIN rdb$index_segments s ON rc.rdb$index_name = s.rdb$index_name
            WHERE rc.rdb$constraint_type = 'FOREIGN KEY'
            AND rc.rdb$relation_name = ?
        `, [tableName]);

        res.json({
            name: tableName,
            columns: columns.map(col => ({
                name: col.name,
                type: getFieldType(col.field_type),
                nullable: col.nullable === 1,
                default: col.default_value
            })),
            primaryKey: primaryKey.map(pk => pk.column_name),
            foreignKeys: foreignKeys.map(fk => ({
                name: fk.name,
                column: fk.column_name
            }))
        });
    } catch (error) {
        console.error('[DEBUG] Error obteniendo estructura de tabla:', error);
        res.status(500).json({
            error: 'Error al obtener estructura de tabla',
            details: error.message
        });
    }
});

app.get('/database/stats', async (req, res) => {
    try {
        const db = await getConnection();
        
        // Obtener estadísticas
        const stats = await db.query(`
            SELECT 
                (SELECT COUNT(*) FROM rdb$relations WHERE rdb$system_flag = 0) as total_tables,
                (SELECT COUNT(*) FROM rdb$views) as total_views,
                (SELECT COUNT(*) FROM rdb$procedures) as total_procedures,
                (SELECT COUNT(*) FROM rdb$triggers) as total_triggers,
                (SELECT COUNT(*) FROM rdb$indices WHERE rdb$system_flag = 0) as total_indexes,
                (SELECT MON$PAGE_SIZE * MON$PAGES FROM MON$DATABASE) as database_size
            FROM MON$DATABASE
        `);

        res.json({
            totalTables: stats[0].total_tables,
            totalViews: stats[0].total_views,
            totalProcedures: stats[0].total_procedures,
            totalTriggers: stats[0].total_triggers,
            totalIndexes: stats[0].total_indexes,
            databaseSize: `${Math.round(stats[0].database_size / (1024 * 1024))}MB`,
            lastBackup: new Date().toISOString() // TODO: Implementar obtención de último backup
        });
    } catch (error) {
        console.error('[DEBUG] Error obteniendo estadísticas:', error);
        res.status(500).json({
            error: 'Error al obtener estadísticas',
            details: error.message
        });
    }
});

// Rutas MCP
app.post('/mcp/query', validateMCPMessage, async (req, res) => {
    let connection;
    try {
        const { method, params } = req.body;
        
        if (method !== 'query') {
            throw new Error('Invalid method');
        }

        const { sql, queryParams = [], options = {} } = params;
        
        if (!sql) {
            throw new Error('SQL query is required');
        }

        connection = await getConnection();
        const result = await executeQuery(connection, sql, queryParams);

        res.json({
            jsonrpc: '2.0',
            result: {
                data: result,
                metadata: {
                    rowCount: result.length,
                    executionTime: Date.now() - req.startTime
                }
            }
        });
    } catch (error) {
        next(error);
    } finally {
        if (connection) {
            releaseConnection(connection.id);
        }
    }
});

app.post('/mcp/analyze', validateMCPMessage, async (req, res) => {
    let connection;
    try {
        const { method, params } = req.body;
        
        if (method !== 'analyze') {
            throw new Error('Invalid method');
        }

        const { type, table, options = {} } = params;
        
        if (!type || !table) {
            throw new Error('Type and table are required');
        }

        connection = await getConnection();

        let result;
        switch (type) {
            case 'table_structure':
                result = await analyzeTableStructure(connection, table, options);
                break;
            case 'data_trends':
                result = await analyzeDataTrends(connection, table, options);
                break;
            default:
                throw new Error(`Unsupported analysis type: ${type}`);
        }

        res.json({
            jsonrpc: '2.0',
            result
        });
    } catch (error) {
        next(error);
    } finally {
        if (connection) {
            releaseConnection(connection.id);
        }
    }
});

// Funciones de análisis
async function analyzeTableStructure(connection, table, options) {
    const { includeIndexes = true, includeConstraints = true } = options;
    
    const columns = await executeQuery(connection, `
        SELECT 
            rdb$field_name as name,
            rdb$field_type as field_type,
            rdb$null_flag as nullable,
            rdb$default_source as default_value,
            rdb$field_length as length,
            rdb$field_scale as scale,
            rdb$field_precision as precision,
            rdb$field_sub_type as sub_type,
            rdb$field_source as source,
            rdb$description as description
        FROM rdb$relation_fields
        WHERE rdb$relation_name = ?
        ORDER BY rdb$field_position
    `, [table]);

    let indexes = [];
    if (includeIndexes) {
        indexes = await executeQuery(connection, `
            SELECT 
                i.rdb$index_name as name,
                i.rdb$unique_flag as is_unique,
                s.rdb$field_name as column_name,
                s.rdb$field_position as position
            FROM rdb$indices i
            JOIN rdb$index_segments s ON i.rdb$index_name = s.rdb$index_name
            WHERE i.rdb$relation_name = ?
            ORDER BY i.rdb$index_name, s.rdb$field_position
        `, [table]);
    }

    let constraints = [];
    if (includeConstraints) {
        constraints = await executeQuery(connection, `
            SELECT 
                rc.rdb$constraint_name as name,
                rc.rdb$relation_name as table_name,
                rc.rdb$index_name as index_name,
                s.rdb$field_name as column_name,
                rc.rdb$constraint_type as constraint_type
            FROM rdb$relation_constraints rc
            JOIN rdb$index_segments s ON rc.rdb$index_name = s.rdb$index_name
            WHERE rc.rdb$relation_name = ?
        `, [table]);
    }

    return {
        name: table,
        columns: columns.map(col => ({
            name: col.name,
            type: getFieldType(col.field_type),
            nullable: col.nullable === 1,
            default: col.default_value,
            length: col.length,
            scale: col.scale,
            precision: col.precision,
            subType: col.sub_type,
            source: col.source,
            description: col.description
        })),
        indexes: indexes.map(idx => ({
            name: idx.name,
            isUnique: idx.is_unique === 1,
            columns: indexes
                .filter(i => i.name === idx.name)
                .map(i => i.column_name)
        })),
        constraints: constraints.map(con => ({
            name: con.name,
            column: con.column_name,
            type: con.constraint_type
        }))
    };
}

async function analyzeDataTrends(connection, table, options) {
    const { field, period = 'monthly' } = options;
    
    if (!field) {
        throw new Error('Field is required for data trends analysis');
    }

    let timeGroup;
    switch (period) {
        case 'daily':
            timeGroup = 'EXTRACT(YEAR FROM date_field), EXTRACT(MONTH FROM date_field), EXTRACT(DAY FROM date_field)';
            break;
        case 'monthly':
            timeGroup = 'EXTRACT(YEAR FROM date_field), EXTRACT(MONTH FROM date_field)';
            break;
        case 'yearly':
            timeGroup = 'EXTRACT(YEAR FROM date_field)';
            break;
        default:
            throw new Error(`Unsupported period: ${period}`);
    }

    const trends = await executeQuery(connection, `
        SELECT 
            ${timeGroup} as time_period,
            COUNT(*) as count,
            AVG(${field}) as average,
            MIN(${field}) as minimum,
            MAX(${field}) as maximum
        FROM ${table}
        GROUP BY ${timeGroup}
        ORDER BY ${timeGroup}
    `);

    return {
        table,
        field,
        period,
        trends: trends.map(t => ({
            period: t.time_period,
            count: t.count,
            average: t.average,
            minimum: t.minimum,
            maximum: t.maximum
        }))
    };
}

// Manejo de conexiones WebSocket MCP
wss.on('connection', (ws) => {
    const connectionId = Math.random().toString(36).substring(7);
    activeConnections.add(ws);
    
    console.error(`[DEBUG] Nueva conexión MCP WebSocket establecida. ID: ${connectionId}`);
    console.error(`[DEBUG] Total de conexiones activas: ${activeConnections.size}`);
    
    sendJsonRpcNotification('mcp/connection', {
        status: 'connected',
        connectionId
    });

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            console.error(`[DEBUG] Mensaje MCP recibido de ${connectionId}:`, JSON.stringify(data, null, 2));
            
            if (data.jsonrpc !== '2.0') {
                throw new Error('Invalid JSON-RPC version');
            }

            let response;
            switch (data.method) {
                case 'initialize':
                    response = {
                        jsonrpc: '2.0',
                        id: data.id,
                        result: {
                            protocolVersion: '2024-11-05',
                            capabilities: {
                                query: true,
                                analyze: true,
                                subscribe: true
                            },
                            serverInfo: {
                                name: 'mcp-firebird',
                                version: VERSION
                            }
                        }
                    };
                    break;
                case 'query':
                    response = await handleQuery(data);
                    break;
                case 'analyze':
                    response = await handleAnalyze(data);
                    break;
                default:
                    throw new Error(`Unsupported method: ${data.method}`);
            }

            ws.send(JSON.stringify(response));
        } catch (error) {
            console.error(`[DEBUG] Error procesando mensaje MCP de ${connectionId}:`, error);
            ws.send(JSON.stringify({
                jsonrpc: '2.0',
                id: data.id,
                error: {
                    code: -32603,
                    message: error.message,
                    data: error.stack
                }
            }));
        }
    });

    ws.on('close', (code, reason) => {
        console.error(`[DEBUG] Conexión cerrada para ${connectionId}. Código: ${code}, Razón: ${reason}`);
        activeConnections.delete(ws);
        console.error(`[DEBUG] Total de conexiones activas después del cierre: ${activeConnections.size}`);
        sendJsonRpcNotification('mcp/connection', {
            status: 'disconnected',
            connectionId,
            code,
            reason
        });
    });

    ws.on('error', (error) => {
        console.error(`[DEBUG] Error en WebSocket para ${connectionId}:`, error);
        sendJsonRpcNotification('mcp/error', {
            error: error.message,
            connectionId
        });
        try {
            ws.close();
        } catch (closeError) {
            console.error(`[DEBUG] Error al cerrar WebSocket para ${connectionId}:`, closeError);
        }
    });
});

// Manejo de señales de terminación
function gracefulShutdown(signal) {
    console.error(`[DEBUG] Señal de terminación recibida: ${signal}`);
    console.error(`[DEBUG] Conexiones activas antes del cierre: ${activeConnections.size}`);
    
    // Cerrar todas las conexiones WebSocket
    for (const ws of activeConnections) {
        try {
            ws.close(1000, 'Server shutting down');
        } catch (error) {
            console.error('[DEBUG] Error al cerrar conexión WebSocket:', error);
        }
    }
    
    // Cerrar el servidor HTTP
    server.close(() => {
        console.error('[DEBUG] Servidor HTTP cerrado');
        process.exit(0);
    });
    
    // Si el servidor no se cierra en 5 segundos, forzar el cierre
    setTimeout(() => {
        console.error('[DEBUG] No se pudieron cerrar las conexiones a tiempo, forzando cierre');
        process.exit(1);
    }, 5000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Manejo de errores no capturados
process.on('uncaughtException', (error) => {
    console.error('[DEBUG] Excepción no capturada:', error);
    gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[DEBUG] Promesa rechazada no manejada:', reason);
    gracefulShutdown('unhandledRejection');
});

// Iniciar el servidor
const port = process.env.PORT || 3001;
const wsPort = process.env.WS_PORT || 3002;

console.error(`[DEBUG] Iniciando servidor en puerto ${port}`);

// Verificar que el puerto no esté en uso
server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`[DEBUG] El puerto ${port} ya está en uso`);
        process.exit(1);
    } else {
        console.error('[DEBUG] Error en el servidor:', error);
        process.exit(1);
    }
});

server.listen(port, () => {
    console.error(`[DEBUG] Servidor escuchando en puerto ${port}`);
    sendJsonRpcNotification('server/status', {
        status: 'initializing',
        version: VERSION
    });
    
    // Verificar que el servidor está listo para aceptar conexiones
    server.on('listening', () => {
        console.error('[DEBUG] Servidor listo para aceptar conexiones');
        sendJsonRpcNotification('server/status', {
            status: 'running',
            port: port,
            wsPort: wsPort
        });
    });
}); 