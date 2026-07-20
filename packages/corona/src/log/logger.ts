import { shouldLog } from './levels.js';
import { consoleTransport } from './transport.js';
import type { LogEntry, Logger, LoggerConfig, LogLevel, Transport } from './types.js';

/**
 * Create a structured logger.
 *
 * @param config - Logger configuration (level, transports, context, formatter)
 * @returns A Logger instance
 */
export function createLogger(config?: LoggerConfig): Logger {
  const level: LogLevel = config?.level ?? 'info';
  const transports: Transport[] = config?.transports ?? [consoleTransport()];
  const context: Record<string, unknown> = config?.context ?? {};

  function log(msgLevel: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (!shouldLog(msgLevel, level)) {
      return;
    }

    const entry: LogEntry = {
      level: msgLevel,
      message,
      timestamp: new Date(),
      context,
      ...(data !== undefined ? { data } : {}),
    };

    for (const transport of transports) {
      transport.write(entry);
    }
  }

  const logger: Logger = {
    trace(message: string, data?: Record<string, unknown>): void {
      log('trace', message, data);
    },
    debug(message: string, data?: Record<string, unknown>): void {
      log('debug', message, data);
    },
    info(message: string, data?: Record<string, unknown>): void {
      log('info', message, data);
    },
    warn(message: string, data?: Record<string, unknown>): void {
      log('warn', message, data);
    },
    error(message: string, data?: Record<string, unknown>): void {
      log('error', message, data);
    },
    fatal(message: string, data?: Record<string, unknown>): void {
      log('fatal', message, data);
    },
    child(childContext: Record<string, unknown>): Logger {
      return createLogger({
        level,
        transports,
        context: { ...context, ...childContext },
        formatter: config?.formatter,
      });
    },
  };

  return logger;
}
