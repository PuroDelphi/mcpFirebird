// Herramientas para metadatos e información del sistema
import { createLogger } from '../utils/logger.js';
import { stringifyCompact } from '../utils/jsonHelper.js';
import { z, ZodTypeAny } from 'zod';

// Definición local de ToolDefinition basada en el uso
export interface ToolDefinition {
    inputSchema: ZodTypeAny;
    description: string;
    handler: (...args: any[]) => Promise<any>; // Ajustar según sea necesario
}

const logger = createLogger('tools:metadata');

/**
 * Configura las herramientas de metadatos, tomando las herramientas de base de datos como entrada.
 * @param databaseTools - Mapa de herramientas de base de datos ya configuradas.
 * @returns Map<string, ToolDefinition> - Mapa con las herramientas de metadatos.
 */
export const setupMetadataTools = (
    databaseTools: Map<string, ToolDefinition>
): Map<string, ToolDefinition> => {

    const metadataTools = new Map<string, ToolDefinition>();

    // Combinar todas las herramientas para que las herramientas de metadatos puedan describirlas
    const allTools = new Map([...databaseTools, ...metadataTools]);

    // --- get-methods ---
    // !! Esta definición debe ocurrir *después* de inicializar allTools !!
    metadataTools.set("get-methods", {
        inputSchema: z.object({}), // No args
        description: "Returns a description of all available MCP tools (methods)",
        handler: async () => {
            logger.info("Obteniendo descripción de herramientas disponibles");

            try {
                // Crear descripciones dinámicamente desde allTools
                const toolDescriptions = Array.from(allTools.values()).map(toolDef => {
                    // Extraer parámetros de Zod schema si existe
                    let parameters: any[] = [];
                    if (toolDef.inputSchema && toolDef.inputSchema instanceof z.ZodObject) {
                        parameters = Object.entries(toolDef.inputSchema.shape).map(([name, zodType]) => ({
                            name,
                            // Intentar obtener una descripción o tipo básico de Zod
                            type: ((zodType as z.ZodTypeAny)._def as any)?.typeName?.replace('Zod', '').toLowerCase() || 'unknown',
                            description: (zodType as z.ZodTypeAny).description || 'No description provided'
                        }));
                    }

                    return {
                        name: Array.from(allTools.entries()).find(([_, def]) => def === toolDef)?.[0] || 'unknown-tool',
                        description: toolDef.description,
                        parameters: parameters,
                        // Nota: No tenemos una forma estándar de describir el tipo de retorno aquí
                        // Podríamos añadir una propiedad `returnsDescription` a ToolDefinition si fuera necesario
                        returns: "See tool documentation for return details."
                    };
                });

                return {
                    content: [{
                        type: 'json',
                        text: stringifyCompact({ success: true, tools: toolDescriptions })
                    }]
                };
            } catch (error: any) {
                logger.error(`Error en get-methods: ${error.message}`);
                return {
                    content: [{
                        type: 'json',
                        text: stringifyCompact({ success: false, error: 'Error al obtener la lista de herramientas.', message: error.message })
                    }]
                };
            }
        }
    });

    // --- describe-method ---
    // !! Esta definición debe ocurrir *después* de inicializar allTools !!
    const DescribeMethodArgsSchema = z.object({
        name: z.string().describe("The name of the tool (method) to describe")
    });
    metadataTools.set("describe-method", {
        inputSchema: DescribeMethodArgsSchema,
        description: "Returns a description of a specific MCP tool (method)",
        handler: async (args: z.infer<typeof DescribeMethodArgsSchema>) => {
            const { name: toolName } = args;
            logger.info(`Llamada a describe-method para ${toolName}`);

            try {
                // Buscar la herramienta en el mapa combinado
                const toolDef = allTools.get(toolName);

                if (!toolDef) {
                    return {
                        content: [{
                            type: 'json',
                            text: stringifyCompact({ 
                                success: false, 
                                error: `Herramienta (método) '${toolName}' no encontrada.` 
                            })
                        }]
                    };
                }

                // Extraer parámetros de Zod schema si existe
                let parameters: any[] = [];
                if (toolDef.inputSchema && toolDef.inputSchema instanceof z.ZodObject) {
                    parameters = Object.entries(toolDef.inputSchema.shape).map(([name, zodType]) => ({
                        name,
                        type: ((zodType as z.ZodTypeAny)._def as any)?.typeName?.replace('Zod', '').toLowerCase() || 'unknown',
                        description: (zodType as z.ZodTypeAny).description || 'No description provided'
                    }));
                }

                // Construir la descripción de la herramienta
                const toolDescription = {
                    name: toolName,
                    description: toolDef.description,
                    parameters: parameters,
                    returns: "See tool documentation for return details."
                };

                return {
                    content: [{
                        type: 'json',
                        // Usar la clave 'tool' consistentemente
                        text: stringifyCompact({ success: true, tool: toolDescription })
                    }]
                };

            } catch (error: any) {
                logger.error(`Error en describe-method: ${error.message}`);
                return {
                    content: [{
                        type: 'json',
                        text: stringifyCompact({ 
                            success: false, 
                            error: 'Error al obtener la descripción de la herramienta (método).', 
                            message: error.message 
                        })
                    }]
                };
            }
        }
    });

    // --- ping ---
    metadataTools.set("ping", {
        inputSchema: z.object({}), // No args
        description: "Tests connectivity to the Firebird MCP server",
        handler: async () => {
            logger.info("Ping recibido");
            return {
                content: [{
                    type: 'json',
                    text: stringifyCompact({ 
                        success: true, 
                        message: "Firebird MCP server is online",
                        timestamp: new Date().toISOString()
                    })
                }]
            };
        }
    });

    // IMPORTANTE: Actualizar allTools DESPUÉS de añadir las herramientas de metadatos
    // para que las herramientas de metadatos se incluyan a sí mismas en la lista.
    allTools.set("get-methods", metadataTools.get("get-methods")!); // Añadir get-methods a la lista
    allTools.set("describe-method", metadataTools.get("describe-method")!); // Añadir describe-method
    allTools.set("ping", metadataTools.get("ping")!); // Añadir ping

    logger.info(`Herramientas de metadatos configuradas: ${Array.from(metadataTools.keys()).join(', ')}`);
    logger.info(`Total de herramientas disponibles: ${Array.from(allTools.keys()).join(', ')}`);

    // Devolver solo las herramientas definidas en este módulo
    return metadataTools;
};
