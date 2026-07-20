import { describe, expect, it, vi } from 'vitest';
import { type AppConfig, app } from '../app.js';
import { BRACKETED_PASTE_DISABLE, BRACKETED_PASTE_ENABLE, BRACKETED_PASTE_END, BRACKETED_PASTE_START, ClipboardCmd, osc52PasteRequest } from '../clipboard.js';
import { text } from '../elements.js';
import type { TerminalBackend } from '../terminal.js';
import { Cmd, type Result, Sub, subKind } from '../types.js';

// ─── Mock terminal ──────────────────────────────────────────────────────────

function createMockTerminal(): TerminalBackend & {
  written: string[];
  inputHandlers: Array<(data: Buffer) => void>;
  resizeHandlers: Array<() => void>;
  simulateInput: (data: string) => void;
} {
  const inputHandlers: Array<(data: Buffer) => void> = [];
  const resizeHandlers: Array<() => void> = [];
  const written: string[] = [];

  return {
    written,
    inputHandlers,
    resizeHandlers,
    enterRawMode: vi.fn(),
    exitRawMode: vi.fn(),
    write(data: string) {
      written.push(data);
    },
    onInput(handler: (data: Buffer) => void) {
      inputHandlers.push(handler);
    },
    offInput(handler: (data: Buffer) => void) {
      const idx = inputHandlers.indexOf(handler);
      if (idx >= 0) inputHandlers.splice(idx, 1);
    },
    onResize(handler: () => void) {
      resizeHandlers.push(handler);
    },
    offResize(handler: () => void) {
      const idx = resizeHandlers.indexOf(handler);
      if (idx >= 0) resizeHandlers.splice(idx, 1);
    },
    getSize() {
      return { cols: 40, rows: 10 };
    },
    simulateInput(data: string) {
      const buf = Buffer.from(data, 'utf8');
      for (const handler of inputHandlers) handler(buf);
    },
  };
}

// ─── Sub.paste ──────────────────────────────────────────────────────────────

describe('Sub.paste', () => {
  it('creates a paste subscription', () => {
    const sub = Sub.paste((text: string) => ({ type: 'paste' as const, text }));
    expect(sub._tag).toBe('sub');
    const kind = subKind(sub);
    expect(kind.kind).toBe('paste');
  });
});

// ─── Bracketed paste mode in app runtime ────────────────────────────────────

describe('bracketed paste in app runtime', () => {
  it('emits bracketed paste enable sequence on startup when paste sub is active', () => {
    const terminal = createMockTerminal();

    type Msg = { type: 'paste'; text: string } | { type: 'noop' };
    type Model = { lastPaste: string };

    const config: AppConfig<Model, Msg> = {
      init: () => [{ lastPaste: '' }, Cmd.none()],
      update: (msg, model) => {
        if (msg.type === 'paste') return [{ lastPaste: msg.text }, Cmd.none()];
        return [model, Cmd.none()];
      },
      view: (model) => text(model.lastPaste || 'waiting'),
      subscriptions: () => Sub.paste((t) => ({ type: 'paste' as const, text: t })),
    };

    const handle = app(config, { terminal });

    // Check that bracketed paste enable sequence was written
    const allWritten = terminal.written.join('');
    expect(allWritten).toContain(BRACKETED_PASTE_ENABLE);

    handle.stop();
  });

  it('emits bracketed paste disable sequence on shutdown', () => {
    const terminal = createMockTerminal();

    type Msg = { type: 'paste'; text: string };
    type Model = { lastPaste: string };

    const config: AppConfig<Model, Msg> = {
      init: () => [{ lastPaste: '' }, Cmd.none()],
      update: (msg, model) => {
        if (msg.type === 'paste') return [{ lastPaste: msg.text }, Cmd.none()];
        return [model, Cmd.none()];
      },
      view: (model) => text(model.lastPaste || 'waiting'),
      subscriptions: () => Sub.paste((t) => ({ type: 'paste' as const, text: t })),
    };

    const handle = app(config, { terminal });
    // Clear written buffer to isolate shutdown writes
    terminal.written.length = 0;
    handle.stop();

    const shutdownWritten = terminal.written.join('');
    expect(shutdownWritten).toContain(BRACKETED_PASTE_DISABLE);
  });

  it('delivers pasted text as a paste message', () => {
    const terminal = createMockTerminal();
    const receivedMsgs: Array<{ type: string; text?: string }> = [];

    type Msg = { type: 'paste'; text: string } | { type: 'key'; key: string };
    type Model = { msgs: typeof receivedMsgs };

    const config: AppConfig<Model, Msg> = {
      init: () => [{ msgs: receivedMsgs }, Cmd.none()],
      update: (msg, model) => {
        receivedMsgs.push(msg);
        return [model, Cmd.none()];
      },
      view: () => text('test'),
      subscriptions: () => Sub.paste((t) => ({ type: 'paste' as const, text: t })),
    };

    const handle = app(config, { terminal });

    // Simulate pasted text wrapped in bracketed paste markers
    terminal.simulateInput(`${BRACKETED_PASTE_START}hello world${BRACKETED_PASTE_END}`);

    expect(receivedMsgs).toContainEqual({ type: 'paste', text: 'hello world' });

    handle.stop();
  });

  it('delivers regular input normally (not as paste)', () => {
    const terminal = createMockTerminal();
    const receivedMsgs: Array<{ type: string; text?: string; key?: string }> = [];

    type Msg = { type: 'paste'; text: string } | { type: 'key'; key: string };
    type Model = { msgs: typeof receivedMsgs };

    const config: AppConfig<Model, Msg> = {
      init: () => [{ msgs: receivedMsgs }, Cmd.none()],
      update: (msg, model) => {
        receivedMsgs.push(msg);
        return [model, Cmd.none()];
      },
      view: () => text('test'),
      subscriptions: () =>
        Sub.batch<Msg>(
          Sub.paste((t) => ({ type: 'paste' as const, text: t })),
          Sub.key('a', { type: 'key' as const, key: 'a' }),
        ),
    };

    const handle = app(config, { terminal });

    // Simulate regular key input (not wrapped in paste markers)
    terminal.simulateInput('a');

    // Should not be a paste message
    const pasteMessages = receivedMsgs.filter((m) => m.type === 'paste');
    expect(pasteMessages).toHaveLength(0);
    // Should be a key message
    const keyMessages = receivedMsgs.filter((m) => m.type === 'key');
    expect(keyMessages).toHaveLength(1);

    handle.stop();
  });

  it('handles multi-line pasted text', () => {
    const terminal = createMockTerminal();
    const receivedMsgs: Array<{ type: string; text?: string }> = [];

    type Msg = { type: 'paste'; text: string };
    type Model = {};

    const config: AppConfig<Model, Msg> = {
      init: () => [{}, Cmd.none()],
      update: (msg, model) => {
        receivedMsgs.push(msg);
        return [model, Cmd.none()];
      },
      view: () => text('test'),
      subscriptions: () => Sub.paste((t) => ({ type: 'paste' as const, text: t })),
    };

    const handle = app(config, { terminal });

    const multiline = 'line1\nline2\nline3';
    terminal.simulateInput(`${BRACKETED_PASTE_START}${multiline}${BRACKETED_PASTE_END}`);

    expect(receivedMsgs).toContainEqual({ type: 'paste', text: multiline });

    handle.stop();
  });

  it('handles incomplete paste sequences gracefully (missing end marker)', () => {
    const terminal = createMockTerminal();
    const receivedMsgs: Array<{ type: string; text?: string }> = [];

    type Msg = { type: 'paste'; text: string } | { type: 'key'; key: string };
    type Model = {};

    const config: AppConfig<Model, Msg> = {
      init: () => [{}, Cmd.none()],
      update: (msg, model) => {
        receivedMsgs.push(msg);
        return [model, Cmd.none()];
      },
      view: () => text('test'),
      subscriptions: () => Sub.paste((t) => ({ type: 'paste' as const, text: t })),
    };

    const handle = app(config, { terminal });

    // Incomplete paste: start marker but no end marker
    terminal.simulateInput(`${BRACKETED_PASTE_START}incomplete`);

    // Should NOT dispatch a paste event since the sequence is incomplete
    const pasteMessages = receivedMsgs.filter((m) => m.type === 'paste');
    expect(pasteMessages).toHaveLength(0);

    handle.stop();
  });

  it('resolves clipboard paste requests from OSC 52 responses', async () => {
    const terminal = createMockTerminal();
    const received: Array<{ type: 'clipboard'; result: Result<string, Error> }> = [];

    type Msg = { type: 'clipboard'; result: Result<string, Error> };

    const handle = app<{}, Msg>(
      {
        init: () => [{}, ClipboardCmd.requestPaste((result) => ({ type: 'clipboard', result }))],
        update: (msg, model) => {
          received.push(msg);
          return [model, Cmd.none()];
        },
        view: () => text('test'),
        subscriptions: () => Sub.none(),
      },
      { terminal },
    );

    expect(terminal.written.join('')).toContain(osc52PasteRequest());

    const encoded = Buffer.from('clipboard text', 'utf8').toString('base64');
    terminal.simulateInput(`\x1b]52;c;${encoded}\x07`);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(received).toHaveLength(1);
    expect(received[0]?.result).toEqual({ ok: true, value: 'clipboard text' });

    handle.stop();
  });

  it('delivers multiple clipboard requests in response order', async () => {
    const terminal = createMockTerminal();
    const received: string[] = [];

    type Msg = { type: 'clipboard'; id: string; result: Result<string, Error> };

    const handle = app<{}, Msg>(
      {
        init: () => [
          {},
          Cmd.batch(
            ClipboardCmd.requestPaste((result) => ({ type: 'clipboard', id: 'first', result })),
            ClipboardCmd.requestPaste((result) => ({ type: 'clipboard', id: 'second', result })),
          ),
        ],
        update: (msg, model) => {
          if (msg.result.ok && msg.result.value) {
            received.push(`${msg.id}:${msg.result.value}`);
          }
          return [model, Cmd.none()];
        },
        view: () => text('test'),
        subscriptions: () => Sub.none(),
      },
      { terminal },
    );

    expect(terminal.written.join('')).toContain(`${osc52PasteRequest()}${osc52PasteRequest()}`);

    const first = Buffer.from('first text', 'utf8').toString('base64');
    const second = Buffer.from('second text', 'utf8').toString('base64');
    terminal.simulateInput(`\x1b]52;c;${first}\x07`);
    terminal.simulateInput(`\x1b]52;c;${second}\x07`);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(received).toEqual(['first:first text', 'second:second text']);

    handle.stop();
  });

  it('preserves trailing key input after an OSC 52 response in the same chunk', async () => {
    const terminal = createMockTerminal();
    const received: Array<{ type: 'clipboard'; result: Result<string, Error> } | { type: 'key'; key: string }> = [];

    type Msg = { type: 'clipboard'; result: Result<string, Error> } | { type: 'key'; key: string };

    const handle = app<{}, Msg>(
      {
        init: () => [{}, ClipboardCmd.requestPaste((result) => ({ type: 'clipboard', result }))],
        update: (msg, model) => {
          received.push(msg);
          return [model, Cmd.none()];
        },
        view: () => text('test'),
        subscriptions: () => Sub.key('a', { type: 'key', key: 'a' }),
      },
      { terminal },
    );

    const encoded = Buffer.from('clipboard text', 'utf8').toString('base64');
    terminal.simulateInput(`\x1b]52;c;${encoded}\x07a`);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(received).toEqual([
      { type: 'key', key: 'a' },
      { type: 'clipboard', result: { ok: true, value: 'clipboard text' } },
    ]);

    handle.stop();
  });
});
