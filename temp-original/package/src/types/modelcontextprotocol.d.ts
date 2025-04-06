declare module '@modelcontextprotocol/sdk' {
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

    // Tipos de capacidades del servidor
    export interface ServerCapabilities {
        resources?: {
            list?: boolean;
            read?: boolean;
        };
        tools?: {
            list?: boolean;
            call?: boolean;
        };
        prompts?: {
            list?: boolean;
            get?: boolean;
        };
        logging?: {
            send?: boolean;
        };
    }
} 