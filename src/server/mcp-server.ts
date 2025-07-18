/**
 * MCP Firebird Server Implementation using McpServer
 * This is a modern implementation using the McpServer class from the SDK
 * following the latest recommendations from the Model Context Protocol
 */

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createLogger } from '../utils/logger.js';
import { setupDatabaseTools } from '../tools/database.js';
import { setupMetadataTools } from '../tools/metadata.js';
import { setupSimpleTools } from '../tools/simple.js';
import { setupDatabasePrompts } from '../prompts/database.js';
import { setupSqlPrompts } from '../prompts/sql.js';
import { setupDatabaseResources, type ResourceDefinition } from '../resources/database.js';
import { initSecurity } from '../security/index.js';
import { ConfigError, ErrorTypes, MCPError } from '../utils/errors.js';
import { createSseRouter } from "./sse.js";
import pkg from '../../package.json' with { type: 'json' };
import { z } from 'zod';
import { type ToolDefinition as DbToolDefinition } from '../tools/database.js';
import { type ToolDefinition as MetaToolDefinition } from '../tools/metadata.js';
import { type ToolDefinition as SimpleToolDefinition } from '../tools/simple.js';

const logger = createLogger('server:mcp-server');

/**
 * Main function to start the MCP Firebird server using McpServer
 * @returns A promise that resolves when the server is started
 */
export async function startMcpServer() {
    logger.info(`Starting MCP Firebird Server - Name: ${pkg.name}, Version: ${pkg.version}`);

    try {
        // 1. Initialize security module
        logger.info('Initializing security module...');
        await initSecurity();

        // 2. Create MCP server instance with capabilities
        logger.info('Creating MCP server instance...');
        const server = new McpServer({
            name: pkg.name,
            version: pkg.version
        });
        logger.info('MCP server instance created with capabilities.');

        // 3. Register tools, prompts and resources
        logger.info('Registering tools, prompts and resources...');

        /**
         * Helper function to register a tool with proper error handling
         * @param name - Tool name
         * @param toolDef - Tool definition
         */
        const registerTool = (name: string, toolDef: DbToolDefinition | MetaToolDefinition | SimpleToolDefinition) => {
            const schema = toolDef.inputSchema || z.object({});
            server.tool(
                name,
                name, // Use name as description
                async (extra) => {
                    try {
                        // Get parameters from the request context
                        const params = {};

                        // Call the handler with the parameters
                        const result = await toolDef.handler(params);

                        // Handle different result types
                        if (typeof result === 'object' && result !== null) {
                            // If the result has a 'success' property set to false, it's an error
                            if ('success' in result && result.success === false) {
                                return {
                                    content: [{ type: "text", text: JSON.stringify(result) }],
                                    isError: true
                                };
                            }

                            // If the result already has a 'content' property with the correct format, return it directly
                            if ('content' in result && Array.isArray(result.content)) {
                                return result;
                            }
                        }

                        // Otherwise, wrap the result in a standard format
                        return {
                            content: [{ type: "text", text: JSON.stringify(result) }]
                        };
                    } catch (error) {
                        // Log the error
                        logger.error(`Error executing tool ${name}: ${error instanceof Error ? error.message : String(error)}`, {
                            error,
                            stack: error instanceof Error ? error.stack : undefined
                        });

                        // Return a formatted error message
                        const message = error instanceof Error ? error.message : 'Unknown error';
                        return {
                            content: [{ type: "text", text: `Error executing tool ${name}: ${message}` }],
                            isError: true
                        };
                    }
                }
            );
            logger.info(`Registered tool: ${name}`);
        };

        // Register all tools
        logger.info('Registering tools...');
        const databaseTools = setupDatabaseTools();
        const metadataTools = setupMetadataTools(databaseTools);
        const simpleTools = setupSimpleTools();

        // Register all tools using the helper function
        for (const [name, toolDef] of databaseTools.entries()) {
            registerTool(name, toolDef);
        }

        for (const [name, toolDef] of metadataTools.entries()) {
            registerTool(name, toolDef);
        }

        for (const [name, toolDef] of simpleTools.entries()) {
            registerTool(name, toolDef);
        }

        logger.info(`Registered ${databaseTools.size + metadataTools.size + simpleTools.size} tools in total.`);

        /**
         * Helper function to register a prompt with proper error handling
         * @param name - Prompt name
         * @param promptDef - Prompt definition
         */
        const registerPrompt = (name: string, promptDef: any) => {
            const schema = promptDef.inputSchema || z.object({});
            server.prompt(
                name,
                name, // Use name as description
                async (extra) => {
                    try {
                        // Get parameters from the request context
                        const params = {};

                        // Call the handler with the parameters
                        const result = await promptDef.handler(params);
                        return result;
                    } catch (error) {
                        // Log the error with detailed information
                        logger.error(`Error executing prompt ${name}: ${error instanceof Error ? error.message : String(error)}`, {
                            error,
                            stack: error instanceof Error ? error.stack : undefined
                        });

                        // Rethrow the error to be handled by the MCP framework
                        throw error;
                    }
                }
            );
            logger.info(`Registered prompt: ${name}`);
        };

        // Register all prompts
        logger.info('Registering prompts...');
        const databasePrompts = setupDatabasePrompts();
        const sqlPrompts = setupSqlPrompts();

        // Register all prompts using the helper function
        for (const [name, promptDef] of databasePrompts.entries()) {
            registerPrompt(name, promptDef);
        }

        for (const [name, promptDef] of sqlPrompts.entries()) {
            registerPrompt(name, promptDef);
        }

        logger.info(`Registered ${databasePrompts.size + sqlPrompts.size} prompts in total.`);

        /**
         * Helper function to register a resource with proper error handling
         * @param uriTemplate - URI template for the resource
         * @param resourceDef - Resource definition
         */
        const registerResource = (uriTemplate: string, resourceDef: ResourceDefinition) => {
            // Simple resource registration using the resource handler interface
            server.resource(
                `resource-${uriTemplate}`, // Resource name
                uriTemplate, // URI pattern
                async (extra) => {
                    try {
                        // Call the handler with empty parameters
                        const result = await resourceDef.handler({});

                        // Return the result in the expected format
                        return {
                            contents: [{
                                uri: uriTemplate,
                                mimeType: "application/json",
                                text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
                            }]
                        };
                    } catch (error) {
                        // Log the error with detailed information
                        logger.error(`Error accessing resource ${uriTemplate}: ${error instanceof Error ? error.message : String(error)}`, {
                            error,
                            stack: error instanceof Error ? error.stack : undefined
                        });

                        // Rethrow the error to be handled by the MCP framework
                        throw error;
                    }
                }
            );
            logger.info(`Registered resource: ${uriTemplate}`);
        };

        // Register all resources
        logger.info('Registering resources...');
        const databaseResources = setupDatabaseResources();

        // Register all resources using the helper function
        for (const [uriTemplate, resourceDef] of databaseResources.entries()) {
            registerResource(uriTemplate, resourceDef);
        }

        logger.info(`Registered ${databaseResources.size} resources in total.`);

        // Setup cleanup stub and signal handler registration
        const cleanup = async () => {};
        function setupSignalHandlers(cleanupFn: () => Promise<void>) {
            process.on('SIGINT', async () => {
                logger.info('Received SIGINT signal, cleaning up...');
                await cleanupFn();
                process.exit(0);
            });
            process.on('SIGTERM', async () => {
                logger.info('Received SIGTERM signal, cleaning up...');
                await cleanupFn();
                process.exit(0);
            });
        }
        // Start the server with the appropriate transport
        const transportType = process.env.TRANSPORT_TYPE?.toLowerCase() || 'stdio';
        logger.info(`Configuring ${transportType} transport...`);

        if (transportType === 'sse') {
            // Start SSE server
            const ssePort = parseInt(process.env.SSE_PORT || '3003', 10);
            if (isNaN(ssePort)) {
                throw new ConfigError(`Invalid SSE port: ${process.env.SSE_PORT}`);
            }
            logger.info(`Starting SSE server on port ${ssePort}...`);
            setupSignalHandlers(cleanup ?? (async () => {}));
            logger.info('MCP Firebird server with SSE transport ready to receive requests.');
            logger.info(`SSE server listening on port ${ssePort}...`);
            // Keep the process alive indefinitely
            await new Promise<void>(() => {});
        } else if (transportType === 'stdio') {
            // Use stdio transport
            logger.info('Configuring stdio transport...');
            const transport = new StdioServerTransport();
            logger.info('Connecting server to transport...');
            // Connect the server to the transport
            await server.connect(transport);
            // Setup cleanup function for SIGINT (Ctrl+C)
            process.on('SIGINT', async () => {
                logger.info('Received SIGINT signal, cleaning up...');
                logger.info('Closing stdio transport...');
                await server.close();
                logger.info('Server closed successfully');
                process.exit(0);
            });
            // Setup cleanup function for SIGTERM
            process.on('SIGTERM', async () => {
                logger.info('Received SIGTERM signal, cleaning up...');
                logger.info('Closing stdio transport...');
                await server.close();
                logger.info('Server closed successfully');
                process.exit(0);
            });
            logger.info('MCP Firebird server with stdio transport connected and ready to receive requests.');
            logger.info('Server waiting for requests...');
        } else {
            throw new ConfigError(
                `Unsupported transport type: ${transportType}. Supported types are 'stdio' and 'sse'.`,
                undefined,
                { transportType }
            );
        }
    } catch (error) {
        if (error instanceof ConfigError) {
            logger.error(`Fatal error during server initialization: ${error.message}`, {
                name: error.name,
                stack: error.stack
            });
        } else if (error instanceof Error) {
            logger.error(`Fatal error during server initialization: ${error.message}`, {
                name: error.name,
                stack: error.stack
            });
        } else {
            logger.error(`Fatal error during server initialization: ${String(error)}`);
        }

        // No need to send a final log notification, as we're already logging the error

        // Exit with error code
        process.exit(1);
    }
}
