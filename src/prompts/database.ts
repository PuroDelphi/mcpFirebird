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
    description: "Analiza la estructura de una tabla específica y devuelve su esquema.",
    inputSchema: z.object({
        tableName: z.string().min(1).describe("Nombre de la tabla a analizar")
    }),
    handler: async (params: { tableName: string }) => {
        logger.info(`Ejecutando prompt analyze-table para: ${params.tableName}`);
        try {
            const schema = await getTableSchema(params.tableName);
            const resultText = `Esquema para la tabla '${params.tableName}':\n\`\`\`json\n${stringifyCompact(schema)}\n\`\`\``;
            return createAssistantTextMessage(resultText);
        } catch (error: any) {
            logger.error(`Error en prompt analyze-table para ${params.tableName}: ${error.message || error}`);
            const errorText = `Error analizando tabla ${params.tableName}: ${error.message || String(error)}`;
            return createAssistantTextMessage(errorText); // Wrap error in message structure
        }
    }
};

const listTablesPrompt: PromptDefinition = {
    name: "list-tables-prompt",
    description: "Lista todas las tablas disponibles en la base de datos.",
    inputSchema: z.object({}), // Sin parámetros
    handler: async () => {
        logger.info('Ejecutando prompt list-tables-prompt');
        try {
            const tables = await listTables();
            const tableListText = `Tablas disponibles:\n- ${tables.join('\n- ')}`;
            return createAssistantTextMessage(tableListText);
        } catch (error: any) {
            logger.error(`Error en prompt list-tables-prompt: ${error.message || error}`);
            const errorText = `Error listando tablas: ${error.message || String(error)}`;
            return createAssistantTextMessage(errorText);
        }
    }
};

// Array con todas las definiciones de prompts de base de datos
const databasePrompts: PromptDefinition[] = [
    analyzeTablePrompt,
    listTablesPrompt
    // Añadir más prompts aquí...
];

// --- Función de Configuración --- //

/**
 * Configura los prompts relacionados con la estructura de la base de datos
 * y devuelve un mapa con sus definiciones.
 * @returns {Map<string, PromptDefinition>} Mapa con las definiciones de prompts.
 */
export const setupDatabasePrompts = (): Map<string, PromptDefinition> => {
    const promptsMap = new Map<string, PromptDefinition>();
    databasePrompts.forEach(prompt => {
        promptsMap.set(prompt.name, prompt);
        logger.debug(`Definición de prompt de base de datos cargada: ${prompt.name}`);
    });
    logger.info(`Definidos ${promptsMap.size} prompts de base de datos.`);
    return promptsMap;
};
