/**
 * Smithery Entry Point for MCP Firebird
 * 
 * This file provides the entry point for Smithery deployment.
 * Smithery expects a default export function that returns an MCP server instance.
 * 
 * Configuration is passed via query parameters in dot-notation format:
 * Example: ?host=localhost&port=3050&database=/path/to/db.fdb&user=SYSDBA&password=masterkey
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from 'zod';
import { createLogger } from './utils/logger.js';
import { setupDatabaseTools } from './tools/database.js';
import { setupMetadataTools } from './tools/metadata.js';
import { setupSimpleTools } from './tools/simple.js';
import { setupDatabasePrompts } from './prompts/database.js';
import { setupSqlPrompts } from './prompts/sql.js';
import { setupDatabaseResources } from './resources/database.js';
import { initSecurity } from './security/index.js';
import pkg from '../package.json' with { type: 'json' };
import type { ToolDefinition as DbToolDefinition } from './tools/database.js';
import type { ToolDefinition as MetaToolDefinition } from './tools/metadata.js';
import type { ToolDefinition as SimpleToolDefinition } from './tools/simple.js';

const logger = createLogger('smithery-entry');

/**
 * Configuration schema for Smithery
 * This matches the configSchema defined in smithery.yaml
 */
export const configSchema = z.object({
  host: z.string().default('localhost').describe('Hostname or IP address of the Firebird database server'),
  port: z.number().default(3050).describe('Port number for the Firebird database'),
  database: z.string().describe('Absolute path to the Firebird database file'),
  user: z.string().default('SYSDBA').describe('Database username for authentication'),
  password: z.string().default('masterkey').describe('Database password for authentication'),
  useNativeDriver: z.boolean().default(false).describe('Enable native driver for wire encryption support'),
  logLevel: z.string().default('info').describe('Logging verbosity level')
});

export type Config = z.infer<typeof configSchema>;

/**
 * Default export function for Smithery
 * This function is called by Smithery with the user's configuration
 * 
 * @param options - Configuration options from Smithery
 * @returns MCP Server instance
 */
export default function createServer({ config }: { config: Config }) {
  logger.info('Creating MCP Firebird server for Smithery deployment...');
  logger.info(`Configuration: host=${config.host}, port=${config.port}, database=${config.database}`);

  // Set environment variables from config
  process.env.FIREBIRD_HOST = config.host;
  process.env.FIREBIRD_PORT = String(config.port);
  process.env.FIREBIRD_DATABASE = config.database;
  process.env.FIREBIRD_USER = config.user;
  process.env.FIREBIRD_PASSWORD = config.password;
  process.env.USE_NATIVE_DRIVER = String(config.useNativeDriver);
  process.env.LOG_LEVEL = config.logLevel;

  // Create MCP server instance
  const server = new McpServer({
    name: pkg.name,
    version: pkg.version
  });

  logger.info('MCP server instance created');

  // Initialize server asynchronously
  (async () => {
    try {
      // Initialize security module
      logger.info('Initializing security module...');
      await initSecurity();

      // Register tools
      logger.info('Registering tools...');
      
      /**
       * Helper function to register a tool with proper error handling
       */
      const registerTool = (name: string, toolDef: DbToolDefinition | MetaToolDefinition | SimpleToolDefinition) => {
        const schema = toolDef.inputSchema || z.object({});
        server.tool(
          name,
          toolDef.description || name,
          schema,
          async (params) => {
            try {
              const result = await toolDef.handler(params);
              
              // Handle different result types
              if (typeof result === 'object' && result !== null) {
                if ('success' in result && result.success === false) {
                  return {
                    content: [{ type: "text", text: JSON.stringify(result) }],
                    isError: true
                  };
                }
                
                if ('content' in result && Array.isArray(result.content)) {
                  return result;
                }
              }
              
              return {
                content: [{ type: "text", text: JSON.stringify(result) }]
              };
            } catch (error) {
              logger.error(`Error executing tool ${name}:`, error);
              const message = error instanceof Error ? error.message : 'Unknown error';
              return {
                content: [{ type: "text", text: `Error: ${message}` }],
                isError: true
              };
            }
          }
        );
      };

      // Setup database tools
      const dbTools = setupDatabaseTools();
      Object.entries(dbTools).forEach(([name, toolDef]) => {
        registerTool(name, toolDef);
      });

      // Setup metadata tools
      const metaTools = setupMetadataTools();
      Object.entries(metaTools).forEach(([name, toolDef]) => {
        registerTool(name, toolDef);
      });

      // Setup simple tools
      const simpleTools = setupSimpleTools();
      Object.entries(simpleTools).forEach(([name, toolDef]) => {
        registerTool(name, toolDef);
      });

      logger.info('Tools registered successfully');

      // Register prompts
      logger.info('Registering prompts...');
      
      const dbPrompts = setupDatabasePrompts();
      Object.entries(dbPrompts).forEach(([name, promptDef]) => {
        server.prompt(
          name,
          promptDef.description || name,
          promptDef.arguments || [],
          async (params) => {
            try {
              const result = await promptDef.handler(params);
              return result;
            } catch (error) {
              logger.error(`Error executing prompt ${name}:`, error);
              throw error;
            }
          }
        );
      });

      const sqlPrompts = setupSqlPrompts();
      Object.entries(sqlPrompts).forEach(([name, promptDef]) => {
        server.prompt(
          name,
          promptDef.description || name,
          promptDef.arguments || [],
          async (params) => {
            try {
              const result = await promptDef.handler(params);
              return result;
            } catch (error) {
              logger.error(`Error executing prompt ${name}:`, error);
              throw error;
            }
          }
        );
      });

      logger.info('Prompts registered successfully');

      // Register resources
      logger.info('Registering resources...');
      
      const resources = setupDatabaseResources();
      Object.entries(resources).forEach(([uri, resourceDef]) => {
        server.resource(
          uri,
          resourceDef.name,
          resourceDef.description || '',
          resourceDef.mimeType || 'application/json',
          async () => {
            try {
              const result = await resourceDef.handler();
              return result;
            } catch (error) {
              logger.error(`Error reading resource ${uri}:`, error);
              throw error;
            }
          }
        );
      });

      logger.info('Resources registered successfully');
      logger.info('MCP Firebird server ready for Smithery deployment');

    } catch (error) {
      logger.error('Error initializing MCP server:', error);
      throw error;
    }
  })();

  // Return the server instance
  // Smithery will handle the transport layer (Streamable HTTP)
  return server.server;
}

