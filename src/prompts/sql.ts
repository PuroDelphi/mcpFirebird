// SQL-related prompts
import { z, ZodType } from 'zod';
import { createLogger } from '../utils/logger.js';
// Import the unified PromptDefinition
import { PromptDefinition } from './database.js';

const logger = createLogger('prompts:sql');

// --- Prompt Definitions --- //

const queryDataPrompt: PromptDefinition = {
    name: "query-data",
    description: "Executes and analyzes a SQL query in Firebird",
    inputSchema: z.object({
        sql: z.string().min(1).describe("SQL query to execute")
    }),
    handler: async ({ sql }: { sql: string }) => ({
        messages: [{
            role: "user",
            content: {
                type: "text",
                text: `Please execute and analyze the following SQL query in the Firebird database:\n\n\`\`\`sql\n${sql}\n\`\`\`\n\nExplain the results clearly and concisely.`
            }
        }]
    })
};

const optimizeQueryPrompt: PromptDefinition = {
    name: "optimize-query",
    description: "Optimizes a SQL query for Firebird",
    inputSchema: z.object({
        sql: z.string().min(1).describe("SQL query to optimize")
    }),
    handler: async ({ sql }: { sql: string }) => ({
        messages: [{
            role: "user",
            content: {
                type: "text",
                text: `Please analyze and optimize the following SQL query for Firebird:\n\n\`\`\`sql\n${sql}\n\`\`\`\n\nExplain the improvements made and why they might enhance performance.`
            }
        }]
    })
};

const generateSqlPrompt: PromptDefinition = {
    name: "generate-sql",
    description: "Generates a SQL query for Firebird based on a description",
    inputSchema: z.object({
        description: z.string().min(1).describe("Description of the query to be generated")
    }),
    handler: async ({ description }: { description: string }) => ({
        messages: [{
            role: "user",
            content: {
                type: "text",
                text: `Please generate a SQL query for Firebird based on the following description:\n\n${description}\n\nExplain the generated query and how it works.`
            }
        }]
    })
};

// Array with all SQL prompt definitions
const sqlPrompts: PromptDefinition[] = [
    queryDataPrompt,
    optimizeQueryPrompt,
    generateSqlPrompt
];

// --- Configuration Function --- //

/**
 * Sets up SQL-related prompts for the MCP server
 * and returns a map with their definitions.
 * @returns {Map<string, PromptDefinition>} Map with prompt definitions.
 */
export const setupSqlPrompts = (): Map<string, PromptDefinition> => {
    const promptsMap = new Map<string, PromptDefinition>();
    sqlPrompts.forEach(prompt => {
        promptsMap.set(prompt.name, prompt);
        logger.debug(`SQL prompt definition loaded: ${prompt.name}`);
    });
    logger.info(`Defined ${promptsMap.size} SQL prompts.`);
    return promptsMap;
};
