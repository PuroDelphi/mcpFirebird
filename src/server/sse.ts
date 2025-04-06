/**
 * SSE (Server-Sent Events) transport implementation for the MCP Firebird server
 * This allows clients to connect to the server using SSE instead of stdio
 */

import express from 'express';
import cors from 'cors';
import { createLogger } from '../utils/logger.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

const logger = createLogger('server:sse');

/**
 * Create and start an SSE server
 * @param {Server} server - The MCP server instance
 * @param {number} port - The port to listen on
 * @returns {Promise<{ app: any, cleanup: () => Promise<void> }>} The Express app and cleanup function
 */
export async function startSseServer(
    server: Server<any, any, any>,
    port: number = 3003
): Promise<{ app: any, cleanup: () => Promise<void> }> {
    const app = express();

    // Enable CORS
    app.use(cors({
        origin: '*',
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'X-Session-ID', 'Authorization']
    }));

    // Parse JSON bodies
    app.use(express.json());

    // Global transport variable
    let transport: SSEServerTransport | null = null;

    // SSE endpoint - both root and /sse path
    const handleSseRequest = async (req: any, res: any) => {
        try {
            logger.info(`New SSE connection request received from ${req.url}`);
            logger.info(`Headers: ${JSON.stringify(req.headers)}`);
            logger.info(`Query: ${JSON.stringify(req.query)}`);

            // Create a new SSE transport
            transport = new SSEServerTransport('/message', res);

            // Connect the transport to the server
            await server.connect(transport);

            logger.info('SSE transport connected to server');

            // Set up cleanup on server close
            server.onclose = async () => {
                logger.info('Server closing, cleaning up SSE transport');
                if (transport) {
                    await transport.close().catch(error => {
                        logger.error(`Error closing transport: ${error.message}`);
                    });
                }
            };
        } catch (error: any) {
            logger.error(`Error establishing SSE connection: ${error.message}`);
            // Only send a response if headers haven't been sent yet
            if (!res.headersSent) {
                res.status(500).send({ error: 'Failed to establish SSE connection' });
            }
        }
    };

    // Register the handler for both root and /sse paths
    app.get('/', handleSseRequest);
    app.get('/sse', handleSseRequest);

    // Message endpoint for client-to-server communication
    app.post('/message', async (req: any, res: any) => {
        try {
            logger.info('Received message from client');

            if (!transport) {
                logger.error('No active transport found');
                return res.status(404).send({ error: 'No active transport found' });
            }

            // Handle the message
            await transport.handlePostMessage(req, res);
        } catch (error: any) {
            logger.error(`Error handling message: ${error.message}`);
            // Only send a response if headers haven't been sent yet
            if (!res.headersSent) {
                res.status(500).send({
                    jsonrpc: '2.0',
                    id: req.body?.id,
                    error: {
                        code: -32603,
                        message: 'Internal server error',
                        data: error.message
                    }
                });
            }
        }
    });

    // Health check endpoint
    app.get('/health', (req: any, res: any) => {
        res.status(200).send({
            status: 'ok',
            hasActiveTransport: !!transport
        });
    });

    // Start the server
    const httpServer = app.listen(port, () => {
        logger.info(`SSE server listening on port ${port}`);
    });

    // Cleanup function
    const cleanup = async (): Promise<void> => {
        return new Promise((resolve) => {
            // Close the HTTP server
            httpServer.close(() => {
                logger.info('SSE server closed');
                resolve();
            });
        });
    };

    return { app, cleanup };
}
