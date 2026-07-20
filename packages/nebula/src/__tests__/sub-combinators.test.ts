import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sub, subKind } from '../types.js';

describe('Sub combinators', () => {
  describe('Sub.filter()', () => {
    it('creates sub with filter kind', () => {
      const inner = Sub.mouse<string>((ev) => `click:${ev.x}`);
      const filtered = Sub.filter(inner, (msg) => msg.startsWith('click'));
      const kind = subKind(filtered);
      expect(kind.kind).toBe('filter');
      if (kind.kind === 'filter') {
        expect(kind.predicate).toBeTypeOf('function');
      }
    });

    it('preserves inner sub', () => {
      const inner = Sub.mouse<string>((ev) => `${ev.x}`);
      const filtered = Sub.filter(inner, () => true);
      const kind = subKind(filtered);
      if (kind.kind === 'filter') {
        const innerKind = subKind(kind.sub as Sub<string>);
        expect(innerKind.kind).toBe('mouse');
      }
    });
  });

  describe('Sub.throttle()', () => {
    it('creates sub with throttle kind and ms', () => {
      const inner = Sub.mouse<string>((ev) => `${ev.x}`);
      const throttled = Sub.throttle(inner, 200);
      const kind = subKind(throttled);
      expect(kind.kind).toBe('throttle');
      if (kind.kind === 'throttle') {
        expect(kind.ms).toBe(200);
      }
    });
  });

  describe('Sub.debounce()', () => {
    it('creates sub with debounce kind and ms', () => {
      const inner = Sub.key<string>('a', 'pressed-a');
      const debounced = Sub.debounce(inner, 300);
      const kind = subKind(debounced);
      expect(kind.kind).toBe('debounce');
      if (kind.kind === 'debounce') {
        expect(kind.ms).toBe(300);
      }
    });
  });

  describe('Sub.distinct()', () => {
    it('creates sub with distinct kind', () => {
      const inner = Sub.mouse<string>((ev) => `${ev.x}`);
      const distinctSub = Sub.distinct(inner);
      const kind = subKind(distinctSub);
      expect(kind.kind).toBe('distinct');
    });

    it('preserves custom equals function', () => {
      const eq = (a: string, b: string) => a === b;
      const inner = Sub.mouse<string>((ev) => `${ev.x}`);
      const distinctSub = Sub.distinct(inner, eq);
      const kind = subKind(distinctSub);
      if (kind.kind === 'distinct') {
        expect(kind.equals).toBe(eq);
      }
    });

    it('has undefined equals when not provided', () => {
      const inner = Sub.mouse<string>((ev) => `${ev.x}`);
      const distinctSub = Sub.distinct(inner);
      const kind = subKind(distinctSub);
      if (kind.kind === 'distinct') {
        expect(kind.equals).toBeUndefined();
      }
    });
  });

  describe('composition', () => {
    it('combinators nest correctly', () => {
      const inner = Sub.mouse<string>((ev) => `${ev.x}`);
      const composed = Sub.throttle(
        Sub.filter(inner, () => true),
        100,
      );
      const outerKind = subKind(composed);
      expect(outerKind.kind).toBe('throttle');
      if (outerKind.kind === 'throttle') {
        const innerKind = subKind(outerKind.sub as Sub<string>);
        expect(innerKind.kind).toBe('filter');
      }
    });

    it('works inside Sub.batch', () => {
      const s = Sub.batch(
        Sub.filter(
          Sub.mouse<string>((ev) => `${ev.x}`),
          () => true,
        ),
        Sub.key<string>('b', 'b'),
      );
      const kind = subKind(s);
      expect(kind.kind).toBe('batch');
    });

    it('works with Sub.map', () => {
      const inner = Sub.filter(
        Sub.mouse<number>((ev) => ev.x),
        (x) => x > 0,
      );
      const mapped = Sub.map(inner, (x) => String(x));
      const kind = subKind(mapped);
      expect(kind.kind).toBe('map');
    });
  });

  describe('predicate/equals callability', () => {
    it('filter predicate is callable and returns correct booleans', () => {
      const pred = (msg: string) => msg.startsWith('click');
      const inner = Sub.mouse<string>((ev) => `click:${ev.x}`);
      const filtered = Sub.filter(inner, pred);
      const kind = subKind(filtered);
      if (kind.kind === 'filter') {
        const predFn = kind.predicate as (msg: string) => boolean;
        expect(predFn('click:5')).toBe(true);
        expect(predFn('hover:5')).toBe(false);
      }
    });

    it('distinct equals function is callable and returns correct booleans', () => {
      const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
      const inner = Sub.key<string>('a', 'A');
      const distinctSub = Sub.distinct(inner, eq);
      const kind = subKind(distinctSub);
      if (kind.kind === 'distinct') {
        const eqFn = kind.equals as (a: string, b: string) => boolean;
        expect(eqFn('Hello', 'hello')).toBe(true);
        expect(eqFn('Hello', 'World')).toBe(false);
      }
    });
  });
});

// ─── Runtime integration tests ───────────────────────────────────
// These test the dispatch override mechanism inside app() to verify
// that filter/distinct actually suppress messages at runtime.

interface RuntimeState {
  size: { cols: number; rows: number };
  writes: string[];
  inputHandler: ((data: Buffer) => void) | null;
  resizeHandler: (() => void) | null;
}

async function loadRuntime() {
  const state: RuntimeState = {
    size: { cols: 80, rows: 24 },
    writes: [],
    inputHandler: null,
    resizeHandler: null,
  };

  vi.resetModules();
  vi.doMock('../terminal.js', async () => {
    const actual = await vi.importActual<typeof import('../terminal.js')>('../terminal.js');
    return {
      ...actual,
      createTerminal: () => ({
        enterRawMode() {},
        exitRawMode() {},
        write(data: string) {
          state.writes.push(data);
        },
        onInput(handler: (data: Buffer) => void) {
          state.inputHandler = handler;
        },
        offInput(handler: (data: Buffer) => void) {
          if (state.inputHandler === handler) {
            state.inputHandler = null;
          }
        },
        onResize(handler: () => void) {
          state.resizeHandler = handler;
        },
        offResize(handler: () => void) {
          if (state.resizeHandler === handler) {
            state.resizeHandler = null;
          }
        },
        getSize() {
          return state.size;
        },
      }),
    };
  });

  const [{ app }, { Cmd, Sub }] = await Promise.all([import('../app.js'), import('../types.js')]);

  return { state, app, Cmd, Sub };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('Sub.filter runtime behavior', () => {
  it('suppresses key messages that fail the predicate', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();
    const dispatched: string[] = [];

    const handle = app<number, string>({
      init: () => [0, Cmd.none()],
      update: (msg, model) => {
        dispatched.push(msg);
        return [model + 1, Cmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () => Sub.filter(Sub.batch(Sub.key('a', 'pressed-a'), Sub.key('b', 'pressed-b')), (msg) => msg === 'pressed-a'),
    });

    // Press 'a' — should pass filter
    state.inputHandler?.(Buffer.from('a', 'utf8'));
    expect(dispatched).toEqual(['pressed-a']);

    // Press 'b' — should be blocked by filter
    state.inputHandler?.(Buffer.from('b', 'utf8'));
    expect(dispatched).toEqual(['pressed-a']);

    handle.stop();
  });

  it('filter with always-false predicate blocks all messages', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();
    const dispatched: string[] = [];

    const handle = app<number, string>({
      init: () => [0, Cmd.none()],
      update: (msg, model) => {
        dispatched.push(msg);
        return [model + 1, Cmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () => Sub.filter(Sub.key('x', 'pressed-x'), () => false),
    });

    state.inputHandler?.(Buffer.from('x', 'utf8'));
    expect(dispatched).toEqual([]);

    handle.stop();
  });

  it('filter with always-true predicate passes all messages', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();
    const dispatched: string[] = [];

    const handle = app<number, string>({
      init: () => [0, Cmd.none()],
      update: (msg, model) => {
        dispatched.push(msg);
        return [model + 1, Cmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () => Sub.filter(Sub.key('y', 'pressed-y'), () => true),
    });

    state.inputHandler?.(Buffer.from('y', 'utf8'));
    expect(dispatched).toEqual(['pressed-y']);

    handle.stop();
  });
});

describe('Sub.distinct runtime behavior', () => {
  it('suppresses duplicate consecutive key messages', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();
    const dispatched: string[] = [];

    const handle = app<number, string>({
      init: () => [0, Cmd.none()],
      update: (msg, model) => {
        dispatched.push(msg);
        return [model + 1, Cmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () => Sub.distinct(Sub.key('a', 'pressed-a')),
    });

    // First press — should dispatch
    state.inputHandler?.(Buffer.from('a', 'utf8'));
    expect(dispatched).toEqual(['pressed-a']);

    // Second press of same key — same message, should be suppressed
    state.inputHandler?.(Buffer.from('a', 'utf8'));
    expect(dispatched).toEqual(['pressed-a']);

    handle.stop();
  });

  it('dispatches when message changes between presses', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();
    const dispatched: string[] = [];

    const handle = app<number, string>({
      init: () => [0, Cmd.none()],
      update: (msg, model) => {
        dispatched.push(msg);
        return [model + 1, Cmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () => Sub.distinct(Sub.batch(Sub.key('a', 'pressed-a'), Sub.key('b', 'pressed-b'))),
    });

    state.inputHandler?.(Buffer.from('a', 'utf8'));
    expect(dispatched).toEqual(['pressed-a']);

    // Different message — should dispatch
    state.inputHandler?.(Buffer.from('b', 'utf8'));
    expect(dispatched).toEqual(['pressed-a', 'pressed-b']);

    // Same as last — should be suppressed
    state.inputHandler?.(Buffer.from('b', 'utf8'));
    expect(dispatched).toEqual(['pressed-a', 'pressed-b']);

    // Back to first — should dispatch (different from last)
    state.inputHandler?.(Buffer.from('a', 'utf8'));
    expect(dispatched).toEqual(['pressed-a', 'pressed-b', 'pressed-a']);

    handle.stop();
  });

  it('uses custom equals function for distinct', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();
    const dispatched: string[] = [];

    // Custom equals: treat 'pressed-a' and 'pressed-A' as the same
    const caseInsensitiveEq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

    const handle = app<number, string>({
      init: () => [0, Cmd.none()],
      update: (msg, model) => {
        dispatched.push(msg);
        return [model + 1, Cmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () => Sub.distinct(Sub.batch(Sub.key('a', 'pressed-a'), Sub.key('b', 'PRESSED-A')), caseInsensitiveEq),
    });

    // First 'a' press — should dispatch
    state.inputHandler?.(Buffer.from('a', 'utf8'));
    expect(dispatched).toEqual(['pressed-a']);

    // Press 'b' which maps to 'PRESSED-A' — case-insensitive equal, should be suppressed
    state.inputHandler?.(Buffer.from('b', 'utf8'));
    expect(dispatched).toEqual(['pressed-a']);

    handle.stop();
  });
});
