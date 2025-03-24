export interface MCPServer {
  initialize(): Promise<void>;
  getResources(): Promise<MCPResource[]>;
  getTools(): Promise<MCPTool[]>;
  getPrompts(): Promise<MCPPrompt[]>;
  callTool(name: string, params: any): Promise<any>;
  close(): Promise<void>;
}

export interface MCPResource {
  name: string;
  type: string;
  description: string;
}

export interface MCPTool {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: {
      [key: string]: {
        type: string;
        description?: string;
        items?: {
          type: string;
        };
      };
    };
    required: string[];
  };
}

export interface MCPPrompt {
  name: string;
  description: string;
  template: string;
}

export interface MCPTrendData {
  period: 'daily' | 'weekly' | 'monthly' | 'yearly';
  count: number;
  changes: number;
  lastUpdate: Date;
}

export interface MCPDataTrend {
  table: string;
  trends: MCPTrendData[];
} 