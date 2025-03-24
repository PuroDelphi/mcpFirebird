import * as fb from 'node-firebird';

export interface MCPConfig {
    host: string;
    port: number;
    wsPort?: number;
    database: string;
    user: string;
    password: string;
    options?: {
        poolSize?: number;
        connectionTimeout?: number;
        queryTimeout?: number;
        logLevel?: 'debug' | 'info' | 'warn' | 'error';
    };
}

export interface MCPQuery {
    sql: string;
    params?: any[];
    timeout?: number;
}

export interface MCPColumn {
    name: string;
    type: string;
    nullable: boolean;
    defaultValue?: any;
}

export interface MCPIndex {
    name: string;
    columns: string[];
    unique: boolean;
}

export interface MCPTableInfo {
    name: string;
    columns: MCPColumn[];
    primaryKey?: string[];
    foreignKeys?: Array<{
        column: string;
        references: {
            table: string;
            column: string;
        };
    }>;
    indexes?: MCPIndex[];
}

export interface MCPDataTrend {
    table: string;
    trends: Array<{
        period: string;
        count: number;
        changes: number;
        lastUpdate: Date;
    }>;
}

export interface MCPConnection {
    query(query: MCPQuery): Promise<any[]>;
    analyzeTable(table: string): Promise<MCPTableInfo>;
    analyzeTrends(table: string, period?: 'daily' | 'monthly' | 'yearly'): Promise<MCPDataTrend>;
    close(): Promise<void>;
}

export function createConnection(config: MCPConfig): MCPConnection; 