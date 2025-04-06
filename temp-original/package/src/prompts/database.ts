// Prompts relacionados con la estructura de la base de datos
import { z } from 'zod';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('prompts:database');

/**
 * Configura los prompts relacionados con la estructura de la base de datos para el servidor MCP
 * @param {Object} server - Instancia del servidor MCP
 */
export const setupDatabasePrompts = (server: any) => {
    // Prompt para analizar tabla
    server.prompt(
        "analyze-table",
        "Analiza la estructura y datos de una tabla en Firebird",
        {
            tableName: z.string().min(1).describe("Nombre de la tabla a analizar")
        },
        ({ tableName }: { tableName: string }) => ({
            messages: [{
                role: "user",
                content: {
                    type: "text",
                    text: `Por favor analiza la estructura y los datos de la tabla \`${tableName}\` en la base de datos Firebird. Describe el esquema, los tipos de datos, las restricciones y muestra un resumen de los datos contenidos.`
                }
            }]
        })
    );
};
