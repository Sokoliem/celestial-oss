import { createPtyHarness } from '@celestial/test/pty';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('Horizon workbench PTY', () => {
  it('switches workspace, crosses a breakpoint, opens a drawer, and exits cleanly', async () => {
    const packageRoot = fileURLToPath(new URL('../..', import.meta.url));
    const harness = await createPtyHarness({
      command: process.execPath,
      args: ['dist/index.js'],
      cwd: packageRoot,
      cols: 140,
      rows: 40,
      timeoutMs: 10_000,
      env: { CELESTIAL_DEMO_FAST: '1' },
    });

    try {
      await harness.waitForText('Celestial Horizon Workbench');
      harness.write('2');
      await harness.waitForText('Observe workspace');
      harness.resize(70, 24);
      harness.write('i');
      await harness.waitForText('Inspector');
      harness.write('\u001b');
      await harness.waitForText('Inspector dismissed with Escape.');
      harness.write('q');
      const exit = await harness.waitForExit();
      expect(exit.exitCode).toBe(0);
    } finally {
      harness.dispose();
    }
  }, 15_000);
});
