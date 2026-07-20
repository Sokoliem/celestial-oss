import { createPtyHarness } from '@celestial/test/pty';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('API inspector PTY', () => {
  it('starts its loopback server, sends health, and exits cleanly', async () => {
    const packageRoot = fileURLToPath(new URL('../..', import.meta.url));
    const harness = await createPtyHarness({
      command: process.execPath,
      args: ['dist/index.js'],
      cwd: packageRoot,
      cols: 100,
      rows: 30,
      timeoutMs: 10_000,
      env: { CELESTIAL_DEMO_FAST: '1' },
    });

    try {
      await harness.waitForText('Celestial API Inspector');
      await harness.waitForText('ready');
      harness.write('s');
      await harness.waitForText('200 OK');
      harness.write('q');
      const exit = await harness.waitForExit();
      expect(exit.exitCode).toBe(0);
    } finally {
      harness.dispose();
    }
  }, 15_000);
});
