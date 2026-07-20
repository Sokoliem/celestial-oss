import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Result } from '../types.js';
import { Cmd, cmdKind } from '../types.js';

// ─── Cmd.fetch ──────────────────────────────────────────────────────────────

describe('Cmd.fetch', () => {
  describe('command structure', () => {
    it('creates an attempt-style command', () => {
      const cmd = Cmd.fetch<{ type: 'got'; r: Result<unknown> }, unknown>('https://api.example.com/data', {}, (r) => ({ type: 'got', r }));

      expect(cmd._tag).toBe('cmd');
      const kind = cmdKind(cmd);
      // Cmd.fetch is sugar over attempt, so the internal kind is 'attempt'
      expect(kind.kind).toBe('attempt');
    });

    it('stores the toMsg function that can be called with a result', () => {
      type Msg = { type: 'fetched'; data: Result<{ name: string }> };

      const cmd = Cmd.fetch<Msg, { name: string }>('https://api.example.com/user', { method: 'GET' }, (r): Msg => ({ type: 'fetched', data: r }));

      const kind = cmdKind(cmd);
      if (kind.kind === 'attempt') {
        const successResult: Result<{ name: string }> = { ok: true, value: { name: 'Alice' } };
        const msg = kind.toMsg(successResult) as Msg;
        expect(msg).toEqual({
          type: 'fetched',
          data: { ok: true, value: { name: 'Alice' } },
        });
      }
    });

    it('toMsg handles error results', () => {
      type Msg = { type: 'fetched'; data: Result<string> };

      const cmd = Cmd.fetch<Msg, string>('https://api.example.com/data', {}, (r): Msg => ({ type: 'fetched', data: r }));

      const kind = cmdKind(cmd);
      if (kind.kind === 'attempt') {
        const errorResult: Result<string> = { ok: false, error: new Error('not found') };
        const msg = kind.toMsg(errorResult) as Msg;
        expect(msg).toEqual({
          type: 'fetched',
          data: { ok: false, error: expect.any(Error) },
        });
      }
    });
  });

  describe('task execution with mocked fetch', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      // We'll set up fetch mocks per-test
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('calls fetch with the provided URL and options', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve({ id: 1 }),
      });
      globalThis.fetch = mockFetch;

      const cmd = Cmd.fetch<unknown, unknown>('https://api.example.com/items', { method: 'POST', body: '{"name":"test"}' }, (r) => r);

      const kind = cmdKind(cmd);
      if (kind.kind === 'attempt') {
        await kind.task(new AbortController().signal);

        expect(mockFetch).toHaveBeenCalledOnce();
        expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/items', expect.objectContaining({ method: 'POST', body: '{"name":"test"}' }));
      }
    });

    it('resolves with parsed JSON on success', async () => {
      const responseData = { users: [{ id: 1, name: 'Alice' }] };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve(responseData),
      });

      const cmd = Cmd.fetch<unknown, unknown>('https://api.example.com/users', {}, (r) => r);

      const kind = cmdKind(cmd);
      if (kind.kind === 'attempt') {
        const result = await kind.task(new AbortController().signal);
        expect(result).toEqual(responseData);
      }
    });

    it('throws on non-ok HTTP response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: () => Promise.resolve({ error: 'not found' }),
      });

      const cmd = Cmd.fetch<unknown, unknown>('https://api.example.com/missing', {}, (r) => r);

      const kind = cmdKind(cmd);
      if (kind.kind === 'attempt') {
        await expect(kind.task(new AbortController().signal)).rejects.toThrow('HTTP 404: Not Found');
      }
    });

    it('throws on network error', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const cmd = Cmd.fetch<unknown, unknown>('https://api.example.com/data', {}, (r) => r);

      const kind = cmdKind(cmd);
      if (kind.kind === 'attempt') {
        await expect(kind.task(new AbortController().signal)).rejects.toThrow('Network error');
      }
    });
  });

  describe('composition with other Cmd combinators', () => {
    it('works inside Cmd.batch', () => {
      type Msg = { type: 'users'; r: Result<unknown> } | { type: 'posts'; r: Result<unknown> };

      const fetchUsers: Cmd<Msg> = Cmd.fetch('https://api.example.com/users', {}, (r): Msg => ({ type: 'users', r }));
      const fetchPosts: Cmd<Msg> = Cmd.fetch('https://api.example.com/posts', {}, (r): Msg => ({ type: 'posts', r }));

      const batched = Cmd.batch(fetchUsers, fetchPosts);
      const kind = cmdKind(batched);

      expect(kind.kind).toBe('batch');
      if (kind.kind === 'batch') {
        expect(kind.cmds).toHaveLength(2);
        expect(cmdKind(kind.cmds[0]!).kind).toBe('attempt');
        expect(cmdKind(kind.cmds[1]!).kind).toBe('attempt');
      }
    });

    it('works with Cmd.map', () => {
      type InnerMsg = { type: 'data'; r: Result<string> };
      type OuterMsg = { type: 'outer'; inner: InnerMsg };

      const inner = Cmd.fetch<InnerMsg, string>('https://api.example.com/data', {}, (r): InnerMsg => ({ type: 'data', r }));

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
      }
    });
  });
});
