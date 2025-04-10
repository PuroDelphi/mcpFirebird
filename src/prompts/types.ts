// src/prompts/types.ts
import { z } from 'zod';

/**
 * Interfaz unificada para definir un Prompt MCP.
 */
export interface PromptDefinition {
    name: string;
    description: string;
    category?: string; // Categoría opcional para agrupar prompts
    inputSchema: z.ZodTypeAny;
    // El handler SIEMPRE debe devolver la estructura { messages: [...] }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler: (args: any) => Promise<{ messages: { role: string; content: any }[] }>;
}

/**
 * Función auxiliar para crear un mensaje de texto del asistente
 * @param text Texto del mensaje
 * @returns Estructura de mensaje compatible con MCP
 */
export const createAssistantTextMessage = (text: string) => ({
    messages: [{ role: "assistant", content: { type: "text", text } }]
});

/**
 * Función auxiliar para crear un mensaje de error del asistente
 * @param error Error a formatear
 * @param context Contexto adicional del error
 * @returns Estructura de mensaje compatible con MCP
 */
export const createErrorMessage = (error: unknown, context: string) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return createAssistantTextMessage(`Error ${context}: ${errorMessage}`);
};
