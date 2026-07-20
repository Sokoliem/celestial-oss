import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill = vi.fn();
}

describe('win32 input debug logging', () => {
  const originalDebugInput = process.env.CELESTIAL_DEBUG_INPUT;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    delete process.env.CELESTIAL_DEBUG_INPUT;
  });

  afterEach(() => {
    vi.doUnmock('node:child_process');
    vi.resetModules();
    if (originalDebugInput === undefined) {
      delete process.env.CELESTIAL_DEBUG_INPUT;
    } else {
      process.env.CELESTIAL_DEBUG_INPUT = originalDebugInput;
    }
  });

  it('does not write bridge diagnostics unless input debugging is enabled', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const child = new FakeChild();
    const spawnMock = vi.fn(() => child);
    vi.doMock('node:child_process', () => ({ spawn: spawnMock }));
    const { createWin32InputBridge } = await import('../win32-input.js');

    const bridge = createWin32InputBridge();
    expect(bridge.start()).toBe(true);

    child.stdout.emit('data', Buffer.from('OK 8 664'));
    child.stderr.emit('data', Buffer.from('bridge warning'));
    child.emit('exit', 1);

    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('writes bridge diagnostics when input debugging is enabled', async () => {
    process.env.CELESTIAL_DEBUG_INPUT = '1';
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const child = new FakeChild();
    const spawnMock = vi.fn(() => child);
    vi.doMock('node:child_process', () => ({ spawn: spawnMock }));
    const { createWin32InputBridge } = await import('../win32-input.js');

    const bridge = createWin32InputBridge();
    expect(bridge.start()).toBe(true);

    child.stdout.emit('data', Buffer.from('OK 8 664'));
    child.stderr.emit('data', Buffer.from('bridge warning'));
    child.emit('exit', 1);

    expect(stderrSpy).toHaveBeenCalledWith('[win32-mouse] OK 8 664\n');
    expect(stderrSpy).toHaveBeenCalledWith('[win32-mouse-err] bridge warning\n');
    expect(stderrSpy).toHaveBeenCalledWith('[win32-mouse] bridge exited with code 1\n');
  });
});
