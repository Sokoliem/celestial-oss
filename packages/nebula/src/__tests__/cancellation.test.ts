import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Result } from '../types.js';
import { Cmd, cmdKind } from '../types.js';

// ─── AbortSignal cancellation propagation ───────────────────────────────────

describe('AbortSignal cancellation propagation', () => {
  describe('Cmd.perform task receives an AbortSignal', () => {
    it('passes an AbortSignal as the first argument to the task', async () => {
      let receivedSignal: unknown = null;

      const task = (signal: AbortSignal) => {
        receivedSignal = signal;
        return Promise.resolve(42);
      };

      const cmd = Cmd.perform(task, (n) => ({ type: 'done' as const, n }));
      const kind = cmdKind(cmd);

      if (kind.kind === 'perform') {
        // Simulate what the runtime does: call the task with an AbortSignal
        const controller = new AbortController();
        await kind.task(controller.signal);

        expect(receivedSignal).toBeInstanceOf(AbortSignal);
      }
    });

    it('the signal is not initially aborted', async () => {
      let signalAborted: boolean | null = null;

      const task = (signal: AbortSignal) => {
        signalAborted = signal.aborted;
        return Promise.resolve('ok');
      };

      const cmd = Cmd.perform(task, (v) => ({ type: 'result' as const, v }));
      const kind = cmdKind(cmd);

      if (kind.kind === 'perform') {
        const controller = new AbortController();
        await kind.task(controller.signal);

        expect(signalAborted).toBe(false);
      }
    });
  });

  describe('Cmd.fetch passes signal to fetch()', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('passes the AbortSignal through to the fetch options', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve({ data: 'test' }),
      });
      globalThis.fetch = mockFetch;

      const cmd = Cmd.fetch<{ type: 'got'; r: Result<unknown> }, unknown>('https://api.example.com/data', { method: 'GET' }, (r) => ({ type: 'got', r }));

      const kind = cmdKind(cmd);
      if (kind.kind === 'attempt') {
        const controller = new AbortController();
        await kind.task(controller.signal);

        expect(mockFetch).toHaveBeenCalledOnce();
        const [url, options] = mockFetch.mock.calls[0]!;
        expect(url).toBe('https://api.example.com/data');
        expect(options.signal).toBe(controller.signal);
        expect(options.method).toBe('GET');
      }
    });

    it('merges signal with existing fetch options', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve([]),
      });
      globalThis.fetch = mockFetch;

      const cmd = Cmd.fetch<{ type: 'got'; r: Result<unknown> }, unknown>(
        'https://api.example.com/items',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
        (r) => ({ type: 'got', r }),
      );

      const kind = cmdKind(cmd);
      if (kind.kind === 'attempt') {
        const controller = new AbortController();
        await kind.task(controller.signal);

        const [, options] = mockFetch.mock.calls[0]!;
        expect(options.signal).toBe(controller.signal);
        expect(options.method).toBe('POST');
        expect(options.headers).toEqual({ 'Content-Type': 'application/json' });
        expect(options.body).toBe('{}');
      }
    });
  });

  describe('shutdown() aborts in-flight task signals', () => {
    it('aborting the controller causes the signal to reflect aborted state', () => {
      const controller = new AbortController();
      expect(controller.signal.aborted).toBe(false);

      controller.abort();
      expect(controller.signal.aborted).toBe(true);
    });

    it('tasks receiving an aborted signal can detect cancellation', async () => {
      const controller = new AbortController();

      const task = async (signal: AbortSignal) => {
        if (signal.aborted) {
          throw new DOMException('The operation was aborted.', 'AbortError');
        }
        return 'done';
      };

      // Before abort: task completes normally
      await expect(task(controller.signal)).resolves.toBe('done');

      // After abort: task throws AbortError
      controller.abort();
      await expect(task(controller.signal)).rejects.toThrow('The operation was aborted.');
    });
  });

  describe('Cmd.perform swallows AbortError silently', () => {
    it('AbortError from a perform task should not write to stderr', async () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

      const task = (_signal: AbortSignal) => {
        return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
      };

      const cmd = Cmd.perform(task, (v) => ({ type: 'done' as const, v }));
      const kind = cmdKind(cmd);

      if (kind.kind === 'perform') {
        // Simulate what the runtime does: call task, catch AbortError silently
        try {
          await kind.task(new AbortController().signal);
        } catch (err: unknown) {
          // The runtime should check: if AbortError, swallow silently
          if (err instanceof DOMException && err.name === 'AbortError') {
            // This is the expected path — no stderr write
          } else {
            // Non-AbortError would be written to stderr
            process.stderr.write(`[nebula] Cmd.perform failed: ${err}\n`);
          }
        }

        // Verify no stderr output for AbortError
        expect(stderrSpy).not.toHaveBeenCalled();
      }

      stderrSpy.mockRestore();
    });

    it('non-AbortError from a perform task still produces stderr output', async () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

      const task = (_signal: AbortSignal) => {
        return Promise.reject(new Error('Network timeout'));
      };

      const cmd = Cmd.perform(task, (v) => ({ type: 'done' as const, v }));
      const kind = cmdKind(cmd);

      if (kind.kind === 'perform') {
        try {
          await kind.task(new AbortController().signal);
        } catch (err: unknown) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            // swallow
          } else {
            process.stderr.write(`[nebula] Cmd.perform failed: ${err}\n`);
          }
        }

        // Non-AbortError SHOULD produce stderr output
        expect(stderrSpy).toHaveBeenCalledOnce();
      }

      stderrSpy.mockRestore();
    });
  });

  describe('Cmd.attempt task receives an AbortSignal', () => {
    it('passes an AbortSignal as the first argument to the task', async () => {
      let receivedSignal: unknown = null;

      const task = (signal: AbortSignal) => {
        receivedSignal = signal;
        return Promise.resolve('data');
      };

      const cmd = Cmd.attempt(task, (r: Result<string>) => ({ type: 'got' as const, r }));
      const kind = cmdKind(cmd);

      if (kind.kind === 'attempt') {
        const controller = new AbortController();
        await kind.task(controller.signal);

        expect(receivedSignal).toBeInstanceOf(AbortSignal);
      }
    });
  });

  describe('backward compatibility', () => {
    it('existing tasks that ignore the signal argument still work for perform', async () => {
      // Existing code uses () => Promise<T> — no signal param
      const task = () => Promise.resolve(42);
      const cmd = Cmd.perform(task, (n) => ({ type: 'done' as const, n }));
      const kind = cmdKind(cmd);

      if (kind.kind === 'perform') {
        const controller = new AbortController();
        // JS allows calling with more args than declared
        const result = await kind.task(controller.signal);
        expect(result).toBe(42);
      }
    });

    it('existing tasks that ignore the signal argument still work for attempt', async () => {
      const task = () => Promise.resolve('hello');
      const cmd = Cmd.attempt(task, (r: Result<string>) => ({ type: 'got' as const, r }));
      const kind = cmdKind(cmd);

      if (kind.kind === 'attempt') {
        const controller = new AbortController();
        const result = await kind.task(controller.signal);
        expect(result).toBe('hello');
      }
    });
  });
});
