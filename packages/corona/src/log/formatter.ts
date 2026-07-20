import { color } from '../color.js';
import { style } from '../style.js';
import type { FormatterFn, LogEntry, LogLevel } from './types.js';

/**
 * ANSI-styled pretty formatter using @celestial/corona.
 *
 * Colors by level:
 *   trace  = dim gray
 *   debug  = gray
 *   info   = cyan
 *   warn   = yellow
 *   error  = red
 *   fatal  = bright red background
 */
export function pretty(): FormatterFn {
  const levelStyles: Record<LogLevel, ReturnType<typeof style>> = {
    trace: style({ color: color.gray, dim: true }),
    debug: style({ color: color.gray }),
    info: style({ color: color.cyan }),
    warn: style({ color: color.yellow }),
    error: style({ color: color.red }),
    fatal: style({ background: color.brightRed, color: color.brightWhite, bold: true }),
  };

  const dimStyle = style({ dim: true });

  return (entry: LogEntry): string => {
    const ts = dimStyle.render(entry.timestamp.toISOString());
    const lvl = levelStyles[entry.level].render(entry.level.toUpperCase().padEnd(5));
    const msg = entry.message;

    let result = `${ts} ${lvl} ${msg}`;

    const contextKeys = Object.keys(entry.context);
    if (contextKeys.length > 0) {
      const ctx = dimStyle.render(JSON.stringify(entry.context));
      result += ` ${ctx}`;
    }

    if (entry.data && Object.keys(entry.data).length > 0) {
      const data = dimStyle.render(JSON.stringify(entry.data));
      result += ` ${data}`;
    }

    return result;
  };
}

/**
 * JSON formatter — outputs one JSON line per entry with all fields.
 */
export function json(): FormatterFn {
  return (entry: LogEntry): string => {
    return JSON.stringify({
      level: entry.level,
      message: entry.message,
      timestamp: entry.timestamp.toISOString(),
      context: entry.context,
      ...(entry.data && Object.keys(entry.data).length > 0 ? { data: entry.data } : {}),
    });
  };
}

/**
 * Compact formatter — minimal `[LEVEL] message` format, no timestamp or context.
 */
export function compact(): FormatterFn {
  return (entry: LogEntry): string => {
    return `[${entry.level.toUpperCase()}] ${entry.message}`;
  };
}
