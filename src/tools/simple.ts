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

    // Mantener solo la herramienta echo

    return tools;
};

export type ToolDefinition = {
    name: string;
    description: string;
    inputSchema: z.ZodType<any>;
    handler: (args: any) => Promise<any>;
};
