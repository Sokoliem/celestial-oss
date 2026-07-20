import { describe, expect, it } from 'vitest';
import type { Result } from '../types.js';
import { Cmd, cmdKind } from '../types.js';

// ─── Result type ────────────────────────────────────────────────────────────

describe('Result type', () => {
  it('represents a successful result with Ok variant', () => {
    const ok: Result<number> = { ok: true, value: 42 };
    expect(ok.ok).toBe(true);
    expect(ok.value).toBe(42);
  });

  it('represents a failed result with Error variant', () => {
    const err: Result<number, string> = { ok: false, error: 'something went wrong' };
    expect(err.ok).toBe(false);
    expect(err.error).toBe('something went wrong');
  });

  it('defaults error type to Error', () => {
    const err: Result<number> = { ok: false, error: new Error('fail') };
    expect(err.ok).toBe(false);
    expect(err.error).toBeInstanceOf(Error);
  });

  it('narrows via discriminated union on ok', () => {
    const result: Result<string, Error> = { ok: true, value: 'hello' };
    if (result.ok) {
      expect(result.value).toBe('hello');
    }
  });

  it('narrows via discriminated union on error', () => {
    const result: Result<string, Error> = { ok: false, error: new Error('oops') };
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error);
    }
  });
});

// ─── Cmd.attempt ────────────────────────────────────────────────────────────

describe('Cmd.attempt', () => {
  describe('Cmd.attempt creates an attempt command', () => {
    it('produces an attempt command with correct structure', () => {
      const task = () => Promise.resolve(42);
      const toMsg = (result: Result<number>) => ({
        type: 'got-data' as const,
        result,
      });
      const cmd = Cmd.attempt(task, toMsg);

      expect(cmd._tag).toBe('cmd');
      const kind = cmdKind(cmd);
      expect(kind.kind).toBe('attempt');
    });

    it('stores task and toMsg references', () => {
      const task = () => Promise.resolve('hello');
      const toMsg = (result: Result<string>) => ({
        type: 'fetched' as const,
        result,
      });
      const cmd = Cmd.attempt(task, toMsg);
      const kind = cmdKind(cmd);

      if (kind.kind === 'attempt') {
        expect(kind.task).toBe(task);
        // toMsg is stored (may be wrapped, so just verify it's a function)
        expect(typeof kind.toMsg).toBe('function');
      }
    });
  });

  describe('Cmd.attempt delivers Ok result on success', () => {
    it('maps resolved value to Ok result via toMsg', async () => {
      const task = () => Promise.resolve(42);
      const toMsg = (result: Result<number>) => ({
        type: 'data' as const,
        result,
      });

      const cmd = Cmd.attempt(task, toMsg);
      const kind = cmdKind(cmd);

      if (kind.kind === 'attempt') {
        const value = await kind.task(new AbortController().signal);
        const msg = kind.toMsg({ ok: true, value });
        expect(msg).toEqual({ type: 'data', result: { ok: true, value: 42 } });
      }
    });
  });

  describe('Cmd.attempt delivers Error result on failure', () => {
    it('maps rejected error to Error result via toMsg', () => {
      const error = new Error('network failure');
      const toMsg = (result: Result<string>) => ({
        type: 'fetch-result' as const,
        result,
      });

      const cmd = Cmd.attempt(() => Promise.reject(error), toMsg);
      const kind = cmdKind(cmd);

      if (kind.kind === 'attempt') {
        const msg = kind.toMsg({ ok: false, error });
        expect(msg).toEqual({
          type: 'fetch-result',
          result: { ok: false, error },
        });
      }
    });
  });

  describe('Cmd.attempt works in Cmd.batch', () => {
    it('can be combined with other commands in a batch', () => {
      type BatchMsg = { type: 'a'; r: Result<number> } | { type: 'b'; r: Result<number> };

      const attempt1: Cmd<BatchMsg> = Cmd.attempt(
        () => Promise.resolve(1),
        (r: Result<number>): BatchMsg => ({ type: 'a', r }),
      );
      const attempt2: Cmd<BatchMsg> = Cmd.attempt(
        () => Promise.resolve(2),
        (r: Result<number>): BatchMsg => ({ type: 'b', r }),
      );

      const batched = Cmd.batch(attempt1, attempt2);
      const kind = cmdKind(batched);
      expect(kind.kind).toBe('batch');
      if (kind.kind === 'batch') {
        expect(kind.cmds).toHaveLength(2);
        expect(cmdKind(kind.cmds[0]!).kind).toBe('attempt');
        expect(cmdKind(kind.cmds[1]!).kind).toBe('attempt');
      }
    });
  });

  describe('Cmd.attempt works in Cmd.sequence', () => {
    it('can be chained in a sequence', () => {
      const attempt = Cmd.attempt(
        () => Promise.resolve('data'),
        (r: Result<string>) => ({ type: 'fetched' as const, r }),
      );
      const none = Cmd.none<{ type: string; r?: unknown }>();

      const seq = Cmd.sequence(attempt, none);
      const kind = cmdKind(seq);
      expect(kind.kind).toBe('sequence');
      if (kind.kind === 'sequence') {
        expect(kind.cmds).toHaveLength(2);
        expect(cmdKind(kind.cmds[0]!).kind).toBe('attempt');
        expect(cmdKind(kind.cmds[1]!).kind).toBe('none');
      }
    });
  });

  describe('Cmd.attempt works with Cmd.map', () => {
    it('can be mapped to transform message type', () => {
      type InnerMsg = { type: 'inner'; r: Result<number> };
      type OuterMsg = { type: 'outer'; inner: InnerMsg };

      const inner = Cmd.attempt<InnerMsg, number>(
        () => Promise.resolve(99),
        (r) => ({ type: 'inner', r }),
      );

      const mapped = Cmd.map(
        inner,
        (msg): OuterMsg => ({
          type: 'outer',
          inner: msg,
        }),
      );

      const kind = cmdKind(mapped);
      expect(kind.kind).toBe('map');
      if (kind.kind === 'map') {
        const innerKind = cmdKind(kind.cmd as Cmd<InnerMsg>);
        expect(innerKind.kind).toBe('attempt');

        // Verify the map function works
        const innerMsg: InnerMsg = { type: 'inner', r: { ok: true, value: 99 } };
        const outerMsg = kind.fn(innerMsg);
        expect(outerMsg).toEqual({
          type: 'outer',
          inner: { type: 'inner', r: { ok: true, value: 99 } },
        });
      }
    });
  });
});

// ─── cmdKind includes attempt ───────────────────────────────────────────────

describe('cmdKind with attempt', () => {
  it('extracts the internal kind from an attempt command', () => {
    const cmd = Cmd.attempt(
      () => Promise.resolve('test'),
      (r: Result<string>) => r,
    );
    expect(cmdKind(cmd).kind).toBe('attempt');
  });
});
