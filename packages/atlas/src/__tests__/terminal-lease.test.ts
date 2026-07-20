import { describe, expect, it, vi } from 'vitest';
import { acquireTerminalLease } from '../terminal-lease.js';

function fakeTerminal(options: { raw?: boolean; flowing?: boolean | null } = {}) {
  const terminal = {
    isRaw: options.raw ?? false,
    readableFlowing: options.flowing ?? false,
    setRawMode: vi.fn((raw: boolean) => {
      terminal.isRaw = raw;
    }),
    resume: vi.fn(),
    pause: vi.fn(),
  };
  return terminal;
}

describe('terminal leases', () => {
  it('restores raw and flowing state only after the final owner releases', () => {
    const terminal = fakeTerminal();
    const appLease = acquireTerminalLease(terminal as never);
    const queryLease = acquireTerminalLease(terminal as never);

    expect(terminal.setRawMode).toHaveBeenCalledTimes(1);
    expect(terminal.resume).toHaveBeenCalledTimes(1);
    appLease.release();
    expect(terminal.setRawMode).toHaveBeenCalledTimes(1);
    expect(terminal.pause).not.toHaveBeenCalled();

    queryLease.release();
    expect(terminal.setRawMode).toHaveBeenLastCalledWith(false);
    expect(terminal.pause).toHaveBeenCalledTimes(1);
  });

  it('is idempotent and does not pause a stream that was already flowing', () => {
    const terminal = fakeTerminal({ raw: true, flowing: true });
    const lease = acquireTerminalLease(terminal as never);
    lease.release();
    lease.release();

    expect(lease.released).toBe(true);
    expect(terminal.setRawMode).toHaveBeenLastCalledWith(true);
    expect(terminal.pause).not.toHaveBeenCalled();
  });
});
