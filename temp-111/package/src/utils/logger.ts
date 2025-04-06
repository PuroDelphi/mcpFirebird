export interface Logger {
  info(message: string): void;
  error(message: string): void;
  warn(message: string): void;
  debug(message: string): void;
}

export function createLogger(name: string): Logger {
  const prefix = `[${name}]`;
  
  return {
    info: (message: string) => {
      console.log(`${prefix} INFO: ${message}`);
    },
    error: (message: string) => {
      console.error(`${prefix} ERROR: ${message}`);
    },
    warn: (message: string) => {
      console.warn(`${prefix} WARN: ${message}`);
    },
    debug: (message: string) => {
      if (process.env.NODE_ENV !== 'production') {
        console.debug(`${prefix} DEBUG: ${message}`);
      }
    }
  };
} 