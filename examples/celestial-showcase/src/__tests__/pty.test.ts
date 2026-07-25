import { fileURLToPath } from 'node:url';
import { createPtyHarness } from '@celestial/test/pty';
import { describe, expect, it } from 'vitest';

describe('Celestial Flight Deck PTY', () => {
  it('launches, traverses every lab and its deep instruments, resizes, opens help, and exits cleanly', async () => {
    const packageRoot = fileURLToPath(new URL('../..', import.meta.url));
    const harness = await createPtyHarness({
      command: process.execPath,
      args: ['dist/index.js'],
      cwd: packageRoot,
      cols: 140,
      rows: 42,
      timeoutMs: 15_000,
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
      // Sub-page keys and lab shortcuts are both swallowed while a context menu is
      // open, so the 'Locale scope |' assertion below verifies the Escape behaviorally
      // rather than asserting on a status-bar receipt that may repaint in chunks.
      await new Promise<void>((resolve) => setTimeout(resolve, 75));

      harness.write('l');
      await harness.waitForText('Locale scope |');
      harness.write('g');
      await harness.waitForText('@celestial/atlas');
      harness.write('2');
      await harness.waitForText('Run headless checks');
      harness.write(']');
      await harness.waitForText('checkboxGroup()');
      harness.write('3');
      await harness.waitForText('Release preferences');
      harness.write(']');
      await harness.waitForText('Validation accepted');
      harness.write(']');
      // Headings replace in place and are not guaranteed to reach the transcript as one
      // contiguous chunk, so each deep instrument below is confirmed by a freshly
      // painted body receipt instead of its title.
      await harness.waitForText('Single + multi select');
      harness.write('4');
      await harness.waitForText('Stellar line chart');
      harness.write(']');
      await harness.waitForText('semantic terminal light');
      harness.write(']');
      await harness.waitForText('Heatmap + sparkline');
      harness.write(']');
      await harness.waitForText('Document receipts');
      harness.write('5');
      await harness.waitForText('verification receipt');
      harness.write('6');
      await harness.waitForText('Base application - should never disappear');
      harness.write('7');
      // Incremental terminal diffs do not guarantee that a replaced heading is
      // emitted as one contiguous chunk. This window body is newly painted and
      // therefore a stable transcript receipt for the lab switch.
      await harness.waitForText('Live instrument bus');
      harness.write(']');
      await harness.waitForText('saved sessions');
      harness.write('v');
      await harness.waitForText('snap zone and tile layout.');
      harness.write('8');
      await harness.waitForText('Component changed');
      harness.write('7');
      await new Promise<void>((resolve) => setTimeout(resolve, 75));
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
  }, 20_000);
});
