import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compact } from '../log/formatter.js';
import { consoleTransport, jsonTransport } from '../log/transport.js';
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

describe('consoleTransport', () => {
  const originalWrite = process.stderr.write;
  let writtenChunks: string[];

  beforeEach(() => {
    writtenChunks = [];
    process.stderr.write = vi.fn((chunk: unknown) => {
      writtenChunks.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;
  });

  afterEach(() => {
    process.stderr.write = originalWrite;
  });

  it('should write to stderr', () => {
    const transport = consoleTransport({ formatter: compact() });
    transport.write(makeEntry());
    expect(process.stderr.write).toHaveBeenCalled();
  });

  it('should use the provided formatter', () => {
    const transport = consoleTransport({ formatter: compact() });
    transport.write(makeEntry());
    expect(writtenChunks[0]).toContain('[INFO] test message');
  });

  it('should append newline to output', () => {
    const transport = consoleTransport({ formatter: compact() });
    transport.write(makeEntry());
    expect(writtenChunks[0]!.endsWith('\n')).toBe(true);
  });

  it('should filter entries below the configured level', () => {
    const transport = consoleTransport({ formatter: compact(), level: 'warn' });
    transport.write(makeEntry({ level: 'debug' }));
    expect(process.stderr.write).not.toHaveBeenCalled();
  });

  it('should pass entries at or above the configured level', () => {
    const transport = consoleTransport({ formatter: compact(), level: 'warn' });
    transport.write(makeEntry({ level: 'error' }));
    expect(process.stderr.write).toHaveBeenCalled();
  });

  it('should use pretty formatter by default', () => {
    const transport = consoleTransport();
    transport.write(makeEntry());
    // Pretty formatter includes ANSI escape codes
    expect(writtenChunks[0]).toContain('\x1b[');
  });
});

describe('jsonTransport', () => {
  it('should write JSON to the provided stream', () => {
    const chunks: string[] = [];
    const mockStream = {
      write: vi.fn((chunk: string) => {
        chunks.push(chunk);
        return true;
      }),
    } as unknown as NodeJS.WritableStream;

    const transport = jsonTransport({ stream: mockStream });
    transport.write(makeEntry());

    expect(mockStream.write).toHaveBeenCalled();
    const output = chunks[0]!;
    const parsed = JSON.parse(output.trim());
    expect(parsed).toHaveProperty('level', 'info');
    expect(parsed).toHaveProperty('message', 'test message');
  });

  it('should write valid JSON lines', () => {
    const chunks: string[] = [];
    const mockStream = {
      write: vi.fn((chunk: string) => {
        chunks.push(chunk);
        return true;
      }),
    } as unknown as NodeJS.WritableStream;

    const transport = jsonTransport({ stream: mockStream });
    transport.write(makeEntry());
    transport.write(makeEntry({ level: 'error', message: 'oh no' }));

    expect(chunks).toHaveLength(2);
    for (const chunk of chunks) {
      expect(() => JSON.parse(chunk.trim())).not.toThrow();
    }
  });

  it('should include data in JSON output when present', () => {
    const chunks: string[] = [];
    const mockStream = {
      write: vi.fn((chunk: string) => {
        chunks.push(chunk);
        return true;
      }),
    } as unknown as NodeJS.WritableStream;

    const transport = jsonTransport({ stream: mockStream });
    transport.write(makeEntry({ data: { userId: 'abc' } }));

    const parsed = JSON.parse(chunks[0]!.trim());
    expect(parsed.data).toEqual({ userId: 'abc' });
  });

  it('should default to stderr when no stream is provided', () => {
    const originalWrite = process.stderr.write;
    const writeFn = vi.fn(() => true) as unknown as typeof process.stderr.write;
    process.stderr.write = writeFn;
    try {
      const transport = jsonTransport();
      transport.write(makeEntry());
      expect(writeFn).toHaveBeenCalled();
    } finally {
      process.stderr.write = originalWrite;
    }
  });

  it('should omit data field when entry has no data', () => {
    const chunks: string[] = [];
    const mockStream = {
      write: vi.fn((chunk: string) => {
        chunks.push(chunk);
        return true;
      }),
    } as unknown as NodeJS.WritableStream;

    const transport = jsonTransport({ stream: mockStream });
    transport.write(makeEntry());

    const parsed = JSON.parse(chunks[0]!.trim());
    expect(parsed).not.toHaveProperty('data');
  });

  it('should omit data field when entry data is an empty object', () => {
    const chunks: string[] = [];
    const mockStream = {
      write: vi.fn((chunk: string) => {
        chunks.push(chunk);
        return true;
      }),
    } as unknown as NodeJS.WritableStream;

    const transport = jsonTransport({ stream: mockStream });
    transport.write(makeEntry({ data: {} }));

    const parsed = JSON.parse(chunks[0]!.trim());
    expect(parsed).not.toHaveProperty('data');
  });
});

describe('consoleTransport edge cases', () => {
  const originalWrite = process.stderr.write;
  let writtenChunks: string[];

  beforeEach(() => {
    writtenChunks = [];
    process.stderr.write = vi.fn((chunk: unknown) => {
      writtenChunks.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;
  });

  afterEach(() => {
    process.stderr.write = originalWrite;
  });

  it('should use default pretty formatter when no options are provided', () => {
    const transport = consoleTransport();
    transport.write(makeEntry());
    expect(process.stderr.write).toHaveBeenCalled();
    // Default pretty formatter includes ANSI escape codes
    expect(writtenChunks[0]).toContain('\x1b[');
    expect(writtenChunks[0]).toContain('test message');
  });

  it('should pass entry when entry level equals transport minLevel', () => {
    const transport = consoleTransport({ formatter: compact(), level: 'warn' });
    transport.write(makeEntry({ level: 'warn' }));
    expect(process.stderr.write).toHaveBeenCalled();
    expect(writtenChunks[0]).toContain('[WARN]');
  });
});
