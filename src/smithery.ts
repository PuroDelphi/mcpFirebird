/**
 * Smithery entry point for MCP Firebird
 * This file exports a function that creates and configures the MCP server
 * for deployment on Smithery platform
 */

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { setupDatabaseTools } from './tools/database.js';
import { setupMetadataTools } from './tools/metadata.js';
import { setupDatabasePrompts } from './prompts/database.js';
import { setupSqlPrompts } from './prompts/sql.js';
import { createLogger } from './utils/logger.js';
import pkg from '../package.json' with { type: 'json' };

const logger = createLogger('smithery');

// Configuration schema for Smithery
export const configSchema = z.object({
  host: z.string().default('localhost').describe('Hostname or IP address of the Firebird database server'),
  port: z.number().default(3050).describe('Port number for the Firebird database'),
  database: z.string().describe('Absolute path to the Firebird database file'),
  user: z.string().default('SYSDBA').describe('Database username for authentication'),
  password: z.string().default('masterkey').describe('Database password for authentication'),
  useNativeDriver: z.boolean().default(false).describe('Enable native driver for wire encryption support'),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info').describe('Logging verbosity level')
});

export type Config = z.infer<typeof configSchema>;

/**
 * Main entry point for Smithery deployment
 * This function is called by Smithery CLI to create the MCP server instance
 */
export default function ({ config }: { config: Config }) {
  logger.info('Initializing MCP Firebird server for Smithery', { config: { ...config, password: '[REDACTED]' } });

  // Set environment variables from config
  process.env.FIREBIRD_HOST = config.host;
  process.env.FIREBIRD_PORT = String(config.port);
  process.env.FIREBIRD_DATABASE = config.database;
  process.env.FIREBIRD_USER = config.user;
  process.env.FIREBIRD_PASSWORD = config.password;
  process.env.USE_NATIVE_DRIVER = String(config.useNativeDriver);
  process.env.LOG_LEVEL = config.logLevel;

  // Load tools and prompts
  const databaseTools = setupDatabaseTools();
  const metadataTools = setupMetadataTools(databaseTools);
  const databasePrompts = setupDatabasePrompts();
  const sqlPrompts = setupSqlPrompts();
  
  const allPrompts = new Map([...databasePrompts, ...sqlPrompts]);
  const allTools = new Map([...databaseTools, ...metadataTools]);

  // Create MCP server instance
  const server = new McpServer({
    name: pkg.name,
    version: pkg.version
  });

  // Register tools
  for (const [name, tool] of allTools.entries()) {
    server.registerTool(
      name,
      {
        title: tool.title || name,
        description: tool.description,
        inputSchema: (tool.inputSchema && tool.inputSchema instanceof z.ZodObject) ? tool.inputSchema.shape : {}
      },
      async (args: any): Promise<{ content: any[], isError?: boolean }> => {
        try {
          const result = await tool.handler(args);
          if (typeof result === 'object' && result !== null && 'content' in result) {
            return result;
          }
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        } catch (error) {
          logger.error(`Error executing tool ${name}: ${error instanceof Error ? error.message : String(error)}`, { error });
          const message = error instanceof Error ? error.message : 'Unknown error';
          return {
            content: [{ type: "text", text: `Error executing tool ${name}: ${message}` }],
            isError: true
          };
        }
      }
    );
  }

  // Register prompts
  for (const [name, promptDef] of allPrompts.entries()) {
    server.registerPrompt(
      name,
      {
        title: promptDef.title || name,
        description: promptDef.description,
        argsSchema: (promptDef.inputSchema && promptDef.inputSchema instanceof z.ZodObject) ? promptDef.inputSchema.shape : {}
      },
      async (args: any) => {
        try {
          let result;
          if (!args || Object.keys(args).length === 0) {
            result = {
              messages: [
                {
                  role: 'assistant',
                  content: { type: 'text', text: `Prompt '${name}' metadata: ${promptDef.description}` }
                }
              ]
            };
          } else {
            result = await promptDef.handler(args);
          }

          if (!result || !result.messages || !Array.isArray(result.messages)) {
            return {
              messages: [
                {
                  role: 'assistant',
                  content: { type: 'text', text: `Internal error: invalid response format` }
                }
              ]
            };
          }

          const safeMessages = result.messages.map((msg: any) => ({
            role: (msg.role === 'user' || msg.role === 'assistant') ? msg.role : 'assistant',
            content: (msg.content && typeof msg.content === 'object' && msg.content.type === 'text')
              ? msg.content
              : { type: 'text', text: String(msg.content) }
          }));

          return { messages: safeMessages };
        } catch (error) {
          logger.error(`Error executing prompt ${name}: ${error instanceof Error ? error.message : String(error)}`, { error });
          const message = error instanceof Error ? error.message : 'Unknown error';
          return {
            messages: [
              {
                role: 'assistant',
                content: { type: 'text', text: `Error executing prompt ${name}: ${message}` }
              }
            ]
          };
        }
      }
    );
  }

  logger.info('MCP Firebird server initialized successfully');
  
  return server.server;
}

