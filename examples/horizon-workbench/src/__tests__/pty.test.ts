import { fileURLToPath } from 'node:url';
import { createPtyHarness } from '@celestial/test/pty';
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
      // Nebula catches render errors and keeps the app alive, so a broken frame
      // would otherwise still exit 0. The transcript is ANSI-stripped, so the
      // runtime's diagnostic row and the demo's stderr both arrive as plain text.
      expect(harness.output()).not.toContain('render error:');
      expect(harness.output()).not.toContain(' Error: ');
      expect(exit.exitCode).toBe(0);
    } finally {
      harness.dispose();
    }
  }, 15_000);
});
