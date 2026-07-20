import type { LogLevel } from './types.js';

/**
 * Numeric values for each log level, used for ordering comparisons.
 * Lower values are more verbose; higher values are more severe.
 */
export const LOG_LEVELS: Record<LogLevel, number> = {
  trace: 0,
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
} as const;

/**
 * Determine whether a message at `messageLevel` should be logged
 * given the logger is configured at `configuredLevel`.
 *
 * Returns true when the message's severity is >= the configured threshold.
 */
export function shouldLog(messageLevel: LogLevel, configuredLevel: LogLevel): boolean {
  return LOG_LEVELS[messageLevel] >= LOG_LEVELS[configuredLevel];
}
