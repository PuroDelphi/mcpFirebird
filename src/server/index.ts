// src/server/index.ts
import { z } from 'zod';
import UrlPattern from 'url-pattern';
import { zodToJsonSchema } from 'zod-to-json-schema'; // Import zodToJsonSchema

// --- Global Error Handlers ---
import { createLogger as createRootLogger } from '../utils/logger.js';
const rootLogger = createRootLogger('global-error');

process.on('uncaughtException', (err, origin) => {
    rootLogger.error('----- UNCAUGHT EXCEPTION -----');
    rootLogger.error(`Caught exception: ${err}\n` + `Exception origin: ${origin}`);
    rootLogger.error('Server will exit.');
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    rootLogger.error('----- UNHANDLED REJECTION -----');
    rootLogger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
// ------------------------------------

// --- SDK Imports --- Revert to McpServer, use corrected Schema names ---
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"; // Revert to McpServer
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    // GetCapabilitiesRequestSchema, // Removed, likely implicit
    CallToolRequestSchema,          // Corrected from ExecuteToolRequestSchema
    // GetResourceDescriptorsRequestSchema, // Removed, likely implicit
    ReadResourceRequestSchema,      // Corrected from AccessResourceRequestSchema
    // CallPromptRequestSchema,        // Removed, invalid schema name
    GetPromptRequestSchema,         // Correct
    // GetResourceRequestSchema      // Removed, potentially uses ReadResourceRequestSchema or implicit
    // PromptDescriptorSchema,    // Removed, invalid type
    // ResourceDescriptorSchema  // Removed, invalid type
} from "@modelcontextprotocol/sdk/types.js";

// --- Local Type Imports ---
import { type ToolDefinition as DbToolDefinition } from '../tools/database.js';
import { type ToolDefinition as MetaToolDefinition } from '../tools/metadata.js';
import { type PromptDefinition } from '../prompts/database.js';
import { setupDatabaseResources, type ResourceDefinition } from '../resources/database.js';
import { setupDatabaseTools } from '../tools/database.js';
import { setupMetadataTools } from '../tools/metadata.js';
import { setupDatabasePrompts } from '../prompts/database.js';
import { setupSqlPrompts } from '../prompts/sql.js';
import { createLogger } from '../utils/logger.js';
import { wrapSuccess, wrapError } from '../utils/jsonHelper.js';
import pkg from '../../package.json' with { type: 'json' };

export async function main() {
    const logger = createLogger('server:index');
    logger.info(`Iniciando servidor MCP Firebird - Nombre: ${pkg.name}, Versión: ${pkg.version}`);

    try {
        // 1. Cargar herramientas, prompts y recursos
        logger.info('Cargando definiciones de herramientas, prompts y recursos...');
        const databaseTools = setupDatabaseTools();
        const metadataTools = setupMetadataTools(databaseTools);
        const databasePrompts = setupDatabasePrompts();
        const sqlPrompts = setupSqlPrompts();
        const allResources: Map<string, ResourceDefinition> = setupDatabaseResources();
        const allPrompts = new Map<string, PromptDefinition>([...databasePrompts, ...sqlPrompts]);
        const allTools = new Map<string, DbToolDefinition | MetaToolDefinition>([...databaseTools, ...metadataTools]);
        logger.info(
            `Cargadas: ${allTools.size} herramientas, ${allPrompts.size} prompts, ${allResources.size} recursos.`
        );

        // 2. Define Handlers
        const handleExecuteToolRequest = async (req: z.infer<typeof CallToolRequestSchema>["params"]) => {
            // Add check for toolName to satisfy TypeScript
            if (!req?.toolName || typeof req.toolName !== 'string') { 
                return wrapError('Solicitud ExecuteTool inválida: Falta toolName o no es string');
            }
            const toolName: string = req.toolName; 
            logger.info(`Recibida solicitud ExecuteTool: ${toolName}`);
            const tool = allTools.get(toolName);
            if (!tool) {
                return wrapError(`Herramienta desconocida: ${toolName}`);
            }
            try {
                const result = await tool.handler(req.inputs as any); 
                return wrapSuccess(result);
            } catch (error) {
                logger.error(`Error ejecutando herramienta ${toolName}:`, error);
                const message = error instanceof Error ? error.message : 'Error desconocido';
                return wrapError(`Error ejecutando herramienta ${toolName}: ${message}`);
            }
        };

        const handleAccessResourceRequest = async (req: z.infer<typeof ReadResourceRequestSchema>["params"]) => {
             // Add check for uri
            if (!req?.uri) {
                return wrapError(`Solicitud AccessResource inválida: URI faltante`);
            }
            const uri: string = req.uri; 
            logger.info(`Recibida solicitud AccessResource: ${uri}`);
            let matchedResourceDef: ResourceDefinition | undefined;
            let uriParams: Record<string, string> = {};

            for (const [uriTemplate, definition] of allResources.entries()) {
                const pattern = new UrlPattern(uriTemplate);
                const match = pattern.match(uri);
                if (match) {
                    matchedResourceDef = definition;
                    uriParams = match;
                    break;
                }
            }

            if (!matchedResourceDef) {
                return wrapError(`Recurso desconocido o patrón de URI no coincide: ${uri}`);
            }

            try {
                const result = await matchedResourceDef.handler(uriParams as any); 
                return wrapSuccess(result);
            } catch (error) {
                logger.error(`Error accediendo al recurso ${uri}:`, error);
                const message = error instanceof Error ? error.message : 'Error desconocido';
                return wrapError(`Error accediendo al recurso ${uri}: ${message}`);
            }
        };

        // Removed handleCallPromptRequest as schema is invalid

        const handleGetPromptRequest = async (req: z.infer<typeof GetPromptRequestSchema>["params"]) => {
            // Add check for promptName
             if (!req?.promptName || typeof req.promptName !== 'string') { 
                 return wrapError('Solicitud GetPrompt inválida: Falta promptName o no es string');
             }
             const promptName: string = req.promptName; 
            logger.info(`Recibida solicitud GetPrompt: ${promptName}`);
            const promptDef = allPrompts.get(promptName);
            if (!promptDef) {
                 return wrapError(`Prompt desconocido: ${promptName}`);
            }
            // Return the definition directly (or map to a simplified object if needed)
             // We need zodToJsonSchema if we expose inputSchema
             const responsePayload = {
                 name: promptName,
                 description: promptDef.description,
                 inputSchema: promptDef.inputSchema ? zodToJsonSchema(promptDef.inputSchema) : undefined,
             };
             return wrapSuccess({ prompt: responsePayload });
        };

        // 3. Configurar transporte stdio
        logger.info('Configurando transporte stdio...');
        const transport = new StdioServerTransport(process.stdin, process.stdout);
        logger.info('Transporte stdio configurado.');

        // 4. Create McpServer instance
        logger.info('Creando instancia del servidor MCP...');
        const server = new McpServer({
            name: pkg.name,
            version: pkg.version,
            transport,
            // Adjust capabilities: remove 'call' for prompts
             capabilities: {
                 tools: { list: true, execute: true },
                 prompts: { list: true, get: true }, // Removed call: true
                 resources: { list: true, read: true },
             },
            // Pass handlers (handleCallPromptRequest removed)
            handleExecuteToolRequest,
            handleAccessResourceRequest,
            handleGetPromptRequest,
        });
        logger.info('Instancia del servidor MCP creada y lista.');

        logger.info('Iniciando ejecución del servidor...');
        // Wrap the wait logic in try...catch
        try {
          // The server implicitly starts handling requests via the transport.
          logger.info('Servidor esperando solicitudes...');
          // Keep the process alive indefinitely
          await new Promise(() => { });
        } catch (runError) {
          logger.error('Error durante la ejecución del servidor o al esperar:', runError);
          process.exit(1); // Exit if server run fails
        }
    } catch (error) {
        logger.error('Error fatal durante la inicialización o ejecución del servidor:', error);
        process.exit(1);
    }
}
