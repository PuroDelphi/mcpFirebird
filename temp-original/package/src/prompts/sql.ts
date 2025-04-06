// Prompts relacionados con SQL
import { z } from 'zod';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('prompts:sql');

/**
 * Configura los prompts relacionados con SQL para el servidor MCP
 * @param {Object} server - Instancia del servidor MCP
 */
export const setupSqlPrompts = (server: any) => {
    // Prompt para consultar datos
    server.prompt(
        "query-data",
        "Ejecuta y analiza una consulta SQL en Firebird",
        {
            sql: z.string().min(1).describe("Consulta SQL a ejecutar")
        },
        ({ sql }: { sql: string }) => ({
            messages: [{
                role: "user",
                content: {
                    type: "text",
                    text: `Por favor ejecuta y analiza la siguiente consulta SQL en la base de datos Firebird:\n\n\`\`\`sql\n${sql}\n\`\`\`\n\nExplica los resultados de manera clara y concisa.`
                }
            }]
        })
    );

    // Prompt para optimizar consulta
    server.prompt(
        "optimize-query",
        "Optimiza una consulta SQL para Firebird",
        {
            sql: z.string().min(1).describe("Consulta SQL a optimizar")
        },
        ({ sql }: { sql: string }) => ({
            messages: [{
                role: "user",
                content: {
                    type: "text",
                    text: `Por favor analiza y optimiza la siguiente consulta SQL para Firebird:\n\n\`\`\`sql\n${sql}\n\`\`\`\n\nExplica las mejoras realizadas y por qué podrían mejorar el rendimiento.`
                }
            }]
        })
    );

    // Prompt para generar SQL
    server.prompt(
        "generate-sql",
        "Genera una consulta SQL para Firebird basada en una descripción",
        {
            description: z.string().min(1).describe("Descripción de la consulta que se desea generar")
        },
        ({ description }: { description: string }) => ({
            messages: [{
                role: "user",
                content: {
                    type: "text",
                    text: `Por favor genera una consulta SQL para Firebird basada en la siguiente descripción:\n\n${description}\n\nExplica la consulta generada y cómo funciona.`
                }
            }]
        })
    );
};
