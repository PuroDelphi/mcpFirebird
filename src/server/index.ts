// src/server/index.ts
import { z } from 'zod';
import UrlPattern from 'url-pattern';
import { zodToJsonSchema } from 'zod-to-json-schema';

// --- Global Error Handlers ---
// Nota: Los manejadores globales de errores están definidos en stdout-guard.ts
// para evitar conflictos y asegurar que no se interrumpa la comunicación con el cliente
import { createLogger as createRootLogger } from '../utils/logger.js';
const rootLogger = createRootLogger('global-error');
// ------------------------------------

// --- SDK Imports ---
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { startSseServer } from "./sse.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    ListPromptsRequestSchema,
    GetPromptRequestSchema,
    ListResourcesRequestSchema,
    ReadResourceRequestSchema,
    ListResourceTemplatesRequestSchema,
    ToolSchema
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
import { initSecurity } from '../security/index.js';
import pkg from '../../package.json' with { type: 'json' };

export async function main() {
    const logger = createLogger('server:index');
    logger.info(`Starting MCP Firebird Server - Name: ${pkg.name}, Version: ${pkg.version}`);

    try {
        // 1. Initialize security module
        logger.info('Initializing security module...');
        await initSecurity();

        // 2. Load tools, prompts and resources
        logger.info('Loading tool, prompt and resource definitions...');
        const databaseTools = setupDatabaseTools();
        const metadataTools = setupMetadataTools(databaseTools);
        const databasePrompts = setupDatabasePrompts();
        const sqlPrompts = setupSqlPrompts();
        const allResources: Map<string, ResourceDefinition> = setupDatabaseResources();
        const allPrompts = new Map<string, PromptDefinition>([...databasePrompts, ...sqlPrompts]);
        const allTools = new Map<string, DbToolDefinition | MetaToolDefinition>([...databaseTools, ...metadataTools]);

        // Log loaded prompts
        logger.info('Loaded prompts:');
        allPrompts.forEach((prompt, name) => {
            logger.info(`  - ${name}: ${prompt.description}`);
        });

        logger.info(
            `Loaded: ${allTools.size} tools, ${allPrompts.size} prompts, ${allResources.size} resources.`
        );

        // 2. Create MCP server instance
        logger.info('Creating MCP server instance...');
        const server = new Server(
            {
                name: pkg.name,
                version: pkg.version
            },
            {
                capabilities: {
                    tools: { list: true, execute: true },
                    prompts: { list: true, get: true, call: true },
                    resources: { list: true, read: true },
                    resourceTemplates: { list: true }
                }
            }
        );
        logger.info('MCP server instance created.');

        // 3. Configure request handlers
        logger.info('Configuring request handlers...');

        // Handler for listing tools
        server.setRequestHandler(ListToolsRequestSchema, async () => {
            logger.info('Received ListTools request');
            const tools = Array.from(allTools.entries()).map(([name, tool]) => ({
                name,
                description: tool.description,
                inputSchema: tool.inputSchema ? zodToJsonSchema(tool.inputSchema) : undefined
            }));
            return { tools };
        });

        // Handler for executing tools
        server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            logger.info(`Received CallTool request: ${name}`);

            const tool = allTools.get(name);
            if (!tool) {
                return {
                    content: [{ type: "text", text: `Error: Unknown tool: ${name}` }],
                    isError: true
                };
            }

            try {
                const result = await tool.handler(args);

                // Si el resultado es un objeto con success: false, lo devolvemos como JSON sin secuencias de escape
                if (typeof result === 'object' && result !== null && 'success' in result && result.success === false) {
                    return {
                        content: [{ type: "text", text: JSON.stringify(result) }],
                        isError: true
                    };
                }

                // Para otros resultados, devolvemos como texto plano
                return {
                    content: [{ type: "text", text: JSON.stringify(result) }]
                };
            } catch (error) {
                logger.error(`Error executing tool ${name}:`, error);
                const message = error instanceof Error ? error.message : 'Unknown error';
                return {
                    content: [{ type: "text", text: `Error executing tool ${name}: ${message}` }],
                    isError: true
                };
            }
        });

        // Handler for listing prompts
        server.setRequestHandler(ListPromptsRequestSchema, async () => {
            logger.info('Received ListPrompts request');
            const prompts = Array.from(allPrompts.entries()).map(([name, prompt]) => ({
                name,
                description: prompt.description
            }));
            return { prompts };
        });

        // Handler for getting or executing a prompt
        server.setRequestHandler(GetPromptRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            logger.info(`Received GetPrompt request: ${name}`);

            const promptDef = allPrompts.get(name as string);
            if (!promptDef) {
                throw new Error(`Unknown prompt: ${name}`);
            }

            // If there are no arguments, just return the prompt definition
            if (!args) {
                return {
                    prompt: {
                        name: name,
                        description: promptDef.description,
                        inputSchema: promptDef.inputSchema ? zodToJsonSchema(promptDef.inputSchema) : undefined
                    }
                };
            }

            // If there are arguments, execute the prompt
            try {
                // Execute the prompt handler with the provided arguments
                const result = await promptDef.handler(args);

                // Make sure the result has the correct format
                if (!result || !result.messages || !Array.isArray(result.messages)) {
                    logger.error(`The prompt handler for ${name} did not return a valid format`);
                    throw new Error(`Internal error: invalid response format`);
                }

                return result;
            } catch (error) {
                logger.error(`Error executing prompt ${name}:`, error);
                throw error;
            }
        });

        // Handler for listing resources
        server.setRequestHandler(ListResourcesRequestSchema, async () => {
            logger.info('Received ListResources request');
            const resources = Array.from(allResources.keys()).map(uriTemplate => ({
                uri: uriTemplate,
                name: `Resource: ${uriTemplate}`,
                mimeType: "application/json"
            }));
            return { resources };
        });

        // Handler for reading a specific resource
        server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
            const { uri } = request.params;
            logger.info(`Received ReadResource request: ${uri}`);

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
                throw new Error(`Unknown resource or URI pattern does not match: ${uri}`);
            }

            try {
                const result = await matchedResourceDef.handler(uriParams);

                return {
                    contents: [
                        {
                            uri: request.params.uri,
                            mimeType: "application/json",
                            text: JSON.stringify(result, null, 2)
                        }
                    ]
                };
            } catch (error) {
                logger.error(`Error accessing resource ${uri}:`, error);
                throw error;
            }
        });

        // Handler for listing resource templates
        server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
            logger.info('Received ListResourceTemplates request');
            // For now, return an empty list as we don't have any templates defined
            return { resourceTemplates: [] };
        });

        // 4. Start the server with the appropriate transport
        const transportType = process.env.TRANSPORT_TYPE || 'stdio';
        logger.info(`Configuring ${transportType} transport...`);

        if (transportType === 'sse') {
            // Start SSE server
            const ssePort = parseInt(process.env.SSE_PORT || '3003', 10);
            logger.info(`Starting SSE server on port ${ssePort}...`);

            const { cleanup } = await startSseServer(server, ssePort);

            // Handle cleanup on process exit
            process.on('SIGINT', async () => {
                logger.info('Received SIGINT signal, cleaning up...');
                await cleanup();
                process.exit(0);
            });

            process.on('SIGTERM', async () => {
                logger.info('Received SIGTERM signal, cleaning up...');
                await cleanup();
                process.exit(0);
            });

            logger.info('MCP Firebird server with SSE transport ready to receive requests.');
            logger.info(`SSE server listening on port ${ssePort}...`);

            // Keep the process alive indefinitely
            await new Promise(() => {});
        } else {
            // Default to stdio transport
            logger.info('Configuring stdio transport...');
            const transport = new StdioServerTransport();
            logger.info('Connecting server to transport...');

            await server.connect(transport);

            logger.info('MCP Firebird server with stdio transport connected and ready to receive requests.');
            logger.info(`Server waiting for requests...`);

            // Keep the process alive indefinitely
            await new Promise(() => {});
        }

    } catch (error) {
        logger.error('Fatal error during server initialization or execution:', error);
        process.exit(1);
    }
}
