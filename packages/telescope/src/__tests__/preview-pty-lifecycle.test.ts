import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPtyHarness } from '../pty.js';

const mockedPty = vi.hoisted(() => {
  let dataListener: ((data: string) => void) | undefined;
  let exitListener: ((event: { exitCode: number; signal?: number }) => void) | undefined;
  const kill = vi.fn();
  const resize = vi.fn();
  const disposeConoutWorker = vi.fn();
  const spawn = vi.fn(() => ({
    pid: 42,
    _agent: { _conoutSocketWorker: { dispose: disposeConoutWorker } },
    write: vi.fn(),
    resize,
    kill,
    onData: vi.fn((listener: typeof dataListener) => {
      dataListener = listener;
      return { dispose: vi.fn() };
    }),
    onExit: vi.fn((listener: typeof exitListener) => {
      exitListener = listener;
      return { dispose: vi.fn() };
    }),
  }));
  return {
    disposeConoutWorker,
    kill,
    resize,
    spawn,
    emitData(data: string) {
      dataListener?.(data);
    },
    emitExit(event: { exitCode: number; signal?: number }) {
      exitListener?.(event);
    },
    reset() {
      dataListener = undefined;
      exitListener = undefined;
      kill.mockClear();
      resize.mockClear();
      disposeConoutWorker.mockClear();
      spawn.mockClear();
    },
  };
});

vi.mock('node-pty', () => ({ spawn: mockedPty.spawn }));

beforeEach(() => mockedPty.reset());

describe('PTY lifecycle cleanup', () => {
  it('kills a live child when disposed and remains idempotent', async () => {
    const harness = await createPtyHarness({ command: 'mock-command' });

    harness.dispose();
    harness.dispose();

    expect(mockedPty.kill).toHaveBeenCalledTimes(1);
  });

  it('closes the ConPTY host after a clean Windows child exit', async () => {
    const harness = await createPtyHarness({ command: 'mock-command' });
    mockedPty.emitExit({ exitCode: 0 });

    await expect(harness.waitForExit()).resolves.toEqual({ exitCode: 0 });
    harness.dispose();

    expect(mockedPty.disposeConoutWorker).toHaveBeenCalledTimes(process.platform === 'win32' ? 1 : 0);
    expect(mockedPty.kill).not.toHaveBeenCalled();
  });

  it('validates spawn and resize dimensions before calling node-pty', async () => {
    await expect(createPtyHarness({ command: 'mock-command', cols: Number.NaN })).rejects.toThrow(/columns must be/i);
    await expect(createPtyHarness({ command: 'mock-command', maxBufferBytes: 0 })).rejects.toThrow(/maxBufferBytes must be/i);
    expect(mockedPty.spawn).not.toHaveBeenCalled();

    const harness = await createPtyHarness({ command: 'mock-command' });
    expect(() => harness.resize(Number.POSITIVE_INFINITY, 10)).toThrow(/columns must be/i);
    expect(() => harness.resize(10, 0.5)).toThrow(/rows must be/i);
    expect(mockedPty.resize).not.toHaveBeenCalled();
    harness.dispose();
  });

  it('retains a valid UTF-8 transcript tail within the byte budget', async () => {
    const harness = await createPtyHarness({ command: 'mock-command', maxBufferBytes: 5 });

    mockedPty.emitData('A界🙂Z');

    expect(harness.output()).toBe('🙂Z');
    expect(Buffer.byteLength(harness.output(), 'utf8')).toBeLessThanOrEqual(5);
    harness.dispose();
  });

  it('rejects unmatched text waits as soon as the child exits', async () => {
    const harness = await createPtyHarness({ command: 'mock-command' });
    const waiting = expect(harness.waitForText('never')).rejects.toThrow(/exited with code 3/i);

    mockedPty.emitExit({ exitCode: 3 });

    await waiting;
    harness.dispose();
  });

  it('rejects pending waits immediately when disposed', async () => {
    const harness = await createPtyHarness({ command: 'mock-command' });
    const waitingForText = expect(harness.waitForText('never')).rejects.toThrow(/disposed/i);
    const waitingForExit = expect(harness.waitForExit()).rejects.toThrow(/disposed/i);

    harness.dispose();

    await Promise.all([waitingForText, waitingForExit]);
  });

  it('supports aborting pending waits and leaves later waits usable', async () => {
    const harness = await createPtyHarness({ command: 'mock-command' });
    const controller = new AbortController();
    const waiting = expect(harness.waitForText('ready', { signal: controller.signal })).rejects.toThrow(/cancelled/i);

    controller.abort(new Error('cancelled by test'));
    await waiting;
    mockedPty.emitData('ready');
    await expect(harness.waitForText(/ready/g)).resolves.toContain('ready');
    await expect(harness.waitForText(/ready/g)).resolves.toContain('ready');
    harness.dispose();
  });

  it('accepts a receipt present when the timeout callback performs its final check', async () => {
    vi.useFakeTimers();
    try {
      const harness = await createPtyHarness({ command: 'mock-command', timeoutMs: 10 });
      const waiting = harness.waitForText('deadline receipt');

      // Advance to the deadline without awaiting timer dispatch, then deliver
      // the receipt in the same turn. The timeout callback must inspect the
      // latest transcript instead of unconditionally rejecting.
      const advancing = vi.advanceTimersByTimeAsync(10);
      mockedPty.emitData('deadline receipt');

      await advancing;
      await expect(waiting).resolves.toContain('deadline receipt');
      harness.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});
