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

  it('waits for output produced after a mark, ignoring identical earlier output', async () => {
    const program = ["process.stdin.setEncoding('utf8')", "console.log('ready')", "process.stdin.on('data', () => { console.log('tick') })"].join(';');
    const harness = await createPtyHarness({ command: process.execPath, args: ['-e', program], timeoutMs: 10_000 });
    activeHarnesses.push(harness);

    await harness.waitForText('ready');
    harness.write('a\r');
    await harness.waitForText('tick');

    // 'tick' is already in the transcript, so a plain waitForText would resolve
    // instantly and synchronise nothing. Marking first makes the wait mean
    // "a *new* tick", which is what a test driving a repeated action needs.
    const mark = harness.mark();
    harness.write('b\r');
    await expect(harness.waitForText('tick', { since: mark })).resolves.toContain('tick');
  });

  it('keeps marks valid when the rolling transcript evicts older output', async () => {
    const program = [
      "process.stdin.setEncoding('utf8')",
      "console.log('boot:' + 'b'.repeat(600) + ':ready')",
      "process.stdin.on('data', () => { console.log('eviction-target'); console.log('p'.repeat(300)); console.log('eviction-end') })",
    ].join(';');
    const harness = await createPtyHarness({ command: process.execPath, args: ['-e', program], timeoutMs: 10_000, maxBufferBytes: 512 });
    activeHarnesses.push(harness);

    await harness.waitForText('ready');
    // The 600-character boot banner has already capped the 512-byte rolling
    // tail, so every character of the reply below evicts one from the front.
    // A tail-relative mark would point past 'eviction-target' once the window
    // shifts (observed as waitForText timing out while the text sits plainly
    // in the transcript); an absolute mark still finds it.
    const mark = harness.mark();
    harness.write('a\r');
    await expect(harness.waitForText('eviction-target', { since: mark })).resolves.toContain('eviction-target');
    await expect(harness.waitForText('eviction-end', { since: mark })).resolves.toContain('eviction-end');
  });
});
