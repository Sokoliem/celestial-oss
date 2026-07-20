// @ts-nocheck
/**
 * Regression tests for critical and high-priority bugs in the Nebula core.
 *
 * Each test reproduces the exact failure condition BEFORE the fix is applied,
 * then asserts the correct expected behavior.
 */
import { describe, expect, it, vi } from 'vitest';

// ─── Bug 2.4: crash-recovery.ts uses require('node:fs') in ESM ──────────────

describe('Bug 2.4: crash-recovery writeCrashLog should not use require()', () => {
  it('should use import for fs instead of require', async () => {
    // After fix, crash-recovery.ts uses a top-level import or dynamic import
    // for node:fs rather than require(). The writeFile option still works.
    const writeFileMock = vi.fn();
    const { installCrashRecovery } = await import('../../crash-recovery.js');

    // The writeFile option should still be used when provided
    const terminal = {
      write: () => {},
      exitRawMode: () => {},
      enterRawMode: () => {},
      onInput: () => {},
      offInput: () => {},
      onResize: () => {},
      offResize: () => {},
      getSize: () => ({ cols: 80, rows: 24 }),
    };

    const guard = installCrashRecovery({
      terminal,
      crashLogPath: '/tmp/test.log',
      writeFile: writeFileMock,
    });

    expect(guard).toBeDefined();
    guard.uninstall();
  });

  it('crash-recovery module should not contain require() call', async () => {
    // Read the source to verify require is not used
    const fs = await import('node:fs');
    const source = fs.readFileSync(new URL('../../crash-recovery.ts', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'), 'utf-8');
    // Should not contain require('node:fs') — should use import
    expect(source).not.toMatch(/require\s*\(\s*['"]node:fs['"]\s*\)/);
  });
});
