import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPtyHarness } from '../pty.js';

const mockedPty = vi.hoisted(() => {
  let exitListener: ((event: { exitCode: number; signal?: number }) => void) | undefined;
  const kill = vi.fn();
  const disposeConoutWorker = vi.fn();
  const spawn = vi.fn(() => ({
    pid: 42,
    _agent: { _conoutSocketWorker: { dispose: disposeConoutWorker } },
    write: vi.fn(),
    resize: vi.fn(),
    kill,
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    onExit: vi.fn((listener: typeof exitListener) => {
      exitListener = listener;
      return { dispose: vi.fn() };
    }),
  }));
  return {
    disposeConoutWorker,
    kill,
    spawn,
    emitExit(event: { exitCode: number; signal?: number }) {
      exitListener?.(event);
    },
    reset() {
      exitListener = undefined;
      kill.mockClear();
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
});
