/**
 * Simple tools for testing compatibility with Claude Desktop
 * These tools follow exactly the pattern of the official examples
 */

import { z } from 'zod';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('tools:simple');

/**
 * Tool definitions for simple tools
 */
export const setupSimpleTools = () => {
    const tools = new Map();

    // Simple echo tool - returns exactly what it receives
    tools.set('echo', {
        name: 'echo',
        description: 'Echoes back the input message',
        inputSchema: z.object({
            message: z.string().describe('The message to echo back')
        }),
        handler: async (args: { message: string }) => {
            logger.info(`Echo tool called with message: ${args.message}`);
            
            return {
                content: [
                    {
                        type: "text",
                        text: args.message
                    }
                ]
            };
        }
    });

    // Simple status tool - returns the status of the server
    tools.set('status', {
        name: 'status',
        description: 'Returns the status of the server',
        inputSchema: z.object({}),
        handler: async () => {
            logger.info('Status tool called');
            
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            status: "ok",
                            timestamp: new Date().toISOString(),
                            message: "Server is running"
                        }, null, 2)
                    }
                ]
            };
        }
    });

    // Simple list-tables tool - returns a list of tables
    tools.set('simple-list-tables', {
        name: 'simple-list-tables',
        description: 'Returns a list of tables in the database',
        inputSchema: z.object({}),
        handler: async () => {
            logger.info('Simple list-tables tool called');
            
            try {
                // Just return a simple static response for testing
                const tables = [
                    { name: "USERS", type: "TABLE" },
                    { name: "PRODUCTS", type: "TABLE" },
                    { name: "ORDERS", type: "TABLE" }
                ];
                
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({ tables }, null, 2)
                        }
                    ]
                };
            } catch (error) {
                logger.error(`Error in simple-list-tables: ${error instanceof Error ? error.message : String(error)}`);
                
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                error: "Failed to list tables",
                                message: error instanceof Error ? error.message : String(error)
                            }, null, 2)
                        }
                    ]
                };
            }
        }
    });

    return tools;
};

export type ToolDefinition = {
    name: string;
    description: string;
    inputSchema: z.ZodType<any>;
    handler: (args: any) => Promise<any>;
};
