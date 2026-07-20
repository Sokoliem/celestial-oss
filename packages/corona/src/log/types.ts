export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
  readonly level: LogLevel;
  readonly message: string;
  readonly timestamp: Date;
  readonly context: Record<string, unknown>;
  readonly data?: Record<string, unknown>;
}

export interface Transport {
  readonly write: (entry: LogEntry) => void;
}

export type FormatterFn = (entry: LogEntry) => string;

export interface LoggerConfig {
  readonly level?: LogLevel;
  readonly transports?: Transport[];
  readonly context?: Record<string, unknown>;
  readonly formatter?: FormatterFn;
}

export interface Logger {
  trace(message: string, data?: Record<string, unknown>): void;
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  fatal(message: string, data?: Record<string, unknown>): void;
  child(context: Record<string, unknown>): Logger;
}
