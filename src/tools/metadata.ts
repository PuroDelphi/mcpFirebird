// Herramientas para metadatos e información del sistema
import { createLogger } from '../utils/logger.js';
import { formatForClaude } from '../utils/jsonHelper.js';
import { z, ZodTypeAny } from 'zod';

// Definición local de ToolDefinition basada en el uso
export interface ToolDefinition {
    name?: string;
    title?: string;
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
export function setupMetadataTools(databaseTools: Map<string, any>): Map<string, ToolDefinition> {
    const tools = new Map<string, ToolDefinition>();

    // Herramienta para obtener información del servidor
    tools.set('get-server-info', {
        title: 'Get Server Information',
        description: 'Obtiene información sobre el servidor MCP Firebird y las herramientas disponibles',
        inputSchema: z.object({}),
        handler: async () => {
            try {
                const serverInfo = {
                    name: 'MCP Firebird Server',
                    version: process.env.npm_package_version || '2.2.0-alpha.1',
                    description: 'Servidor MCP para bases de datos Firebird',
                    capabilities: {
                        tools: Array.from(databaseTools.keys()),
                        totalTools: databaseTools.size,
                        features: [
                            'SQL query execution',
                            'Database schema inspection',
                            'Performance analysis',
                            'Backup and restore',
                            'Database validation'
                        ]
                    },
                    runtime: {
                        nodeVersion: process.version,
                        platform: process.platform,
                        uptime: process.uptime(),
                        memoryUsage: process.memoryUsage()
                    }
                };

                return {
                    content: [{
                        type: 'text',
                        text: `Información del servidor MCP Firebird:\n\n${formatForClaude(serverInfo)}`
                    }]
                };
            } catch (error) {
                logger.error('Error getting server info:', { error });
                return {
                    content: [{
                        type: 'text',
                        text: `Error obteniendo información del servidor: ${error instanceof Error ? error.message : String(error)}`
                    }],
                    isError: true
                };
            }
        }
    });

    // Herramienta para listar todas las herramientas disponibles
    tools.set('list-available-tools', {
        title: 'List Available Tools',
        description: 'Lista todas las herramientas disponibles en el servidor MCP',
        inputSchema: z.object({
            category: z.string().optional().describe('Filtrar por categoría (database, metadata)')
        }),
        handler: async (args: { category?: string }) => {
            try {
                const allTools = new Map([...databaseTools, ...tools]);
                let toolsList = Array.from(allTools.entries());

                if (args.category) {
                    if (args.category === 'database') {
                        toolsList = Array.from(databaseTools.entries());
                    } else if (args.category === 'metadata') {
                        toolsList = Array.from(tools.entries());
                    }
                }

                const toolsInfo = toolsList.map(([name, tool]) => ({
                    name,
                    title: tool.title || name,
                    description: tool.description,
                    category: databaseTools.has(name) ? 'database' : 'metadata'
                }));

                return {
                    content: [{
                        type: 'text',
                        text: `Herramientas disponibles${args.category ? ` (categoría: ${args.category})` : ''}:\n\n${formatForClaude(toolsInfo)}`
                    }]
                };
            } catch (error) {
                logger.error('Error listing tools:', { error });
                return {
                    content: [{
                        type: 'text',
                        text: `Error listando herramientas: ${error instanceof Error ? error.message : String(error)}`
                    }],
                    isError: true
                };
            }
        }
    });

    // Herramienta para obtener ayuda sobre una herramienta específica
    tools.set('get-tool-help', {
        title: 'Get Tool Help',
        description: 'Obtiene información detallada sobre una herramienta específica',
        inputSchema: z.object({
            toolName: z.string().describe('Nombre de la herramienta sobre la que obtener ayuda')
        }),
        handler: async (args: { toolName: string }) => {
            try {
                const allTools = new Map([...databaseTools, ...tools]);
                const tool = allTools.get(args.toolName);

                if (!tool) {
                    return {
                        content: [{
                            type: 'text',
                            text: `Herramienta '${args.toolName}' no encontrada. Use 'list-available-tools' para ver las herramientas disponibles.`
                        }],
                        isError: true
                    };
                }

                const helpInfo = {
                    name: args.toolName,
                    title: tool.title || args.toolName,
                    description: tool.description,
                    category: databaseTools.has(args.toolName) ? 'database' : 'metadata',
                    inputSchema: tool.inputSchema ? 'Disponible' : 'No definido',
                    usage: `Para usar esta herramienta, llame a '${args.toolName}' con los parámetros apropiados.`
                };

                return {
                    content: [{
                        type: 'text',
                        text: `Ayuda para la herramienta: ${args.toolName}\n\n${formatForClaude(helpInfo)}`
                    }]
                };
            } catch (error) {
                logger.error('Error getting tool help:', { error });
                return {
                    content: [{
                        type: 'text',
                        text: `Error obteniendo ayuda: ${error instanceof Error ? error.message : String(error)}`
                    }],
                    isError: true
                };
            }
        }
    });

    // Herramienta para verificar el estado del sistema
    tools.set('system-health-check', {
        title: 'System Health Check',
        description: 'Verifica el estado de salud del sistema y la conectividad de la base de datos',
        inputSchema: z.object({}),
        handler: async () => {
            try {
                const healthInfo = {
                    status: 'healthy',
                    timestamp: new Date().toISOString(),
                    uptime: process.uptime(),
                    memory: {
                        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
                        external: Math.round(process.memoryUsage().external / 1024 / 1024)
                    },
                    environment: {
                        nodeVersion: process.version,
                        platform: process.platform,
                        arch: process.arch
                    },
                    tools: {
                        database: databaseTools.size,
                        metadata: tools.size,
                        total: databaseTools.size + tools.size
                    }
                };

                return {
                    content: [{
                        type: 'text',
                        text: `Estado de salud del sistema:\n\n${formatForClaude(healthInfo)}`
                    }]
                };
            } catch (error) {
                logger.error('Error in health check:', { error });
                return {
                    content: [{
                        type: 'text',
                        text: `Error en verificación de salud: ${error instanceof Error ? error.message : String(error)}`
                    }],
                    isError: true
                };
            }
        }
    });

    logger.info(`Configured ${tools.size} metadata tools`);
    return tools;
}
