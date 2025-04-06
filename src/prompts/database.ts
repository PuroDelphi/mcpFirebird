// src/prompts/database.ts
import { z, ZodObject, ZodTypeAny } from 'zod';
import { createLogger } from '../utils/logger.js';
import { getTableSchema } from '../db/schema.js';
import { listTables } from '../db/queries.js';
import { stringifyCompact } from '../utils/jsonHelper.js';

const logger = createLogger('prompts:database');

/**
 * Interfaz unificada para definir un Prompt MCP.
 */
export interface PromptDefinition {
    name: string;
    description: string;
    inputSchema: z.ZodTypeAny;
    // El handler SIEMPRE debe devolver la estructura { messages: [...] }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler: (args: any) => Promise<{ messages: { role: string; content: any }[] }>;
}

// --- Definiciones de Prompts --- //

const createAssistantTextMessage = (text: string) => ({
    messages: [{ role: "assistant", content: { type: "text", text } }]
});

const analyzeTablePrompt: PromptDefinition = {
    name: "analyze-table",
    description: "Analyzes the structure of a specific table and returns its schema.",
    inputSchema: z.object({
        tableName: z.string().min(1).describe("Name of the table to analyze")
    }),
    handler: async (params: { tableName: string }) => {
        logger.info(`Executing analyze-table prompt for: ${params.tableName}`);
        try {
            const schema = await getTableSchema(params.tableName);
            const resultText = `Schema for table '${params.tableName}':\n\`\`\`json\n${stringifyCompact(schema)}\n\`\`\``;
            return createAssistantTextMessage(resultText);
        } catch (error: any) {
            logger.error(`Error in analyze-table prompt for ${params.tableName}: ${error.message || error}`);
            const errorText = `Error analyzing table ${params.tableName}: ${error.message || String(error)}`;
            return createAssistantTextMessage(errorText); // Wrap error in message structure
        }
    }
};

const listTablesPrompt: PromptDefinition = {
    name: "list-tables-prompt",
    description: "Lists all available tables in the database.",
    inputSchema: z.object({}), // No parameters
    handler: async () => {
        logger.info('Executing list-tables-prompt');
        try {
            const tables = await listTables();
            const tableListText = `Available tables:\n- ${tables.join('\n- ')}`;
            return createAssistantTextMessage(tableListText);
        } catch (error: any) {
            logger.error(`Error in list-tables-prompt: ${error.message || error}`);
            const errorText = `Error listing tables: ${error.message || String(error)}`;
            return createAssistantTextMessage(errorText);
        }
    }
};

// Array with all database prompt definitions
const databasePrompts: PromptDefinition[] = [
    analyzeTablePrompt,
    listTablesPrompt
    // Add more prompts here...
];

// --- Configuration Function --- //

/**
 * Sets up prompts related to database structure
 * and returns a map with their definitions.
 * @returns {Map<string, PromptDefinition>} Map with prompt definitions.
 */
export const setupDatabasePrompts = (): Map<string, PromptDefinition> => {
    const promptsMap = new Map<string, PromptDefinition>();
    databasePrompts.forEach(prompt => {
        promptsMap.set(prompt.name, prompt);
        logger.debug(`Database prompt definition loaded: ${prompt.name}`);
    });
    logger.info(`Defined ${promptsMap.size} database prompts.`);
    return promptsMap;
};
