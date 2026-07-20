// @ts-nocheck
import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../app.js';
import { text } from '../../elements.js';
import { convertSub, isProperSub } from '../../hot.js';
import { Cmd, Sub, subKind } from '../../types.js';

// ─── Test helpers ────────────────────────────────────────────────────────────

type TestModel = { count: number; label: string };
type TestMsg = 'inc' | 'dec';

function _makeConfig(): AppConfig<TestModel, TestMsg> {
  return {
    init: () => [{ count: 0, label: 'test' }, Cmd.none()],
    update: (msg, model) => {
      if (msg === 'inc') return [{ ...model, count: model.count + 1 }, Cmd.none()];
      return [{ ...model, count: model.count - 1 }, Cmd.none()];
    },
    view: (model) => text(`${model.label}:${model.count}`),
    subscriptions: () => Sub.key('a', 'inc' as TestMsg),
  };
}

function _makeRawConfig() {
  return {
    init: () => [{ count: 0, label: 'raw' }, { kind: 'none' }],
    update: (msg: string, model: TestModel) => {
      if (msg === 'inc') return [{ ...model, count: model.count + 1 }, { kind: 'none' }];
      return [model, { kind: 'none' }];
    },
    view: (model: TestModel) => ({ kind: 'text', content: `${model.label}:${model.count}` }),
    subscriptions: () => ({
      kind: 'batch',
      subs: [
        { kind: 'key', key: 'a', msg: 'inc' },
        { kind: 'timer', ms: 100, toMsg: () => 'tick' },
      ],
    }),
  };
}

function _makeMockLoader(rawConfig: any) {
  return vi.fn().mockResolvedValue({
    exports: { default: rawConfig },
    elapsed: 5,
  });
}

function _makeMockResolveExport() {
  return (exports: Record<string, unknown>) => {
    return (exports as any).default ?? exports;
  };
}

function _makeMockHandle() {
  return {
    stop: vi.fn(),
    suspend: vi.fn(),
    resume: vi.fn(),
    replaceConfig: vi.fn(),
    model: { count: 0, label: 'test' },
  };
}

// ─── convertSub ─────────────────────────────────────────────────────────────

describe('convertSub', () => {
  it('converts plain none sub', () => {
    const result = convertSub({ kind: 'none' });
    expect(isProperSub(result)).toBe(true);
    expect(subKind(result).kind).toBe('none');
  });

  it('converts plain key sub', () => {
    const result = convertSub({ kind: 'key', key: 'x', msg: 'pressed' });
    expect(isProperSub(result)).toBe(true);
    const kind = subKind(result);
    expect(kind.kind).toBe('key');
    if (kind.kind === 'key') {
      expect(kind.key).toBe('x');
      expect(kind.msg).toBe('pressed');
    }
  });

  it('converts plain timer sub', () => {
    const toMsg = () => 'tick';
    const result = convertSub({ kind: 'timer', ms: 200, toMsg });
    expect(isProperSub(result)).toBe(true);
    const kind = subKind(result);
    expect(kind.kind).toBe('timer');
    if (kind.kind === 'timer') {
      expect(kind.ms).toBe(200);
    }
  });

  it('converts plain batch sub recursively', () => {
    const result = convertSub({
      kind: 'batch',
      subs: [
        { kind: 'key', key: 'a', msg: 'one' },
        { kind: 'key', key: 'b', msg: 'two' },
      ],
    });
    expect(isProperSub(result)).toBe(true);
    const kind = subKind(result);
    expect(kind.kind).toBe('batch');
    if (kind.kind === 'batch') {
      expect(kind.subs).toHaveLength(2);
      expect(isProperSub(kind.subs[0]!)).toBe(true);
      expect(isProperSub(kind.subs[1]!)).toBe(true);
    }
  });

  it('passes through proper Sub unchanged', () => {
    const proper = Sub.key('z', 'msg');
    const result = convertSub(proper);
    expect(result).toBe(proper);
  });

  it('handles null/undefined as Sub.none()', () => {
    expect(subKind(convertSub(null)).kind).toBe('none');
    expect(subKind(convertSub(undefined)).kind).toBe('none');
  });

  it('converts plain resize sub', () => {
    const toMsg = (cols: number, rows: number) => `${cols}x${rows}`;
    const result = convertSub({ kind: 'resize', toMsg });
    expect(isProperSub(result)).toBe(true);
    expect(subKind(result).kind).toBe('resize');
  });

  it('converts plain keyWithModifiers sub', () => {
    const result = convertSub({ kind: 'keyWithModifiers', key: 's', modifiers: { ctrl: true }, msg: 'save' });
    expect(isProperSub(result)).toBe(true);
    expect(subKind(result).kind).toBe('keyWithModifiers');
  });

  it('converts plain keyEvent sub', () => {
    const toMsg = (event: any) => `key:${event.key}`;
    const result = convertSub({ kind: 'keyEvent', toMsg });
    expect(isProperSub(result)).toBe(true);
    expect(subKind(result).kind).toBe('keyEvent');
  });

  it('converts plain layout sub', () => {
    const toMsg = (rects: any) => `layout:${JSON.stringify(rects)}`;
    const result = convertSub({ kind: 'layout', ids: ['box1', 'box2'], toMsg });
    expect(isProperSub(result)).toBe(true);
    expect(subKind(result).kind).toBe('layout');
  });

  it('converts plain stream sub', () => {
    const result = convertSub({ kind: 'stream', id: 'ws', setup: () => ({ onData: () => {} }), toMsg: (d: any) => d });
    expect(isProperSub(result)).toBe(true);
    expect(subKind(result).kind).toBe('stream');
  });

  it('converts combinator subs (map, debounce, throttle, filter, distinct)', () => {
    const inner = { kind: 'key', key: 'a', msg: 'x' };

    const mapped = convertSub({ kind: 'map', sub: inner, fn: (x: any) => `mapped:${x}` });
    expect(isProperSub(mapped)).toBe(true);
    expect(subKind(mapped).kind).toBe('map');

    const debounced = convertSub({ kind: 'debounce', sub: inner, ms: 200 });
    expect(isProperSub(debounced)).toBe(true);
    expect(subKind(debounced).kind).toBe('debounce');

    const throttled = convertSub({ kind: 'throttle', sub: inner, ms: 100 });
    expect(isProperSub(throttled)).toBe(true);
    expect(subKind(throttled).kind).toBe('throttle');

    const filtered = convertSub({ kind: 'filter', sub: inner, predicate: () => true });
    expect(isProperSub(filtered)).toBe(true);
    expect(subKind(filtered).kind).toBe('filter');

    const distinct = convertSub({ kind: 'distinct', sub: inner });
    expect(isProperSub(distinct)).toBe(true);
    expect(subKind(distinct).kind).toBe('distinct');
  });

  it('converts timer sub with static message value', () => {
    const result = convertSub({ kind: 'timer', ms: 100, toMsg: 'tick' });
    expect(isProperSub(result)).toBe(true);
    const kind = subKind(result);
    expect(kind.kind).toBe('timer');
    if (kind.kind === 'timer') {
      // Sub.timer wraps static values into () => M
      expect(typeof kind.toMsg).toBe('function');
      expect(kind.toMsg()).toBe('tick');
    }
  });
});
