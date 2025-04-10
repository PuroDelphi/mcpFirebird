/**
 * MCP Firebird Server Creation
 * This module provides a function to create and configure the MCP server
 */

import { z } from 'zod';
import UrlPattern from 'url-pattern';
import { zodToJsonSchema } from 'zod-to-json-schema';

// --- SDK Imports ---
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
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

// --- Local Imports ---
import { createLogger } from '../utils/logger.js';
import { MCPError } from '../utils/errors.js';
import { type ToolDefinition as DbToolDefinition } from '../tools/database.js';
import { type ToolDefinition as MetaToolDefinition } from '../tools/metadata.js';
import { type PromptDefinition } from '../prompts/types.js';
import { setupDatabaseResources, type ResourceDefinition } from '../resources/database.js';
import { setupDatabaseTools } from '../tools/database.js';
import { setupMetadataTools } from '../tools/metadata.js';
import { setupSimpleTools } from '../tools/simple.js';
import { setupDatabasePrompts } from '../prompts/database.js';
import { setupSqlPrompts } from '../prompts/sql.js';
import { initSecurity } from '../security/index.js';
import pkg from '../../package.json' with { type: 'json' };

const logger = createLogger('server:create');

/**
 * Create and configure the MCP Firebird server
 * @returns A promise that resolves with the server instance
 */
export async function createServer() {
    logger.info(`Creating MCP Firebird Server - Name: ${pkg.name}, Version: ${pkg.version}`);

    try {
        // 1. Initialize security module
        logger.info('Initializing security module...');
        await initSecurity();

        // 2. Load tools, prompts and resources
        logger.info('Loading tool, prompt and resource definitions...');
        const databaseTools = setupDatabaseTools();
        const metadataTools = setupMetadataTools(databaseTools);
        const simpleTools = setupSimpleTools();
        const databasePrompts = setupDatabasePrompts();
        const sqlPrompts = setupSqlPrompts();
        const allResources: Map<string, ResourceDefinition> = setupDatabaseResources();
        const allPrompts = new Map<string, PromptDefinition>([...databasePrompts, ...sqlPrompts]);
        const allTools = new Map<string, DbToolDefinition | MetaToolDefinition | any>([...databaseTools, ...metadataTools, ...simpleTools]);

        // Log loaded prompts
        logger.info('Loaded prompts:');
        allPrompts.forEach((prompt, name) => {
            logger.info(`  - ${name}: ${prompt.description}`);
        });

        logger.info(
            `Loaded: ${allTools.size} tools, ${allPrompts.size} prompts, ${allResources.size} resources.`
        );

        // 3. Create MCP server instance
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

        // 4. Register handlers

        // Handler for listing tools
        server.setRequestHandler(ListToolsRequestSchema, async () => {
            logger.info('Received ListTools request');
            const tools = Array.from(allTools.entries()).map(([name, tool]) => ({
                name,
                description: tool.description,
                inputSchema: zodToJsonSchema(tool.inputSchema)
            }));
            return { tools };
        });

        // Handler for calling tools
        server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            logger.info(`Received CallTool request: ${name}`);

            const tool = allTools.get(name);
            if (!tool) {
                throw new Error(`Unknown tool: ${name}`);
            }

            try {
                // Parse and validate the arguments
                const validatedArgs = tool.inputSchema.parse(args);

                // Call the tool handler
                const result = await tool.handler(validatedArgs);

                // Return the result directly
                return result;
            } catch (error) {
                logger.error(`Error executing tool ${name}: ${error instanceof Error ? error.message : String(error)}`, { error });
                throw error;
            }
        });

        // Handler for listing prompts
        server.setRequestHandler(ListPromptsRequestSchema, async () => {
            logger.info('Received ListPrompts request');
            const prompts = Array.from(allPrompts.entries()).map(([name, prompt]) => ({
                name,
                description: prompt.description,
                inputSchema: zodToJsonSchema(prompt.inputSchema)
            }));
            return { prompts };
        });

        // Handler for getting a specific prompt
        server.setRequestHandler(GetPromptRequestSchema, async (request) => {
            const { name } = request.params;
            logger.info(`Received GetPrompt request: ${name}`);

            const prompt = allPrompts.get(name);
            if (!prompt) {
                throw new Error(`Unknown prompt: ${name}`);
            }

            return {
                name,
                description: prompt.description,
                inputSchema: zodToJsonSchema(prompt.inputSchema)
            };
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
                logger.error(`Error accessing resource ${uri}: ${error instanceof Error ? error.message : String(error)}`, { error });
                throw error;
            }
        });

        // Handler for listing resource templates
        server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
            logger.info('Received ListResourceTemplates request');
            // For now, return an empty list as we don't have any templates defined
            return { resourceTemplates: [] };
        });

        // Return the server instance
        return { server };
    } catch (error) {
        if (error instanceof MCPError) {
            logger.error(`Error creating server: ${error.message}`, {
                type: error.type,
                context: error.context,
                originalError: error.originalError
            });
        } else if (error instanceof Error) {
            logger.error(`Error creating server: ${error.message}`, {
                stack: error.stack
            });
        } else {
            logger.error(`Error creating server: ${String(error)}`);
        }

        throw error;
    }
}
