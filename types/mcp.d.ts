declare module 'mcp-firebird' {
    export interface MCPConfig {
        host?: string;
        port?: number;
        wsPort?: number;
        database: string;
        user: string;
        password: string;
        maxConnections?: number;
        queryTimeout?: number;
        logLevel?: 'debug' | 'info' | 'warn' | 'error';
    }

    export interface MCPQueryOptions {
        timeout?: number;
        format?: 'json' | 'csv';
        maxRows?: number;
    }

    export interface MCPQueryParams {
        sql: string;
        params?: any[];
        options?: MCPQueryOptions;
    }

    export interface MCPAnalyzeOptions {
        includeIndexes?: boolean;
        includeConstraints?: boolean;
        includeTriggers?: boolean;
        includeProcedures?: boolean;
    }

    export interface MCPDataTrendsOptions {
        field: string;
        period: 'daily' | 'monthly' | 'yearly';
        startDate?: Date;
        endDate?: Date;
    }

    export interface MCPTableInfo {
        name: string;
        columns: MCPColumn[];
        indexes?: MCPIndex[];
        constraints?: MCPConstraint[];
        triggers?: MCPTrigger[];
        procedures?: MCPProcedure[];
    }

    export interface MCPColumn {
        name: string;
        type: string;
        nullable: boolean;
        default?: string;
        length?: number;
        scale?: number;
        precision?: number;
        subType?: string;
        source?: string;
        description?: string;
    }

    export interface MCPIndex {
        name: string;
        isUnique: boolean;
        columns: string[];
    }

    export interface MCPConstraint {
        name: string;
        column: string;
        type: string;
    }

    export interface MCPTrigger {
        name: string;
        type: string;
        timing: string;
        source: string;
    }

    export interface MCPProcedure {
        name: string;
        inputParams: MCPColumn[];
        outputParams: MCPColumn[];
        source: string;
    }

    export interface MCPDataTrends {
        table: string;
        field: string;
        period: string;
        trends: {
            period: string;
            count: number;
            average: number;
            minimum: number;
            maximum: number;
        }[];
    }

    export interface MCPConnection {
        query(params: MCPQueryParams): Promise<any>;
        analyze(params: {
            type: 'table_structure' | 'data_trends';
            table: string;
            options?: MCPAnalyzeOptions | MCPDataTrendsOptions;
        }): Promise<MCPTableInfo | MCPDataTrends>;
        disconnect(): Promise<void>;
    }

    export function connect(config: MCPConfig | string): Promise<MCPConnection>;
} 