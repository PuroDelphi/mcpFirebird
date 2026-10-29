/**
 * Simple tools for testing compatibility with Claude Desktop
 * These tools follow exactly the pattern of the official examples
 */

import { z } from 'zod';
import { createLogger } from '../utils/logger.js';
import { finalizeTools, toolResult, type ToolDraft } from './contracts.js';
export type { ToolDefinition } from './contracts.js';

const logger = createLogger('tools:simple');

/**
 * Tool definitions for simple tools
 */
export const setupSimpleTools = () => {
    const tools = new Map<string, ToolDraft>();

    // Preserve the original message in structuredContent; encode display text.
    tools.set('echo', {
        name: 'echo',
        description: 'Echoes the original message in structured data with markup-encoded display text',
        inputSchema: z.object({
            message: z.string().describe('The message to echo back')
        }),
        handler: async (args: { message: string }) => {
            logger.info('Echo tool called');

            return toolResult({ message: args.message }, { text: args.message });
        }
    });

    // Mantener solo la herramienta echo

    return finalizeTools(tools, { echo: z.object({ message: z.string() }) });
};
