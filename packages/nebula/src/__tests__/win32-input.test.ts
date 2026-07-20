/**
 * Tests for the Win32 console input bridge.
 *
 * Tests the lifecycle, handler management, and platform detection.
 * These tests don't require a real Windows console or PowerShell.
 */

import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWin32InputBridge, needsWin32InputBridge } from '../win32-input.js';

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill = vi.fn();
}

async function createBridgeWithMockedSpawn() {
  const child = new FakeChild();
  const spawnMock = vi.fn(() => child);
  vi.resetModules();
  vi.doMock('node:child_process', () => ({ spawn: spawnMock }));
  const { createWin32InputBridge: createMockedBridge } = await import('../win32-input.js');
  return { bridge: createMockedBridge(), child, spawnMock };
}

afterEach(() => {
  vi.doUnmock('node:child_process');
  vi.restoreAllMocks();
  vi.resetModules();
});

// ─── needsWin32InputBridge ────────────────────────────────────────────────

describe('needsWin32InputBridge', () => {
  it('returns a boolean based on platform and TTY state', () => {
    const result = needsWin32InputBridge();
    if (process.platform === 'win32' && process.stdin?.isTTY) {
      expect(result).toBe(true);
    } else if (process.platform !== 'win32') {
      expect(result).toBe(false);
    }
    // On win32 without TTY (e.g., in CI), result could be false — both are valid
    expect(typeof result).toBe('boolean');
  });

  it('can be disabled for nested PTY environments', () => {
    const original = process.env.CELESTIAL_DISABLE_WIN32_INPUT_BRIDGE;
    process.env.CELESTIAL_DISABLE_WIN32_INPUT_BRIDGE = '1';
    try {
      expect(needsWin32InputBridge()).toBe(false);
    } finally {
      if (original === undefined) delete process.env.CELESTIAL_DISABLE_WIN32_INPUT_BRIDGE;
      else process.env.CELESTIAL_DISABLE_WIN32_INPUT_BRIDGE = original;
    }
  });
});

// ─── createWin32InputBridge lifecycle ─────────────────────────────────────

describe('createWin32InputBridge', () => {
  it('creates a bridge in non-running state', () => {
    const bridge = createWin32InputBridge();
    expect(bridge.running).toBe(false);
  });

  it('registers and removes data handlers', () => {
    const bridge = createWin32InputBridge();
    const handler = (_data: Buffer) => {};
    // Should not throw
    bridge.onData(handler);
    bridge.offData(handler);
  });

  it('registers and removes resize handlers', () => {
    const bridge = createWin32InputBridge();
    const handler = (_cols: number, _rows: number) => {};
    bridge.onResize(handler);
    bridge.offResize(handler);
  });

  it('registers and removes error handlers', () => {
    const bridge = createWin32InputBridge();
    const handler = () => {};
    bridge.onError(handler);
    bridge.offError(handler);
  });

  it('stop does not throw when not started', () => {
    const bridge = createWin32InputBridge();
    expect(() => bridge.stop()).not.toThrow();
    expect(bridge.running).toBe(false);
  });

  it('start is idempotent when already running', async () => {
    const { bridge, child, spawnMock } = await createBridgeWithMockedSpawn();
    const first = bridge.start();
    const second = bridge.start();

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(spawnMock).toHaveBeenCalledTimes(1);

    bridge.stop();
    expect(child.kill).toHaveBeenCalledOnce();
    expect(bridge.running).toBe(false);
  });
});
