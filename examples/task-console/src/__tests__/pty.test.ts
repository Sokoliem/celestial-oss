import { createPtyHarness } from '@celestial/test/pty';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('task console PTY', () => {
  it('shows the intentional failure, retries it, and exits cleanly', async () => {
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
      await harness.waitForText('Celestial Task Console');
      harness.write('\u001b[B');
      await harness.waitForText('test failed on attempt 1');
      harness.write('r');
      await harness.waitForText('test passed');
      harness.write('q');
      const exit = await harness.waitForExit();
      expect(exit.exitCode).toBe(0);
    } finally {
      harness.dispose();
    }
  }, 15_000);
});
