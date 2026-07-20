import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectCapabilitiesAsync, queryDeviceAttributes, querySecondaryAttributes } from '../query.js';

function createMockStreams(options?: { isTTY?: boolean }) {
  const isTTY = options?.isTTY ?? true;
  const dataListeners: Array<(data: Buffer) => void> = [];

  const stdin = {
    isTTY,
    isRaw: false,
    setRawMode: vi.fn((mode: boolean) => {
      stdin.isRaw = mode;
    }),
    resume: vi.fn(),
    pause: vi.fn(),
    on: vi.fn((_event: string, cb: (data: Buffer) => void) => {
      if (_event === 'data') dataListeners.push(cb);
    }),
    removeListener: vi.fn((_event: string, cb: (data: Buffer) => void) => {
      const idx = dataListeners.indexOf(cb);
      if (idx >= 0) dataListeners.splice(idx, 1);
    }),
  };

  const stdout = {
    isTTY,
    write: vi.fn(() => true),
  };

  const emit = (data: string): void => {
    for (const listener of [...dataListeners]) {
      listener(Buffer.from(data));
    }
  };

  return { stdin, stdout, emit };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('queryDeviceAttributes()', () => {
  it('returns null when stdin is not TTY', async () => {
    const { stdin, stdout } = createMockStreams({ isTTY: false });
    const result = await queryDeviceAttributes({ stdin: stdin as any, stdout: stdout as any });
    expect(result).toBeNull();
  });

  it('sends DA1 escape sequence', async () => {
    const { stdin, stdout, emit } = createMockStreams();
    const promise = queryDeviceAttributes({ stdin: stdin as any, stdout: stdout as any, timeout: 100 });
    emit('\x1b[?1;2c');
    await promise;
    expect(stdout.write).toHaveBeenCalledWith('\x1b[c');
  });

  it('parses DA1 response with sixel attribute', async () => {
    const { stdin, stdout, emit } = createMockStreams();
    const promise = queryDeviceAttributes({ stdin: stdin as any, stdout: stdout as any, timeout: 100 });
    emit('\x1b[?1;2;4c');
    const result = await promise;
    expect(result).not.toBeNull();
    expect(result!.sixel).toBe(true);
    expect(result!.attributes).toEqual([1, 2, 4]);
    expect(result!.raw).toBe('\x1b[?1;2;4c');
  });

  it('returns sixel false when attr 4 missing', async () => {
    const { stdin, stdout, emit } = createMockStreams();
    const promise = queryDeviceAttributes({ stdin: stdin as any, stdout: stdout as any, timeout: 100 });
    emit('\x1b[?1;2c');
    const result = await promise;
    expect(result).not.toBeNull();
    expect(result!.sixel).toBe(false);
  });

  it('returns null on timeout', async () => {
    vi.useFakeTimers();
    const { stdin, stdout } = createMockStreams();
    const promise = queryDeviceAttributes({ stdin: stdin as any, stdout: stdout as any, timeout: 100 });
    vi.advanceTimersByTime(200);
    const result = await promise;
    expect(result).toBeNull();
  });
});

describe('querySecondaryAttributes()', () => {
  it('returns null when not TTY', async () => {
    const { stdin, stdout } = createMockStreams({ isTTY: false });
    const result = await querySecondaryAttributes({ stdin: stdin as any, stdout: stdout as any });
    expect(result).toBeNull();
  });

  it('sends DA2 escape sequence', async () => {
    const { stdin, stdout, emit } = createMockStreams();
    const promise = querySecondaryAttributes({ stdin: stdin as any, stdout: stdout as any, timeout: 100 });
    emit('\x1b[>1;234;0c');
    await promise;
    expect(stdout.write).toHaveBeenCalledWith('\x1b[>c');
  });

  it('parses DA2 response', async () => {
    const { stdin, stdout, emit } = createMockStreams();
    const promise = querySecondaryAttributes({ stdin: stdin as any, stdout: stdout as any, timeout: 100 });
    emit('\x1b[>1;234;0c');
    const result = await promise;
    expect(result).not.toBeNull();
    expect(result!.terminalType).toBe(1);
    expect(result!.firmwareVersion).toBe(234);
    expect(result!.romCartridgeRegistration).toBe(0);
  });

  it('returns null on timeout', async () => {
    vi.useFakeTimers();
    const { stdin, stdout } = createMockStreams();
    const promise = querySecondaryAttributes({ stdin: stdin as any, stdout: stdout as any, timeout: 100 });
    vi.advanceTimersByTime(200);
    const result = await promise;
    expect(result).toBeNull();
  });
});

describe('detectCapabilitiesAsync()', () => {
  it('returns sync result for kitty (high-confidence)', async () => {
    const { stdin, stdout } = createMockStreams({ isTTY: false });
    const result = await detectCapabilitiesAsync({
      stdin: stdin as any,
      stdout: stdout as any,
      env: { TERM_PROGRAM: 'kitty' },
    });
    expect(result.kittyGraphics).toBe(true);
    expect(result.terminalName).toBe('kitty');
  });

  it('augments with sixel from DA1', async () => {
    const { stdin, stdout, emit } = createMockStreams();
    const promise = detectCapabilitiesAsync({
      stdin: stdin as any,
      stdout: stdout as any,
      env: {},
      timeout: 100,
    });
    emit('\x1b[?1;2;4c');
    const result = await promise;
    expect(result.sixelGraphics).toBe(true);
  });

  it('saves and restores raw mode', async () => {
    const { stdin, stdout, emit } = createMockStreams();
    const promise = queryDeviceAttributes({ stdin: stdin as any, stdout: stdout as any, timeout: 100 });
    expect(stdin.setRawMode).toHaveBeenCalledWith(true);
    emit('\x1b[?1;2c');
    await promise;
    expect(stdin.setRawMode).toHaveBeenCalledWith(false);
  });
});
