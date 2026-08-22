import { describe, expect, it } from 'vitest';
import { inlinePrompt, PromptCancelledError } from '../inline-prompt.js';

class TestTerminal {
  readonly writes: string[] = [];
  private inputHandlers: Array<(data: Buffer) => void> = [];

  enterRawMode(): void {}
  exitRawMode(): void {}
  write(data: string): void {
    this.writes.push(data);
  }
  onInput(handler: (data: Buffer) => void): void {
    this.inputHandlers.push(handler);
  }
  offInput(handler: (data: Buffer) => void): void {
    this.inputHandlers = this.inputHandlers.filter((current) => current !== handler);
  }
  onResize(): void {}
  offResize(): void {}
  getSize(): { cols: number; rows: number } {
    return { cols: 60, rows: 20 };
  }
  simulateInput(data: Buffer): void {
    for (const handler of this.inputHandlers) {
      handler(data);
    }
  }
}

const flush = async () => {
  await Promise.resolve();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
};

function keys(terminal: TestTerminal, input: string) {
  terminal.simulateInput(Buffer.from(input, 'utf8'));
}

describe('inlinePrompt (Elm-runtime rebuild)', () => {
  it('text: types, edits with cursor movement, and resolves on Enter', async () => {
    const terminal = new TestTerminal();
    const promise = inlinePrompt.text({ message: 'Project name' }, { terminal });

    keys(terminal, 'helo');
    await flush();
    keys(terminal, '\x1b[D'); // left
    keys(terminal, 'l'); // "hello"
    await flush();
    keys(terminal, '\r');
    await flush();

    await expect(promise).resolves.toBe('hello');
  });

  it('text: prefills initial value with cursor at end', async () => {
    const terminal = new TestTerminal();
    const promise = inlinePrompt.text({ message: 'Name', initial: 'my-cli' }, { terminal });

    keys(terminal, '!');
    await flush();
    keys(terminal, '\r');
    await flush();

    await expect(promise).resolves.toBe('my-cli!');
  });

  it('text: validate blocks submission with an error, then accepts a fix', async () => {
    const terminal = new TestTerminal();
    const promise = inlinePrompt.text(
      { message: 'Name', validate: (v) => (v.length >= 3 ? true : 'Too short') },
      { terminal },
    );

    keys(terminal, 'ab');
    await flush();
    keys(terminal, '\r');
    await flush();
    // Still active: rejection would have settled the promise.
    keys(terminal, 'cdef');
    await flush();
    keys(terminal, '\r');
    await flush();

    await expect(promise).resolves.toBe('abcdef');
  });

  it('text: moves by grapheme clusters, not UTF-16 units', async () => {
    const terminal = new TestTerminal();
    const promise = inlinePrompt.text({ message: 'React' }, { terminal });

    keys(terminal, 'a👍🏽b'); // thumbs-up with skin tone: one grapheme, multiple code units
    await flush();
    keys(terminal, '\x1b[D'); // left over 'b'
    keys(terminal, '\x1b[D'); // left over the emoji grapheme
    await flush();
    keys(terminal, 'X');
    await flush();
    keys(terminal, '\r');
    await flush();

    await expect(promise).resolves.toBe('aX👍🏽b');
  });

  it('text: Escape rejects with PromptCancelledError and never exits the process', async () => {
    const terminal = new TestTerminal();
    const promise = inlinePrompt.text({ message: 'Name' }, { terminal });
    const assertion = expect(promise).rejects.toBeInstanceOf(PromptCancelledError);

    keys(terminal, '\x1b');
    await flush();
    await assertion;
  });

  it('text: Ctrl+C rejects instead of calling process.exit', async () => {
    const terminal = new TestTerminal();
    const promise = inlinePrompt.text({ message: 'Name' }, { terminal });
    const assertion = expect(promise).rejects.toBeInstanceOf(PromptCancelledError);

    keys(terminal, '\x03');
    await flush();
    await assertion;
  });

  it('confirm: y/n keys settle immediately; Enter uses the current value', async () => {
    const terminal = new TestTerminal();
    const promise = inlinePrompt.confirm({ message: 'Continue?' }, { terminal });
    keys(terminal, 'n');
    await flush();
    await expect(promise).resolves.toBe(false);

    const terminal2 = new TestTerminal();
    const promise2 = inlinePrompt.confirm({ message: 'Continue?', initial: false }, { terminal: terminal2 });
    keys(terminal2, '\r');
    await flush();
    await expect(promise2).resolves.toBe(false);
  });

  it('select: arrow navigation wraps and Enter resolves the selected value', async () => {
    const terminal = new TestTerminal();
    const promise = inlinePrompt.select(
      {
        message: 'Target',
        options: [
          { label: 'Node SEA', value: 'sea' },
          { label: 'Bun Native', value: 'bun' },
          { label: 'Source', value: 'source' },
        ],
      },
      { terminal },
    );

    keys(terminal, '\x1b[A'); // up wraps to last
    await flush();
    keys(terminal, '\r');
    await flush();

    await expect(promise).resolves.toBe('source');
  });

  it('select: j/k navigation works and respects initialIndex', async () => {
    const terminal = new TestTerminal();
    const promise = inlinePrompt.select(
      {
        message: 'Target',
        initialIndex: 1,
        options: [
          { label: 'A', value: 'a' },
          { label: 'B', value: 'b' },
          { label: 'C', value: 'c' },
        ],
      },
      { terminal },
    );

    keys(terminal, 'j'); // down to C
    await flush();
    keys(terminal, '\r');
    await flush();

    await expect(promise).resolves.toBe('c');
  });

  it('select: rejects on cancel', async () => {
    const terminal = new TestTerminal();
    const promise = inlinePrompt.select({ message: 'Pick', options: [{ label: 'A', value: 'a' }] }, { terminal });
    const assertion = expect(promise).rejects.toBeInstanceOf(PromptCancelledError);

    keys(terminal, '\x1b');
    await flush();
    await assertion;
  });

  it('non-interactive fallback resolves defaults without a terminal', async () => {
    // No terminal override: process streams in tests are non-TTY.
    await expect(inlinePrompt.text({ message: 'Name', initial: 'fallback' })).resolves.toBe('fallback');
    await expect(inlinePrompt.confirm({ message: 'Ok?', initial: false })).resolves.toBe(false);
    await expect(
      inlinePrompt.select({ message: 'Pick', initialIndex: 1, options: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }] }),
    ).resolves.toBe('b');
  });

  it('select: throws on empty options', async () => {
    await expect(inlinePrompt.select({ message: 'Pick', options: [] })).rejects.toThrow(RangeError);
  });
});
