/**
 * SSE (Server-Sent Events) transport implementation for MCP Firebird
 * Compatible con MCP y el SDK oficial TypeScript.
 * Maneja sesiones, limpieza, errores y compatibilidad con clientes legacy.
 */

import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

/**
 * Manejador SSE para clientes legacy MCP
 * @param server Instancia de McpServer
 * @returns Router Express listo para montar
 */
export function createSseRouter(server: McpServer): express.Router {
    const router = express.Router();
    // Almacén simple de transportes activos por sesión
    const sseTransports: Record<string, SSEServerTransport> = {};

    // Endpoint SSE principal
    router.get('/sse', async (req, res) => {
        // Crear transporte SSE
        const transport = new SSEServerTransport('/messages', res);
        sseTransports[transport.sessionId] = transport;

        // Limpieza al cerrar conexión
        res.on('close', () => {
            delete sseTransports[transport.sessionId];
        });

        try {
            await server.connect(transport);
        } catch (err) {
            res.end();
        }
    });

    // Endpoint para mensajes POST legacy
    router.post('/messages', async (req, res) => {
        const sessionId = req.query.sessionId as string;
        const transport = sseTransports[sessionId];
        if (!transport) {
            res.status(404).json({ error: 'Session not found' });
            return;
        }
        await transport.handlePostMessage(req, res);
    });

    return router;
}
