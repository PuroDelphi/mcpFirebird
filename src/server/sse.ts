/**
 * SSE (Server-Sent Events) transport implementation for the MCP Firebird server
 * This allows clients to connect to the server using SSE instead of stdio
 */

import express from 'express';
import cors from 'cors';
import { createLogger } from '../utils/logger.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
// Import types from express

const logger = createLogger('server:sse');

// Map to store active transports by session ID
const activeTransports = new Map<string, SSEServerTransport>();

/**
 * Create and start an SSE server
 * @param {McpServer} server - The MCP server instance
 * @param {number} port - The port to listen on
 * @returns {Promise<{ app: express.Express, cleanup: () => Promise<void> }>} The Express app and cleanup function
 */
export async function startSseServer(
    server: Server<any, any, any>,
    port: number = 3001
): Promise<{ app: any, cleanup: () => Promise<void> }> {
    const app = express();

    // Enable CORS
    app.use(cors());

    // Parse JSON bodies
    app.use(express.json());

    // SSE endpoint
    app.get('/sse', async (req: any, res: any) => {
        try {
            // Generate a unique session ID
            const sessionId = req.query.sessionId?.toString() ||
                              `session-${Math.random().toString(36).substring(2, 15)}`;

            logger.info(`New SSE connection established with session ID: ${sessionId}`);

            // Set headers for SSE
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            // Create a new SSE transport
            const transport = new SSEServerTransport('/message', res);

            // Store the transport with the session ID
            activeTransports.set(sessionId, transport);

            // Connect the transport to the server
            await server.connect(transport);

            // Handle client disconnect
            req.on('close', () => {
                logger.info(`SSE connection closed for session ID: ${sessionId}`);
                activeTransports.delete(sessionId);
            });

            // Send initial message to confirm connection
            res.write(`data: ${JSON.stringify({ type: 'connection', sessionId })}\n\n`);
        } catch (error: any) {
            logger.error(`Error establishing SSE connection: ${error.message}`);
            res.status(500).send({ error: 'Failed to establish SSE connection' });
        }
    });

    // Message endpoint for client-to-server communication
    app.post('/message', async (req: any, res: any) => {
        try {
            const sessionId = req.query.sessionId?.toString();

            if (!sessionId) {
                logger.error('No session ID provided in message request');
                return res.status(400).send({ error: 'No session ID provided' });
            }

            const transport = activeTransports.get(sessionId);

            if (!transport) {
                logger.error(`No active transport found for session ID: ${sessionId}`);
                return res.status(404).send({ error: 'Session not found' });
            }

            logger.debug(`Received message for session ID: ${sessionId}`);

            // Handle the message
            await transport.handlePostMessage(req, res);
        } catch (error: any) {
            logger.error(`Error handling message: ${error.message}`);
            res.status(500).send({ error: 'Failed to process message' });
        }
    });

    // Health check endpoint
    app.get('/health', (req: any, res: any) => {
        res.status(200).send({
            status: 'ok',
            activeSessions: activeTransports.size
        });
    });

    // Start the server
    const httpServer = app.listen(port, () => {
        logger.info(`SSE server listening on port ${port}`);
    });

    // Cleanup function
    const cleanup = async (): Promise<void> => {
        return new Promise((resolve) => {
            httpServer.close(() => {
                logger.info('SSE server closed');
                resolve();
            });
        });
    };

    return { app, cleanup };
}


