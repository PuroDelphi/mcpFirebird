declare module 'node-firebird' {
  export interface DatabaseOptions {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  }

  export interface QueryCallback {
    (err: Error | null, result: any[]): void;
  }

  export class Database {
    connect(options: DatabaseOptions): Promise<void>;
    query(query: string, params?: any[], callback?: QueryCallback): Promise<any[]>;
    disconnect(): Promise<void>;
  }
} 