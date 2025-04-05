export interface Logger {
  info(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  debug(message: string, ...args: any[]): void;
}

export function createLogger(name: string): Logger {
  const prefix = `[${name}]`;
  
  return {
    info: (message: string, ...args: any[]) => {
      console.error(`${prefix} INFO: ${message}`, ...args);
    },
    error: (message: string, ...args: any[]) => {
      console.error(`${prefix} ERROR: ${message}`, ...args);
    },
    warn: (message: string, ...args: any[]) => {
      console.error(`${prefix} WARN: ${message}`, ...args);
    },
    debug: (message: string, ...args: any[]) => {
      if (process.env.NODE_ENV !== 'production') {
        console.error(`${prefix} DEBUG: ${message}`, ...args);
      }
    }
  };
} 