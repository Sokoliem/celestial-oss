import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerAll } from '../../spinner/engine.js';
import { createSpinner } from '../../spinner/runner.js';
import type { SpinnerDefinition } from '../../spinner/types.js';

// Register test spinners
const testSpinner: SpinnerDefinition = { name: 'testDots', frames: ['⠋', '⠙', '⠹'], interval: 50 };
registerAll({ testDots: testSpinner });

describe('createSpinner', () => {
  let output: string[];
  let stream: NodeJS.WritableStream;

  beforeEach(() => {
    output = [];
    stream = {
      write(chunk: string): boolean {
        output.push(chunk);
        return true;
      },
      // Minimal writable stream mock
    } as unknown as NodeJS.WritableStream;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a spinner instance', () => {
    const s = createSpinner('testDots', { stream, hideCursor: false });
    expect(s).toBeDefined();
    expect(s.isSpinning).toBe(false);
  });

  it('starts and stops spinning', () => {
    const s = createSpinner('testDots', { stream, hideCursor: false });
    s.start();
    expect(s.isSpinning).toBe(true);
    s.stop();
    expect(s.isSpinning).toBe(false);
  });

  it('writes frames on interval', () => {
    const s = createSpinner('testDots', { stream, hideCursor: false, text: 'loading' });
    s.start();
    // Initial frame written immediately
    expect(output.some((o) => o.includes('⠋'))).toBe(true);
    expect(output.some((o) => o.includes('loading'))).toBe(true);

    // Advance timer
    vi.advanceTimersByTime(50);
    expect(output.some((o) => o.includes('⠙'))).toBe(true);

    vi.advanceTimersByTime(50);
    expect(output.some((o) => o.includes('⠹'))).toBe(true);

    s.stop();
  });

  it('succeed shows success symbol', () => {
    const s = createSpinner('testDots', { stream, hideCursor: false });
    s.start('doing work');
    s.succeed('done!');
    expect(s.isSpinning).toBe(false);
    const fullOutput = output.join('');
    expect(fullOutput).toContain('done!');
  });

  it('fail shows error symbol', () => {
    const s = createSpinner('testDots', { stream, hideCursor: false });
    s.start('trying');
    s.fail('failed!');
    expect(s.isSpinning).toBe(false);
    const fullOutput = output.join('');
    expect(fullOutput).toContain('failed!');
  });

  it('warn shows warning symbol', () => {
    const s = createSpinner('testDots', { stream, hideCursor: false });
    s.start();
    s.warn('careful!');
    const fullOutput = output.join('');
    expect(fullOutput).toContain('careful!');
  });

  it('info shows info symbol', () => {
    const s = createSpinner('testDots', { stream, hideCursor: false });
    s.start();
    s.info('fyi');
    const fullOutput = output.join('');
    expect(fullOutput).toContain('fyi');
  });

  it('update changes text while spinning', () => {
    const s = createSpinner('testDots', { stream, hideCursor: false, text: 'first' });
    s.start();
    expect(output.some((o) => o.includes('first'))).toBe(true);

    s.update('second');
    expect(output.some((o) => o.includes('second'))).toBe(true);
    s.stop();
  });

  it('setSpinner changes the spinner type', () => {
    const altSpinner: SpinnerDefinition = { name: 'alt', frames: ['X', 'Y'], interval: 100 };
    registerAll({ alt: altSpinner });

    const s = createSpinner('testDots', { stream, hideCursor: false });
    s.start();
    output = []; // clear output from testDots frames
    s.setSpinner('alt');

    // setSpinner writes the first frame immediately (tick=0 → 'X')
    const fullOutput = output.join('');
    expect(fullOutput).toContain('X');
    s.stop();
  });

  it('supports custom spinner definition directly', () => {
    const custom: SpinnerDefinition = { name: 'inline', frames: ['★', '☆'], interval: 100 };
    const s = createSpinner(custom, { stream, hideCursor: false });
    s.start();
    expect(output.some((o) => o.includes('★'))).toBe(true);
    s.stop();
  });

  it('throws for unknown spinner name', () => {
    expect(() => createSpinner('nonexistent_spinner_xyz', { stream })).toThrow('Unknown spinner');
  });

  it('chains methods fluently', () => {
    const s = createSpinner('testDots', { stream, hideCursor: false });
    const result = s.start('hello').update('world').stop();
    expect(result).toBe(s);
  });

  it('start is idempotent when already spinning', () => {
    const s = createSpinner('testDots', { stream, hideCursor: false });
    s.start();
    const outputBefore = output.length;
    s.start(); // should be no-op
    // Should not have written additional cursor-hide sequence
    expect(output.length).toBe(outputBefore);
    s.stop();
  });

  it('supports prefix option', () => {
    const s = createSpinner('testDots', { stream, hideCursor: false, prefix: '[INFO]' });
    s.start('msg');
    const fullOutput = output.join('');
    expect(fullOutput).toContain('[INFO]');
    s.stop();
  });

  it('supports indent option', () => {
    const s = createSpinner('testDots', { stream, hideCursor: false, indent: 4 });
    s.start('msg');
    const fullOutput = output.join('');
    expect(fullOutput).toContain('    '); // 4 spaces
    s.stop();
  });
});
