import { fileURLToPath } from 'node:url';
import { createPtyHarness } from '@celestial/test/pty';
import { describe, expect, it } from 'vitest';

describe('Celestial Flight Deck PTY', () => {
  it('launches, opens the keyboard-backed context menu, changes lab and breakpoint, opens contextual help, and exits cleanly', async () => {
    const packageRoot = fileURLToPath(new URL('../..', import.meta.url));
    const harness = await createPtyHarness({
      command: process.execPath,
      args: ['dist/index.js'],
      cwd: packageRoot,
      cols: 140,
      rows: 42,
      timeoutMs: 10_000,
      env: { CELESTIAL_DEMO_FAST: '1' },
    });

    try {
      await harness.waitForText('CELESTIAL FLIGHT DECK');
      await harness.waitForText('WIDE / floating');
      // F10 is the compatibility form of the Shift+F10 context-menu gesture.
      // ConPTY does not preserve synthetic Shift modifiers consistently.
      harness.write('\u001b[21~');
      await harness.waitForText('Open Core help');
      harness.write('\u001b');
      // The status-bar diff may repaint that receipt in non-contiguous chunks.
      // A lab shortcut only works after Escape dismisses the topmost menu, so
      // the next assertion verifies the state transition behaviorally.
      await new Promise<void>((resolve) => setTimeout(resolve, 75));
      harness.write('7');
      // Incremental terminal diffs do not guarantee that a replaced heading is
      // emitted as one contiguous chunk. This window body is newly painted and
      // therefore a stable transcript receipt for the lab switch.
      await harness.waitForText('Live instrument bus');
      harness.resize(70, 32);
      await harness.waitForText('COMPACT / single');
      harness.write('?');
      await harness.waitForText('Windows help');
      harness.write('\u001b');
      // Wait for Escape to be consumed before sending q. Without an output
      // receipt ConPTY may coalesce the writes into Alt+Q, which correctly
      // does not match the plain quit binding.
      await harness.waitForText('Closed contextual help.');
      harness.write('q');
      const exit = await harness.waitForExit();
      expect(exit.exitCode).toBe(0);
    } finally {
      harness.dispose();
    }
  }, 15_000);
});
