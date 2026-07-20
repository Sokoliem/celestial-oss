import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '../log/logger.js';
import type { LogEntry, Transport } from '../log/types.js';

function mockTransport(): Transport & { entries: LogEntry[] } {
  const entries: LogEntry[] = [];
  return {
    entries,
    write: vi.fn((entry: LogEntry) => {
      entries.push(entry);
    }),
  };
}

describe('createLogger', () => {
  it('should create a logger with default config', () => {
    // Should not throw; defaults to info level and consoleTransport
    const logger = createLogger();
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
  });

  it('should create a logger with custom transports', () => {
    const transport = mockTransport();
    const logger = createLogger({ transports: [transport] });
    logger.info('hello');
    expect(transport.entries).toHaveLength(1);
  });
});

describe('log methods', () => {
  let transport: ReturnType<typeof mockTransport>;

  beforeEach(() => {
    transport = mockTransport();
  });

  it('should create correct entry for info()', () => {
    const logger = createLogger({ transports: [transport], level: 'trace' });
    logger.info('info message');
    expect(transport.entries).toHaveLength(1);
    expect(transport.entries[0]!.level).toBe('info');
    expect(transport.entries[0]!.message).toBe('info message');
  });

  it('should create correct entry for warn()', () => {
    const logger = createLogger({ transports: [transport], level: 'trace' });
    logger.warn('warn message');
    expect(transport.entries[0]!.level).toBe('warn');
  });

  it('should create correct entry for error()', () => {
    const logger = createLogger({ transports: [transport], level: 'trace' });
    logger.error('error message');
    expect(transport.entries[0]!.level).toBe('error');
  });

  it('should create correct entry for debug()', () => {
    const logger = createLogger({ transports: [transport], level: 'trace' });
    logger.debug('debug message');
    expect(transport.entries[0]!.level).toBe('debug');
  });

  it('should create correct entry for trace()', () => {
    const logger = createLogger({ transports: [transport], level: 'trace' });
    logger.trace('trace message');
    expect(transport.entries[0]!.level).toBe('trace');
  });

  it('should create correct entry for fatal()', () => {
    const logger = createLogger({ transports: [transport], level: 'trace' });
    logger.fatal('fatal message');
    expect(transport.entries[0]!.level).toBe('fatal');
  });

  it('should include data when provided', () => {
    const logger = createLogger({ transports: [transport], level: 'trace' });
    logger.info('with data', { count: 42 });
    expect(transport.entries[0]!.data).toEqual({ count: 42 });
  });

  it('should include a timestamp', () => {
    const logger = createLogger({ transports: [transport], level: 'trace' });
    const before = new Date();
    logger.info('timestamp test');
    const after = new Date();
    const ts = transport.entries[0]!.timestamp;
    expect(ts.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(ts.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});

describe('level filtering', () => {
  it('should filter messages below configured level', () => {
    const transport = mockTransport();
    const logger = createLogger({ transports: [transport], level: 'warn' });
    logger.debug('should not appear');
    logger.info('should not appear');
    expect(transport.entries).toHaveLength(0);
  });

  it('should pass messages at configured level', () => {
    const transport = mockTransport();
    const logger = createLogger({ transports: [transport], level: 'warn' });
    logger.warn('should appear');
    expect(transport.entries).toHaveLength(1);
  });

  it('should pass messages above configured level', () => {
    const transport = mockTransport();
    const logger = createLogger({ transports: [transport], level: 'warn' });
    logger.error('should appear');
    logger.fatal('should also appear');
    expect(transport.entries).toHaveLength(2);
  });
});

describe('multiple transports', () => {
  it('should write to all configured transports', () => {
    const t1 = mockTransport();
    const t2 = mockTransport();
    const logger = createLogger({ transports: [t1, t2] });
    logger.info('broadcast');
    expect(t1.entries).toHaveLength(1);
    expect(t2.entries).toHaveLength(1);
  });

  it('should not throw with no transports', () => {
    const logger = createLogger({ transports: [] });
    expect(() => logger.info('no transports')).not.toThrow();
  });
});

describe('child logger', () => {
  it('should inherit parent level', () => {
    const transport = mockTransport();
    const parent = createLogger({ transports: [transport], level: 'warn' });
    const child = parent.child({ service: 'api' });
    child.debug('should be filtered');
    expect(transport.entries).toHaveLength(0);
    child.warn('should pass');
    expect(transport.entries).toHaveLength(1);
  });

  it('should merge child context with parent context', () => {
    const transport = mockTransport();
    const parent = createLogger({
      transports: [transport],
      context: { app: 'celestial' },
    });
    const child = parent.child({ service: 'api' });
    child.info('hello');
    expect(transport.entries[0]!.context).toEqual({
      app: 'celestial',
      service: 'api',
    });
  });

  it('should include both parent and child context in entries', () => {
    const transport = mockTransport();
    const parent = createLogger({
      transports: [transport],
      context: { env: 'test' },
    });
    const child = parent.child({ module: 'auth' });
    const grandchild = child.child({ handler: 'login' });
    grandchild.info('deep');
    expect(transport.entries[0]!.context).toEqual({
      env: 'test',
      module: 'auth',
      handler: 'login',
    });
  });

  it('should write to the same transports as parent', () => {
    const transport = mockTransport();
    const parent = createLogger({ transports: [transport] });
    const child = parent.child({ service: 'worker' });
    child.info('from child');
    expect(transport.entries).toHaveLength(1);
    expect(transport.entries[0]!.message).toBe('from child');
  });

  it('should allow child context to override parent context keys', () => {
    const transport = mockTransport();
    const parent = createLogger({
      transports: [transport],
      context: { version: '1.0' },
    });
    const child = parent.child({ version: '2.0' });
    child.info('override');
    expect(transport.entries[0]!.context).toEqual({ version: '2.0' });
  });
});

describe('edge cases', () => {
  it('should not have a data property when data is undefined', () => {
    const transport = mockTransport();
    const logger = createLogger({ transports: [transport] });
    logger.info('no data');
    const entry = transport.entries[0]!;
    expect(Object.hasOwn(entry, 'data')).toBe(false);
  });

  it('should handle empty message string', () => {
    const transport = mockTransport();
    const logger = createLogger({ transports: [transport] });
    logger.info('');
    expect(transport.entries).toHaveLength(1);
    expect(transport.entries[0]!.message).toBe('');
  });

  it('should inherit parent context and add child context', () => {
    const transport = mockTransport();
    const parent = createLogger({
      transports: [transport],
      context: { app: 'celestial' },
    });
    const child = parent.child({ service: 'api' });
    child.info('hello');
    expect(transport.entries[0]!.context).toEqual({
      app: 'celestial',
      service: 'api',
    });
    // Parent context should not be mutated
    parent.info('parent msg');
    expect(transport.entries[1]!.context).toEqual({ app: 'celestial' });
  });

  it('should not throw with an empty transports array', () => {
    const logger = createLogger({ transports: [] });
    expect(() => logger.info('silent')).not.toThrow();
    expect(() => logger.error('silent error')).not.toThrow();
  });

  it('should support multiple child levels (grandchild logger)', () => {
    const transport = mockTransport();
    const root = createLogger({
      transports: [transport],
      context: { root: true },
      level: 'trace',
    });
    const child = root.child({ child: true });
    const grandchild = child.child({ grandchild: true });
    grandchild.trace('deep trace');
    expect(transport.entries).toHaveLength(1);
    expect(transport.entries[0]!.context).toEqual({
      root: true,
      child: true,
      grandchild: true,
    });
    expect(transport.entries[0]!.level).toBe('trace');
  });
});
