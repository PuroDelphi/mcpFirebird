export interface MCPConfig {
  host: string;
  port: number;
  database: string;
  database_dir?: string;
  user: string;
  password: string;
  role?: string;
  lowercase_keys?: boolean;
  pageSize?: number;
  timeout?: number;
}

export interface MCPQuery {
  sql: string;
  params?: any[];
  context?: {
    description?: string;
    constraints?: string[];
    preferences?: string[];
  };
}

export interface MCPColumnInfo {
  name: string;
  type: string;
  length?: number;
  precision?: number;
  scale?: number;
  nullable: boolean;
  defaultValue?: string;
  description?: string;
  isPrimaryKey: boolean;
}

export interface MCPForeignKeyInfo {
  constraintName: string;
  column: string;
  referencedTable: string;
  referencedColumn: string;
}

export interface MCPTableSchema {
  tableName: string;
  columns: MCPColumnInfo[];
  primaryKeys: string[];
  foreignKeys: MCPForeignKeyInfo[];
}

export interface MCPTableInfo {
  name: string;
  uri: string;
}

export interface MCPViewInfo {
  name: string;
  uri: string;
}

export interface MCPProcedureInfo {
  name: string;
  uri: string;
}

export interface MCPDataTrend {
  table: string;
  trends: {
    period: 'daily' | 'monthly' | 'yearly';
    count: number;
    changes: number;
    lastUpdate: Date;
  }[];
}