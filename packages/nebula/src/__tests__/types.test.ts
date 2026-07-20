import { describe, expect, it } from 'vitest';
import { Cmd, cmdKind, type Msg, Result, Sub, subKind } from '../types.js';

// ─── Msg type ────────────────────────────────────────────────────────────────

describe('Msg', () => {
  it('creates a discriminated union with no payload', () => {
    type Quit = Msg<'quit'>;
    const msg: Quit = { type: 'quit' };
    expect(msg.type).toBe('quit');
  });

  it('creates a discriminated union with payload', () => {
    type SetName = Msg<'set-name', { name: string }>;
    const msg: SetName = { type: 'set-name', name: 'Alice' };
    expect(msg.type).toBe('set-name');
    expect(msg.name).toBe('Alice');
  });

  it('supports union of multiple message types', () => {
    type AppMsg = Msg<'increment'> | Msg<'decrement'> | Msg<'set', { value: number }>;

    const msgs: AppMsg[] = [{ type: 'increment' }, { type: 'decrement' }, { type: 'set', value: 42 }];

    expect(msgs[0]!.type).toBe('increment');
    expect(msgs[1]!.type).toBe('decrement');
    expect(msgs[2]!.type).toBe('set');
  });
});

// ─── Cmd ─────────────────────────────────────────────────────────────────────

describe('Cmd', () => {
  describe('Cmd.none()', () => {
    it('creates a no-op command', () => {
      const cmd = Cmd.none();
      expect(cmd._tag).toBe('cmd');
      const kind = cmdKind(cmd);
      expect(kind.kind).toBe('none');
    });
  });

  describe('Cmd.batch()', () => {
    it('combines multiple commands', () => {
      const a = Cmd.none<string>();
      const b = Cmd.none<string>();
      const batched = Cmd.batch(a, b);

      expect(batched._tag).toBe('cmd');
      const kind = cmdKind(batched);
      expect(kind.kind).toBe('batch');
      if (kind.kind === 'batch') {
        expect(kind.cmds).toHaveLength(2);
        expect(kind.cmds[0]).toBe(a);
        expect(kind.cmds[1]).toBe(b);
      }
    });

    it('handles empty batch', () => {
      const batched = Cmd.batch<string>();
      const kind = cmdKind(batched);
      expect(kind.kind).toBe('batch');
      if (kind.kind === 'batch') {
        expect(kind.cmds).toHaveLength(0);
      }
    });
  });

  describe('Cmd.sequence()', () => {
    it('chains commands in order', () => {
      const a = Cmd.none<string>();
      const b = Cmd.none<string>();
      const seq = Cmd.sequence(a, b);

      expect(seq._tag).toBe('cmd');
      const kind = cmdKind(seq);
      expect(kind.kind).toBe('sequence');
      if (kind.kind === 'sequence') {
        expect(kind.cmds).toHaveLength(2);
        expect(kind.cmds[0]).toBe(a);
        expect(kind.cmds[1]).toBe(b);
      }
    });
  });

  describe('Cmd.msg()', () => {
    it('builds a perform-shaped command that resolves to the captured message', async () => {
      type AppMsg = Msg<'follow-up', { value: number }>;
      const cmd = Cmd.msg<AppMsg>({ type: 'follow-up', value: 7 });

      expect(cmd._tag).toBe('cmd');
      const kind = cmdKind(cmd);
      expect(kind.kind).toBe('perform');
      if (kind.kind === 'perform') {
        const v = await kind.task(new AbortController().signal);
        expect(kind.toMsg(v)).toEqual({ type: 'follow-up', value: 7 });
      }
    });

    it('captures the message by reference (later mutation is irrelevant)', async () => {
      const original = { type: 'set' as const, n: 1 };
      const cmd = Cmd.msg(original);
      const kind = cmdKind(cmd);
      if (kind.kind === 'perform') {
        const v = await kind.task(new AbortController().signal);
        expect(kind.toMsg(v)).toBe(original);
      }
    });
  });

  describe('Cmd.fetchText()', () => {
    it('creates an attempt-style command that returns response text', async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async () => ({
          ok: true,
          status: 200,
          statusText: 'OK',
          text: async () => 'hello world',
        })) as unknown as typeof fetch;

        const cmd = Cmd.fetchText<unknown>('https://example.com/page', {}, (r) => r);
        const kind = cmdKind(cmd);
        expect(kind.kind).toBe('attempt');
        if (kind.kind === 'attempt') {
          const result = await kind.task(new AbortController().signal);
          expect(result).toBe('hello world');
        }
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('throws on non-ok responses so toMsg receives an error result', async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async () => ({
          ok: false,
          status: 500,
          statusText: 'Server Error',
          text: async () => 'oops',
        })) as unknown as typeof fetch;

        const cmd = Cmd.fetchText<unknown>('https://example.com/page', {}, (r) => r);
        const kind = cmdKind(cmd);
        if (kind.kind === 'attempt') {
          await expect(kind.task(new AbortController().signal)).rejects.toThrow('HTTP 500: Server Error');
        }
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('Cmd.perform()', () => {
    it('wraps an async task with a message mapper', () => {
      const task = () => Promise.resolve(42);
      const toMsg = (n: number) => `got-${n}`;
      const cmd = Cmd.perform(task, toMsg);

      expect(cmd._tag).toBe('cmd');
      const kind = cmdKind(cmd);
      expect(kind.kind).toBe('perform');
      if (kind.kind === 'perform') {
        expect(kind.task).toBe(task);
        expect(kind.toMsg(42)).toBe('got-42');
      }
    });

    it('preserves task reference for runtime execution', async () => {
      let called = false;
      const task = async () => {
        called = true;
        return 'done';
      };
      const toMsg = (r: string) => ({ type: 'result' as const, data: r });
      const cmd = Cmd.perform(task, toMsg);

      const kind = cmdKind(cmd);
      if (kind.kind === 'perform') {
        const result = await kind.task(new AbortController().signal);
        expect(called).toBe(true);
        expect(kind.toMsg(result)).toEqual({ type: 'result', data: 'done' });
      }
    });
  });

  describe('Cmd.map()', () => {
    it('transforms the resulting message type', () => {
      const inner = Cmd.none<number>();
      const mapped = Cmd.map(inner, (n) => `num-${n}`);

      expect(mapped._tag).toBe('cmd');
      const kind = cmdKind(mapped);
      expect(kind.kind).toBe('map');
      if (kind.kind === 'map') {
        expect(kind.cmd).toBe(inner);
        expect(kind.fn(5)).toBe('num-5');
      }
    });
  });

  describe('Cmd.quit()', () => {
    it('creates a quit command', () => {
      const cmd = Cmd.quit();
      expect(cmd._tag).toBe('cmd');
      const kind = cmdKind(cmd);
      expect(kind.kind).toBe('quit');
    });
  });

  describe('Cmd.startTask()', () => {
    it('creates a managed task command', () => {
      const cmd = Cmd.startTask({
        id: 'load',
        run: async () => ({ type: 'done' as const }),
      });

      const kind = cmdKind(cmd);
      expect(kind.kind).toBe('taskStart');
      if (kind.kind === 'taskStart') {
        expect(kind.task.id).toBe('load');
      }
    });
  });

  describe('Cmd.cancelTask()', () => {
    it('creates a task cancellation command', () => {
      const kind = cmdKind(Cmd.cancelTask('load'));
      expect(kind.kind).toBe('taskCancel');
      if (kind.kind === 'taskCancel') {
        expect(kind.taskId).toBe('load');
      }
    });
  });

  describe('Cmd.cancelTasksByOwner()', () => {
    it('creates an owner-scoped task cancellation command', () => {
      const kind = cmdKind(Cmd.cancelTasksByOwner('screen:a'));
      expect(kind.kind).toBe('taskCancelOwner');
      if (kind.kind === 'taskCancelOwner') {
        expect(kind.owner).toBe('screen:a');
      }
    });
  });
});

// ─── Sub ─────────────────────────────────────────────────────────────────────

describe('Sub', () => {
  describe('Sub.none()', () => {
    it('creates a no-op subscription', () => {
      const sub = Sub.none();
      expect(sub._tag).toBe('sub');
      const kind = subKind(sub);
      expect(kind.kind).toBe('none');
    });
  });

  describe('Sub.batch()', () => {
    it('combines multiple subscriptions', () => {
      const a = Sub.none<string>();
      const b = Sub.none<string>();
      const batched = Sub.batch(a, b);

      expect(batched._tag).toBe('sub');
      const kind = subKind(batched);
      expect(kind.kind).toBe('batch');
      if (kind.kind === 'batch') {
        expect(kind.subs).toHaveLength(2);
        expect(kind.subs[0]).toBe(a);
        expect(kind.subs[1]).toBe(b);
      }
    });

    it('handles empty batch', () => {
      const batched = Sub.batch<string>();
      const kind = subKind(batched);
      expect(kind.kind).toBe('batch');
      if (kind.kind === 'batch') {
        expect(kind.subs).toHaveLength(0);
      }
    });
  });

  describe('Sub.key()', () => {
    it('creates a key binding subscription', () => {
      const msg = { type: 'pressed' as const };
      const sub = Sub.key('enter', msg);

      expect(sub._tag).toBe('sub');
      const kind = subKind(sub);
      expect(kind.kind).toBe('key');
      if (kind.kind === 'key') {
        expect(kind.key).toBe('enter');
        expect(kind.msg).toBe(msg);
      }
    });
  });

  describe('Sub.timer()', () => {
    it('creates a periodic timer subscription', () => {
      const toMsg = () => ({ type: 'tick' as const });
      const sub = Sub.timer(1000, toMsg);

      expect(sub._tag).toBe('sub');
      const kind = subKind(sub);
      expect(kind.kind).toBe('timer');
      if (kind.kind === 'timer') {
        expect(kind.ms).toBe(1000);
        expect(kind.toMsg()).toEqual({ type: 'tick' });
      }
    });
  });

  describe('Sub.resize()', () => {
    it('creates a resize listener subscription', () => {
      const toMsg = (cols: number, rows: number) => ({
        type: 'resized' as const,
        cols,
        rows,
      });
      const sub = Sub.resize(toMsg);

      expect(sub._tag).toBe('sub');
      const kind = subKind(sub);
      expect(kind.kind).toBe('resize');
      if (kind.kind === 'resize') {
        expect(kind.toMsg(80, 24)).toEqual({
          type: 'resized',
          cols: 80,
          rows: 24,
        });
      }
    });
  });

  describe('Sub.mouse()', () => {
    it('creates a mouse event subscription', () => {
      const toMsg = (event: { type: string; x: number; y: number }) => ({
        type: 'clicked' as const,
        x: event.x,
        y: event.y,
      });
      const sub = Sub.mouse(toMsg);

      expect(sub._tag).toBe('sub');
      const kind = subKind(sub);
      expect(kind.kind).toBe('mouse');
      if (kind.kind === 'mouse') {
        expect(
          kind.toMsg({
            type: 'press',
            button: 0 as const,
            x: 5,
            y: 10,
            ctrl: false,
            alt: false,
            shift: false,
          }),
        ).toEqual({
          type: 'clicked',
          x: 5,
          y: 10,
        });
      }
    });
  });

  describe('Sub.focus()', () => {
    it('creates a focus change subscription', () => {
      const toMsg = (focusedId: string | null) => ({
        type: 'focus-changed' as const,
        id: focusedId,
      });
      const sub = Sub.focus(toMsg);

      expect(sub._tag).toBe('sub');
      const kind = subKind(sub);
      expect(kind.kind).toBe('focus');
      if (kind.kind === 'focus') {
        expect(kind.toMsg('btn-save')).toEqual({
          type: 'focus-changed',
          id: 'btn-save',
        });
        expect(kind.toMsg(null)).toEqual({
          type: 'focus-changed',
          id: null,
        });
      }
    });
  });
});

// ─── cmdKind / subKind ───────────────────────────────────────────────────────

describe('cmdKind', () => {
  it('extracts the internal kind from every command type', () => {
    expect(cmdKind(Cmd.none()).kind).toBe('none');
    expect(cmdKind(Cmd.batch()).kind).toBe('batch');
    expect(cmdKind(Cmd.sequence()).kind).toBe('sequence');
    expect(
      cmdKind(
        Cmd.perform(
          () => Promise.resolve(1),
          (x) => x,
        ),
      ).kind,
    ).toBe('perform');
    expect(cmdKind(Cmd.map(Cmd.none(), (x) => x)).kind).toBe('map');
    expect(cmdKind(Cmd.quit()).kind).toBe('quit');
    expect(cmdKind(Cmd.startTask({ id: 'load', run: async () => 'ok' })).kind).toBe('taskStart');
    expect(cmdKind(Cmd.cancelTask('load')).kind).toBe('taskCancel');
    expect(cmdKind(Cmd.cancelTasksByOwner('screen:a')).kind).toBe('taskCancelOwner');
  });
});

// ─── Result helpers ──────────────────────────────────────────────────────────

describe('Result', () => {
  it('ok / err build matching shapes', () => {
    expect(Result.ok(42)).toEqual({ ok: true, value: 42 });
    const error = new Error('boom');
    expect(Result.err(error)).toEqual({ ok: false, error });
  });

  it('isOk / isErr narrow correctly', () => {
    const ok = Result.ok('hi');
    const err = Result.err(new Error('x'));
    expect(Result.isOk(ok)).toBe(true);
    expect(Result.isErr(ok)).toBe(false);
    expect(Result.isOk(err)).toBe(false);
    expect(Result.isErr(err)).toBe(true);
  });

  it('map transforms only the success branch', () => {
    expect(Result.map(Result.ok(2), (n) => n * 5)).toEqual({ ok: true, value: 10 });
    const err = Result.err(new Error('x'));
    expect(Result.map(err, (n: number) => n * 5)).toBe(err);
  });

  it('mapErr transforms only the failure branch', () => {
    const ok = Result.ok(1);
    expect(Result.mapErr(ok, (e: Error) => e.message)).toBe(ok);
    expect(Result.mapErr(Result.err(new Error('boom')), (e) => e.message)).toEqual({
      ok: false,
      error: 'boom',
    });
  });

  it('unwrapOr returns value or fallback', () => {
    expect(Result.unwrapOr(Result.ok(7), 0)).toBe(7);
    expect(Result.unwrapOr<number, Error>(Result.err(new Error('x')), 0)).toBe(0);
  });

  it('match runs the matching branch', () => {
    expect(
      Result.match(Result.ok(3), {
        ok: (v) => `v=${v}`,
        err: (e: Error) => `e=${e.message}`,
      }),
    ).toBe('v=3');
    expect(
      Result.match(Result.err(new Error('boom')), {
        ok: (v: number) => `v=${v}`,
        err: (e) => `e=${e.message}`,
      }),
    ).toBe('e=boom');
  });
});

describe('subKind', () => {
  it('extracts the internal kind from every subscription type', () => {
    expect(subKind(Sub.none()).kind).toBe('none');
    expect(subKind(Sub.batch()).kind).toBe('batch');
    expect(subKind(Sub.key('a', 'msg')).kind).toBe('key');
    expect(subKind(Sub.timer(100, () => 'tick')).kind).toBe('timer');
    expect(subKind(Sub.resize(() => 'resized')).kind).toBe('resize');
    expect(subKind(Sub.mouse(() => 'clicked')).kind).toBe('mouse');
    expect(subKind(Sub.focus(() => 'focused')).kind).toBe('focus');
    expect(subKind(Sub.layout(['a'], () => 'layout')).kind).toBe('layout');
    expect(subKind(Sub.map(Sub.none(), (x) => x)).kind).toBe('map');
  });
});
