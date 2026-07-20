import { pretty } from './formatter.js';
import { shouldLog } from './levels.js';
import type { FormatterFn, LogEntry, LogLevel, Transport } from './types.js';

export interface ConsoleTransportOptions {
  /** Formatter to use (defaults to pretty()) */
  readonly formatter?: FormatterFn;
  /** Minimum level for this transport (filters entries below this level) */
  readonly level?: LogLevel;
}

/**
 * Transport that writes formatted log entries to stderr via console.error.
 */
export function consoleTransport(options?: ConsoleTransportOptions): Transport {
  const formatter = options?.formatter ?? pretty();
  const level = options?.level;

  return {
    write(entry: LogEntry): void {
      if (level && !shouldLog(entry.level, level)) {
        return;
      }
      const formatted = formatter(entry);
      process.stderr.write(formatted + '\n');
    },
  };
}

export interface JsonTransportOptions {
  /** Writable stream to write to (defaults to process.stderr) */
  readonly stream?: NodeJS.WritableStream;
}

/**
 * Transport that writes JSON-formatted log entries to a writable stream.
 */
export function jsonTransport(options?: JsonTransportOptions): Transport {
  const stream = options?.stream ?? process.stderr;

  return {
    write(entry: LogEntry): void {
      const line = JSON.stringify({
        level: entry.level,
        message: entry.message,
        timestamp: entry.timestamp.toISOString(),
        context: entry.context,
        ...(entry.data && Object.keys(entry.data).length > 0 ? { data: entry.data } : {}),
      });
      stream.write(line + '\n');
    },
  };
}
