// Definiciones de tipos para Firebird MCP

// Configuración de conexión
export interface FirebirdConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  lowercase_keys?: boolean;
  role?: string;
  pageSize?: number;
}

// Interfaz para la conexión a la base de datos
export interface FirebirdConnection {
  query: (sql: string, params: any[], callback: (err: Error | null, result?: any[]) => void) => void;
  detach: (callback: (err?: Error) => void) => void;
}

// Error personalizado para Firebird
export interface FirebirdError extends Error {
  type: string;
}

// Definición de métodos para queries.js
export interface FirebirdQueries {
  executeQuery: (sql: string, params: any[], config: FirebirdConfig) => Promise<any[]>;
  listTables: (config: FirebirdConfig) => Promise<string[]>;
  describeTable: (tableName: string, config: FirebirdConfig) => Promise<any[]>;
  getFieldDescriptions: (tableName: string, config: FirebirdConfig) => Promise<Record<string, string>>;
}

// Definición de métodos para database-tools.js
export interface FirebirdDatabaseTools {
  optimizeQuery: (query: string, config: FirebirdConfig) => Promise<string>;
  generateReport: (config: FirebirdConfig) => Promise<any>;
  analyzeTableStructure: (tableName: string, config: FirebirdConfig) => Promise<any>;
}

// Definición de tipos para módulos de seguridad
export interface SecurityUtils {
  validateQuery: (query: string) => boolean;
  sanitizeInput: (input: string) => string;
  checkPermissions: (user: string, operation: string) => boolean;
}

// Tipos para funciones de conexión
export type ConnectToDatabase = (config: FirebirdConfig) => Promise<FirebirdConnection>;
export type CloseConnection = (db: FirebirdConnection) => Promise<void>;
export type QueryDatabase = (db: FirebirdConnection, sql: string, params?: any[]) => Promise<any[]>;
