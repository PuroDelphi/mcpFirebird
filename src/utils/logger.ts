/**
 * Logger module for MCP Firebird
 * Provides standardized logging functionality
 */

/**
 * Log levels
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4
}

/**
 * Logger interface
 */
export interface Logger {
  /**
   * Log an informational message
   * @param message - The message to log
   * @param context - Optional context data to include with the log
   */
  info(message: string, context?: Record<string, any>): void;

  /**
   * Log an error message
   * @param message - The message to log
   * @param error - Optional error object or context data
   */
  error(message: string, error?: Error | Record<string, any>): void;

  /**
   * Log a warning message
   * @param message - The message to log
   * @param context - Optional context data to include with the log
   */
  warn(message: string, context?: Record<string, any>): void;

  /**
   * Log a debug message
   * @param message - The message to log
   * @param context - Optional context data to include with the log
   */
  debug(message: string, context?: Record<string, any>): void;
}

/**
 * Get the current log level from environment variables
 * @returns The current log level
 */
function getLogLevel(): LogLevel {
  const level = process.env.LOG_LEVEL?.toLowerCase();

  switch (level) {
    case 'debug': return LogLevel.DEBUG;
    case 'info': return LogLevel.INFO;
    case 'warn': return LogLevel.WARN;
    case 'error': return LogLevel.ERROR;
    case 'none': return LogLevel.NONE;
    default: return LogLevel.INFO; // Default to INFO
  }
}

/**
 * Format context data for logging
 * @param context - The context data to format
 * @returns Formatted context string
 */
function formatContext(context?: Record<string, any> | Error): string {
  if (!context) return '';

  if (context instanceof Error) {
    return ` ${context.stack || context.message}`;
  }

  try {
    return ` ${JSON.stringify(context)}`;
  } catch (err) {
    return ` [Unserializable context]`;
  }
}

/**
 * Create a logger instance
 * @param namespace - The namespace for the logger
 * @returns A logger instance
 */
export function createLogger(namespace: string): Logger {
  const currentLogLevel = getLogLevel();
  const timestamp = () => new Date().toISOString();

  return {
    info: (message: string, context?: Record<string, any>): void => {
      if (currentLogLevel <= LogLevel.INFO) {
        const contextStr = formatContext(context);
        process.stderr.write(`[${timestamp()}] [INFO] [${namespace}] ${message}${contextStr}\n`);
      }
    },

    error: (message: string, error?: Error | Record<string, any>): void => {
      if (currentLogLevel <= LogLevel.ERROR) {
        const contextStr = formatContext(error);
        process.stderr.write(`[${timestamp()}] [ERROR] [${namespace}] ${message}${contextStr}\n`);
      }
    },

    warn: (message: string, context?: Record<string, any>): void => {
      if (currentLogLevel <= LogLevel.WARN) {
        const contextStr = formatContext(context);
        process.stderr.write(`[${timestamp()}] [WARN] [${namespace}] ${message}${contextStr}\n`);
      }
    },

    debug: (message: string, context?: Record<string, any>): void => {
      if (currentLogLevel <= LogLevel.DEBUG) {
        const contextStr = formatContext(context);
        process.stderr.write(`[${timestamp()}] [DEBUG] [${namespace}] ${message}${contextStr}\n`);
      }
    }
  };
}