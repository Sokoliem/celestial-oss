import { fileURLToPath } from 'node:url';
import { createPtyHarness } from '@celestial/test/pty';
import { describe, expect, it } from 'vitest';

const packageRoot = fileURLToPath(new URL('../..', import.meta.url));
const fixture = fileURLToPath(new URL('./fixtures/prompt-cli.mjs', import.meta.url));

function harnessFor(mode: 'flow' | 'cancel') {
  return createPtyHarness({
    command: process.execPath,
    args: [fixture, mode],
    cwd: packageRoot,
    cols: 80,
    rows: 24,
    timeoutMs: 20_000,
  });
}

describe('inlinePrompt PTY (real terminal process)', () => {
  it('runs text → select → confirm inline and leaves every answer in scrollback', async () => {
    const harness = await harnessFor('flow');
    try {
      await harness.waitForText('Project name');
      harness.write('demo-app');
      harness.write('\r');

      await harness.waitForText('NAME=demo-app');
      // Inline mode: the completed question stays visible in scrollback,
      // instead of an alternate screen erasing it.
      await harness.waitForText('Project name');

      await harness.waitForText('Target');
      harness.write('\x1b[B'); // down to Bun Native
      harness.write('\r');
      await harness.waitForText('TARGET=bun');

      await harness.waitForText('Deploy?');
      harness.write('\r'); // accept the default Yes
      await harness.waitForText('DEPLOY=true');
      await harness.waitForText('FLOW-COMPLETE');
    } finally {
      harness.kill();
    }
    expect(true).toBe(true);
  }, 30_000);

  it('rejects Escape with PromptCancelledError instead of exiting the process abnormally', async () => {
    const harness = await harnessFor('cancel');
    try {
      await harness.waitForText('Secret');
      harness.write('\x1b');
      await harness.waitForText('CANCELLED');
    } finally {
      harness.kill();
    }
    expect(true).toBe(true);
  }, 30_000);
});
