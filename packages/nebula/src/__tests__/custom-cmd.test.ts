import { describe, expect, it, vi } from 'vitest';
import { type AppConfig, app } from '../app.js';
import { text } from '../elements.js';
import type { TerminalBackend } from '../terminal.js';
import { Cmd, cmdKind, type Result, Sub } from '../types.js';

// ─── Cmd.custom ─────────────────────────────────────────────────────────────

describe('Cmd.custom', () => {
  it('creates command with correct kind, tag, payload, and toMsg', () => {
    const toMsg = (result: Result<unknown, unknown>) => ({ type: 'done' as const, result });
    const cmd = Cmd.custom('save', { id: 42 }, toMsg);

    expect(cmd._tag).toBe('cmd');
    const kind = cmdKind(cmd);
    expect(kind.kind).toBe('custom');
    if (kind.kind === 'custom') {
      expect(kind.tag).toBe('save');
      expect(kind.payload).toEqual({ id: 42 });
      expect(kind.toMsg).toBe(toMsg);
    }
  });

  it('creates command with no toMsg', () => {
    const cmd = Cmd.custom('fire-and-forget', 'hello');

    expect(cmd._tag).toBe('cmd');
    const kind = cmdKind(cmd);
    expect(kind.kind).toBe('custom');
    if (kind.kind === 'custom') {
      expect(kind.tag).toBe('fire-and-forget');
      expect(kind.payload).toBe('hello');
      expect(kind.toMsg).toBeUndefined();
    }
  });

  it('works with Cmd.batch', () => {
    const custom = Cmd.custom<string>('log', { level: 'info' });
    const none = Cmd.none<string>();
    const batched = Cmd.batch(custom, none);

    const kind = cmdKind(batched);
    expect(kind.kind).toBe('batch');
    if (kind.kind === 'batch') {
      expect(kind.cmds).toHaveLength(2);
      expect(kind.cmds[0]).toBe(custom);
      expect(kind.cmds[1]).toBe(none);
      const innerKind = cmdKind(kind.cmds[0]!);
      expect(innerKind.kind).toBe('custom');
      if (innerKind.kind === 'custom') {
        expect(innerKind.tag).toBe('log');
      }
    }
  });

  it('works with Cmd.sequence', () => {
    const custom = Cmd.custom<string>('persist', { key: 'data' });
    const none = Cmd.none<string>();
    const seq = Cmd.sequence(custom, none);

    const kind = cmdKind(seq);
    expect(kind.kind).toBe('sequence');
    if (kind.kind === 'sequence') {
      expect(kind.cmds).toHaveLength(2);
      expect(kind.cmds[0]).toBe(custom);
      const innerKind = cmdKind(kind.cmds[0]!);
      expect(innerKind.kind).toBe('custom');
      if (innerKind.kind === 'custom') {
        expect(innerKind.tag).toBe('persist');
        expect(innerKind.payload).toEqual({ key: 'data' });
      }
    }
  });

  it('Cmd.map wraps correctly', () => {
    const inner = Cmd.custom<number>('fetch-user', { userId: 1 }, (result) => {
      if (result.ok) return 200;
      return 500;
    });
    const mapped = Cmd.map(inner, (n) => `status-${n}`);

    expect(mapped._tag).toBe('cmd');
    const kind = cmdKind(mapped);
    expect(kind.kind).toBe('map');
    if (kind.kind === 'map') {
      expect(kind.cmd).toBe(inner);
      expect(kind.fn(200)).toBe('status-200');
    }
  });

  it('preserves typed payload', () => {
    interface UserPayload {
      name: string;
      age: number;
      tags: string[];
    }

    const payload: UserPayload = { name: 'Alice', age: 30, tags: ['admin', 'user'] };
    const cmd = Cmd.custom<string>('create-user', payload);

    const kind = cmdKind(cmd);
    expect(kind.kind).toBe('custom');
    if (kind.kind === 'custom') {
      const extracted = kind.payload as UserPayload;
      expect(extracted.name).toBe('Alice');
      expect(extracted.age).toBe(30);
      expect(extracted.tags).toEqual(['admin', 'user']);
    }
  });
});

// ─── Cmd.custom runtime execution ──────────────────────────────────────────

function createMockTerminal(): TerminalBackend & { output: string[]; inputHandlers: ((data: Buffer) => void)[] } {
  const output: string[] = [];
  const inputHandlers: ((data: Buffer) => void)[] = [];
  return {
    output,
    inputHandlers,
    enterRawMode: vi.fn(),
    exitRawMode: vi.fn(),
    write(data: string) {
      output.push(data);
    },
    onInput(handler: (data: Buffer) => void) {
      inputHandlers.push(handler);
    },
    offInput(handler: (data: Buffer) => void) {
      const idx = inputHandlers.indexOf(handler);
      if (idx >= 0) inputHandlers.splice(idx, 1);
    },
    onResize: vi.fn(),
    offResize: vi.fn(),
    getSize: () => ({ cols: 40, rows: 10 }),
  };
}

describe('Cmd.custom runtime execution', () => {
  type TestMsg = { type: 'custom-result'; result: Result<unknown, unknown> } | { type: 'noop' };

  interface TestModel {
    lastMsg: TestMsg | null;
  }

  it('handler resolves and toMsg receives success Result', async () => {
    const handlerResult = { saved: true };
    const handler = vi.fn().mockResolvedValue(handlerResult);
    const updateSpy = vi.fn();

    const terminal = createMockTerminal();
    const config: AppConfig<TestModel, TestMsg> = {
      init: () => [
        { lastMsg: null },
        Cmd.custom<TestMsg>('test', { key: 'value' }, (result) => ({
          type: 'custom-result',
          result,
        })),
      ],
      update: (msg, model) => {
        updateSpy(msg, model);
        return [{ lastMsg: msg }, Cmd.none()];
      },
      view: (model) => text(`last: ${model.lastMsg?.type ?? 'none'}`),
      subscriptions: () => Sub.none(),
    };

    const handle = app(config, {
      terminal,
      commandHandlers: { test: handler },
    });

    // Wait for the async handler to resolve and dispatch
    await vi.waitFor(() => {
      expect(updateSpy).toHaveBeenCalled();
    });

    expect(handler).toHaveBeenCalledWith({ key: 'value' });
    const msg = updateSpy.mock.calls[0]![0] as TestMsg;
    expect(msg.type).toBe('custom-result');
    if (msg.type === 'custom-result') {
      expect(msg.result.ok).toBe(true);
      if (msg.result.ok) {
        expect(msg.result.value).toEqual(handlerResult);
      }
    }

    handle.stop();
  });

  it('handler rejects and toMsg receives error Result', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('save failed'));
    const updateSpy = vi.fn();

    const terminal = createMockTerminal();
    const config: AppConfig<TestModel, TestMsg> = {
      init: () => [
        { lastMsg: null },
        Cmd.custom<TestMsg>('save', { id: 1 }, (result) => ({
          type: 'custom-result',
          result,
        })),
      ],
      update: (msg, model) => {
        updateSpy(msg, model);
        return [{ lastMsg: msg }, Cmd.none()];
      },
      view: (model) => text(`last: ${model.lastMsg?.type ?? 'none'}`),
      subscriptions: () => Sub.none(),
    };

    const handle = app(config, {
      terminal,
      commandHandlers: { save: handler },
    });

    await vi.waitFor(() => {
      expect(updateSpy).toHaveBeenCalled();
    });

    expect(handler).toHaveBeenCalledWith({ id: 1 });
    const msg = updateSpy.mock.calls[0]![0] as TestMsg;
    expect(msg.type).toBe('custom-result');
    if (msg.type === 'custom-result') {
      expect(msg.result.ok).toBe(false);
      if (!msg.result.ok) {
        expect(msg.result.error).toBeInstanceOf(Error);
        expect((msg.result.error as Error).message).toBe('save failed');
      }
    }

    handle.stop();
  });

  it('missing handler does not crash and writes stderr warning', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const terminal = createMockTerminal();
    const config: AppConfig<TestModel, TestMsg> = {
      init: () => [{ lastMsg: null }, Cmd.custom<TestMsg>('unknown-cmd', { data: 'test' })],
      update: (_msg, model) => [model, Cmd.none()],
      view: () => text('hello'),
      subscriptions: () => Sub.none(),
    };

    // Should not throw
    const handle = app(config, { terminal });

    // Give microtasks a chance to flush
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('No handler registered for custom command "unknown-cmd"'));

    handle.stop();
    stderrSpy.mockRestore();
  });

  it('handler fires without toMsg and does not dispatch', async () => {
    const handler = vi.fn().mockResolvedValue('result-ignored');
    const updateSpy = vi.fn();

    const terminal = createMockTerminal();
    const config: AppConfig<TestModel, TestMsg> = {
      init: () => [{ lastMsg: null }, Cmd.custom<TestMsg>('fire-only', { key: 'val' })],
      update: (msg, model) => {
        updateSpy(msg, model);
        return [{ lastMsg: msg }, Cmd.none()];
      },
      view: () => text('hello'),
      subscriptions: () => Sub.none(),
    };

    const handle = app(config, {
      terminal,
      commandHandlers: { 'fire-only': handler },
    });

    // Wait for the handler to be called
    await vi.waitFor(() => {
      expect(handler).toHaveBeenCalled();
    });

    // Give extra time for any accidental dispatch
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(handler).toHaveBeenCalledWith({ key: 'val' });
    // update should NOT have been called since there is no toMsg
    expect(updateSpy).not.toHaveBeenCalled();

    handle.stop();
  });

  it('handler synchronous throw is converted to Result.err via toMsg', async () => {
    // Non-async handler that throws BEFORE producing a Promise.
    const handler = vi.fn(() => {
      throw new Error('sync-handler-boom');
    });
    const updateSpy = vi.fn();

    const terminal = createMockTerminal();
    const config: AppConfig<TestModel, TestMsg> = {
      init: () => [
        { lastMsg: null },
        Cmd.custom<TestMsg>('sync-throw', { id: 7 }, (result) => ({
          type: 'custom-result',
          result,
        })),
      ],
      update: (msg, model) => {
        updateSpy(msg, model);
        return [{ lastMsg: msg }, Cmd.none()];
      },
      view: () => text('hello'),
      subscriptions: () => Sub.none(),
    };

    const handle = app(config, {
      terminal,
      commandHandlers: { 'sync-throw': handler as unknown as (payload: unknown) => Promise<unknown> },
    });

    await vi.waitFor(() => {
      expect(updateSpy).toHaveBeenCalled();
    });

    const msg = updateSpy.mock.calls[0]![0] as TestMsg;
    expect(msg.type).toBe('custom-result');
    if (msg.type === 'custom-result') {
      expect(msg.result.ok).toBe(false);
      if (!msg.result.ok) {
        expect(msg.result.error).toBeInstanceOf(Error);
        expect((msg.result.error as Error).message).toBe('sync-handler-boom');
      }
    }

    handle.stop();
  });
});
