// Prompts relacionados con SQL
import { z, ZodType } from 'zod';
import { createLogger } from '../utils/logger.js';
// Import the unified PromptDefinition
import { PromptDefinition } from './database.js';

const logger = createLogger('prompts:sql');

// --- Definiciones de Prompts --- //

const queryDataPrompt: PromptDefinition = {
    name: "query-data",
    description: "Ejecuta y analiza una consulta SQL en Firebird",
    inputSchema: z.object({
        sql: z.string().min(1).describe("Consulta SQL a ejecutar")
    }),
    handler: async ({ sql }: { sql: string }) => ({
        messages: [{
            role: "user",
            content: {
                type: "text",
                text: `Por favor ejecuta y analiza la siguiente consulta SQL en la base de datos Firebird:\n\n\`\`\`sql\n${sql}\n\`\`\`\n\nExplica los resultados de manera clara y concisa.`
            }
        }]
    })
};

const optimizeQueryPrompt: PromptDefinition = {
    name: "optimize-query",
    description: "Optimiza una consulta SQL para Firebird",
    inputSchema: z.object({
        sql: z.string().min(1).describe("Consulta SQL a optimizar")
    }),
    handler: async ({ sql }: { sql: string }) => ({
        messages: [{
            role: "user",
            content: {
                type: "text",
                text: `Por favor analiza y optimiza la siguiente consulta SQL para Firebird:\n\n\`\`\`sql\n${sql}\n\`\`\`\n\nExplica las mejoras realizadas y por qué podrían mejorar el rendimiento.`
            }
        }]
    })
};

const generateSqlPrompt: PromptDefinition = {
    name: "generate-sql",
    description: "Genera una consulta SQL para Firebird basada en una descripción",
    inputSchema: z.object({
        description: z.string().min(1).describe("Descripción de la consulta que se desea generar")
    }),
    handler: async ({ description }: { description: string }) => ({
        messages: [{
            role: "user",
            content: {
                type: "text",
                text: `Por favor genera una consulta SQL para Firebird basada en la siguiente descripción:\n\n${description}\n\nExplica la consulta generada y cómo funciona.`
            }
        }]
    })
};

// Array con todas las definiciones de prompts SQL
const sqlPrompts: PromptDefinition[] = [
    queryDataPrompt,
    optimizeQueryPrompt,
    generateSqlPrompt
];

// --- Función de Configuración --- //

/**
 * Configura los prompts relacionados con SQL para el servidor MCP
 * y devuelve un mapa con sus definiciones.
 * @returns {Map<string, PromptDefinition>} Mapa con las definiciones de prompts.
 */
export const setupSqlPrompts = (): Map<string, PromptDefinition> => {
    const promptsMap = new Map<string, PromptDefinition>();
    sqlPrompts.forEach(prompt => {
        promptsMap.set(prompt.name, prompt);
        logger.debug(`Definición de prompt SQL cargada: ${prompt.name}`);
    });
    logger.info(`Definidos ${promptsMap.size} prompts SQL.`);
    return promptsMap;
};
