import { afterEach, describe, expect, it } from 'vitest';
import { createPtyHarness, type PtyHarness } from '../pty.js';

const activeHarnesses: PtyHarness[] = [];

afterEach(() => {
  for (const harness of activeHarnesses.splice(0)) harness.dispose();
});

describe('PTY harness', () => {
  it('captures output, accepts input, resizes, and observes exit', async () => {
    const program = [
      "process.stdin.setEncoding('utf8')",
      "console.log('celestial-ready')",
      "process.stdin.on('data', chunk => { const value = chunk.trim(); console.log('input:' + value); if (value === 'quit') process.exit(0) })",
    ].join(';');
    const harness = await createPtyHarness({ command: process.execPath, args: ['-e', program], timeoutMs: 10_000 });
    activeHarnesses.push(harness);

    await expect(harness.waitForText('celestial-ready')).resolves.toContain('celestial-ready');
    harness.resize(100, 30);
    harness.write('hello\r');
    await expect(harness.waitForText('input:hello')).resolves.toContain('input:hello');
    harness.write('quit\r');
    await expect(harness.waitForExit()).resolves.toMatchObject({ exitCode: 0 });
  });
});
