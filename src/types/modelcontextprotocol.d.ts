/**
 * Type definitions for Model Context Protocol SDK
 *
 * @deprecated This file contains legacy type definitions.
 * The SDK now provides its own TypeScript definitions.
 * Use imports from '@modelcontextprotocol/sdk/server/mcp.js' instead.
 */

declare module '@modelcontextprotocol/sdk' {
    /**
     * @deprecated Use McpServer from '@modelcontextprotocol/sdk/server/mcp.js' instead
     */
    export class Server {
        constructor(info: { name: string; version: string }, options: { capabilities: ServerCapabilities });
        setRequestHandler<T = any>(schema: any, handler: (request: any) => Promise<T>): void;
        connect(transport: any): Promise<void>;
        sendLoggingMessage(message: { level: string; data: string }): Promise<void>;
    }

    export class StdioServerTransport {
        constructor();
    }

    // Esquemas de solicitud
    export const ListResourcesRequestSchema: any;
    export const ReadResourceRequestSchema: any;
    export const ListToolsRequestSchema: any;
    export const CallToolRequestSchema: any;
    export const ListPromptsRequestSchema: any;
    export const GetPromptRequestSchema: any;

    // Tipos de capacidades del servidor (actualizados para MCP moderno)
    export interface ServerCapabilities {
        resources?: {
            listChanged?: boolean;
            subscribe?: boolean;
        };
        tools?: {
            listChanged?: boolean;
        };
        prompts?: {
            listChanged?: boolean;
        };
        logging?: {
            send?: boolean;
        };
        completions?: object;
        experimental?: { [key: string]: object };
    }
}