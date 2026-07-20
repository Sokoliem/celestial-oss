import { describe, expect, it } from 'vitest';
import { compact, json, pretty } from '../log/formatter.js';
import type { LogEntry } from '../log/types.js';

function makeEntry(overrides?: Partial<LogEntry>): LogEntry {
  return {
    level: 'info',
    message: 'test message',
    timestamp: new Date('2026-01-15T10:30:00.000Z'),
    context: {},
    ...overrides,
  };
}

describe('pretty()', () => {
  const fmt = pretty();

  it('should include the message in output', () => {
    const result = fmt(makeEntry());
    expect(result).toContain('test message');
  });

  it('should include the level in output', () => {
    const result = fmt(makeEntry());
    expect(result).toContain('INFO');
  });

  it('should include the timestamp in output', () => {
    const result = fmt(makeEntry());
    expect(result).toContain('2026-01-15T10:30:00.000Z');
  });

  it('should colorize info level with ANSI escape codes', () => {
    const result = fmt(makeEntry({ level: 'info' }));
    // cyan fg = \x1b[36m
    expect(result).toContain('\x1b[36m');
  });

  it('should colorize warn level with ANSI escape codes', () => {
    const result = fmt(makeEntry({ level: 'warn' }));
    // yellow fg = \x1b[33m
    expect(result).toContain('\x1b[33m');
  });

  it('should colorize error level with ANSI escape codes', () => {
    const result = fmt(makeEntry({ level: 'error' }));
    // red fg = \x1b[31m
    expect(result).toContain('\x1b[31m');
  });

  it('should include context when present', () => {
    const result = fmt(makeEntry({ context: { service: 'api' } }));
    expect(result).toContain('"service"');
    expect(result).toContain('"api"');
  });

  it('should include data when present', () => {
    const result = fmt(makeEntry({ data: { count: 42 } }));
    expect(result).toContain('"count"');
    expect(result).toContain('42');
  });

  it('should not include context section when context is empty', () => {
    const result = fmt(makeEntry({ context: {} }));
    // The message should be present, but no extra JSON objects for empty context
    const afterMsg = result.split('test message')[1]!;
    expect(afterMsg).not.toContain('{}');
  });
});

describe('json()', () => {
  const fmt = json();

  it('should return valid JSON', () => {
    const result = fmt(makeEntry());
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it('should include all required fields', () => {
    const result = JSON.parse(fmt(makeEntry()));
    expect(result).toHaveProperty('level', 'info');
    expect(result).toHaveProperty('message', 'test message');
    expect(result).toHaveProperty('timestamp', '2026-01-15T10:30:00.000Z');
    expect(result).toHaveProperty('context');
  });

  it('should include data field when present', () => {
    const result = JSON.parse(fmt(makeEntry({ data: { key: 'value' } })));
    expect(result).toHaveProperty('data');
    expect(result.data).toEqual({ key: 'value' });
  });

  it('should omit data field when not present', () => {
    const result = JSON.parse(fmt(makeEntry()));
    expect(result).not.toHaveProperty('data');
  });

  it('should include context in output', () => {
    const result = JSON.parse(fmt(makeEntry({ context: { req: '123' } })));
    expect(result.context).toEqual({ req: '123' });
  });
});

describe('compact()', () => {
  const fmt = compact();

  it('should return [LEVEL] message format', () => {
    const result = fmt(makeEntry());
    expect(result).toBe('[INFO] test message');
  });

  it('should uppercase the level', () => {
    const result = fmt(makeEntry({ level: 'debug' }));
    expect(result).toBe('[DEBUG] test message');
  });

  it('should not include timestamp', () => {
    const result = fmt(makeEntry());
    expect(result).not.toContain('2026');
  });

  it('should not include context', () => {
    const result = fmt(makeEntry({ context: { service: 'api' } }));
    expect(result).not.toContain('service');
  });

  it('should format all log levels correctly', () => {
    const levels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;
    for (const level of levels) {
      const result = fmt(makeEntry({ level }));
      expect(result).toBe(`[${level.toUpperCase()}] test message`);
    }
  });
});

describe('pretty() edge cases', () => {
  const fmt = pretty();

  it('should use background color for fatal level', () => {
    const result = fmt(makeEntry({ level: 'fatal' }));
    // Fatal uses brightRed background and brightWhite text with bold
    expect(result).toContain('FATAL');
    // Background codes (101 for bright red bg) should be present
    expect(result).toContain('\x1b[');
  });

  it('should not include data section when data is undefined', () => {
    const result = fmt(makeEntry());
    // After the message, there should be no extra JSON data appended
    const afterMsg = result.split('test message')[1]!;
    expect(afterMsg.trim()).toBe('');
  });
});

describe('json() edge cases', () => {
  const fmt = json();

  it('should omit data field when data is an empty object', () => {
    const result = JSON.parse(fmt(makeEntry({ data: {} })));
    expect(result).not.toHaveProperty('data');
  });

  it('should omit data field when data is undefined', () => {
    const entry = makeEntry();
    // entry has no data property by default
    const result = JSON.parse(fmt(entry));
    expect(result).not.toHaveProperty('data');
  });
});
