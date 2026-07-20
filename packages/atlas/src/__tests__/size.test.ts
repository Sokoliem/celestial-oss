import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTerminalSize, onResize, setTerminalSizeOverride } from '../size.js';

afterEach(() => {
  setTerminalSizeOverride(null);
  vi.unstubAllGlobals();
});

describe('getTerminalSize()', () => {
  it('returns stdout columns and rows', () => {
    vi.stubGlobal('process', {
      stdout: { columns: 120, rows: 40 },
    });
    expect(getTerminalSize()).toEqual({ cols: 120, rows: 40 });
  });

  it('falls back to 80x24 when stdout has no dimensions', () => {
    vi.stubGlobal('process', { stdout: {} });
    expect(getTerminalSize()).toEqual({ cols: 80, rows: 24 });
  });

  it('falls back to 80x24 when process is undefined', () => {
    vi.stubGlobal('process', undefined);
    expect(getTerminalSize()).toEqual({ cols: 80, rows: 24 });
  });
});

describe('setTerminalSizeOverride()', () => {
  it('overrides getTerminalSize return value', () => {
    setTerminalSizeOverride({ cols: 200, rows: 50 });
    expect(getTerminalSize()).toEqual({ cols: 200, rows: 50 });
  });

  it('clearing override restores real values', () => {
    vi.stubGlobal('process', {
      stdout: { columns: 100, rows: 30 },
    });
    setTerminalSizeOverride({ cols: 200, rows: 50 });
    setTerminalSizeOverride(null);
    expect(getTerminalSize()).toEqual({ cols: 100, rows: 30 });
  });

  it('override persists across multiple getTerminalSize calls', () => {
    setTerminalSizeOverride({ cols: 200, rows: 50 });
    expect(getTerminalSize()).toEqual({ cols: 200, rows: 50 });
    expect(getTerminalSize()).toEqual({ cols: 200, rows: 50 });
  });
});

describe('onResize()', () => {
  function createMockStdout(columns = 100, rows = 30) {
    const listeners = new Map<string, Set<() => void>>();
    const mockStdout = {
      columns,
      rows,
      on: vi.fn((event: string, cb: () => void) => {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)!.add(cb);
      }),
      removeListener: vi.fn((event: string, cb: () => void) => {
        listeners.get(event)?.delete(cb);
      }),
    };
    const emit = (event: string) => {
      listeners.get(event)?.forEach((cb) => cb());
    };
    return { mockStdout, emit };
  }

  it('fires callback on resize event', () => {
    const { mockStdout, emit } = createMockStdout(100, 30);
    vi.stubGlobal('process', { stdout: mockStdout });

    const cb = vi.fn();
    onResize(cb);
    emit('resize');

    expect(cb).toHaveBeenCalledOnce();
    expect(cb).toHaveBeenCalledWith({ cols: 100, rows: 30 });
  });

  it('unsubscribe stops callbacks', () => {
    const { mockStdout, emit } = createMockStdout(100, 30);
    vi.stubGlobal('process', { stdout: mockStdout });

    const cb = vi.fn();
    const unsub = onResize(cb);
    unsub();
    emit('resize');

    expect(cb).not.toHaveBeenCalled();
  });

  it('returns no-op unsubscribe when stdout lacks on method', () => {
    vi.stubGlobal('process', { stdout: {} });

    const cb = vi.fn();
    const unsub = onResize(cb);

    expect(() => unsub()).not.toThrow();
    expect(cb).not.toHaveBeenCalled();
  });

  it('callback receives override size during resize', () => {
    const { mockStdout, emit } = createMockStdout(100, 30);
    vi.stubGlobal('process', { stdout: mockStdout });

    setTerminalSizeOverride({ cols: 200, rows: 50 });

    const cb = vi.fn();
    onResize(cb);
    emit('resize');

    expect(cb).toHaveBeenCalledWith({ cols: 200, rows: 50 });
  });
});
