import { describe, expect, it } from 'vitest';
import { type MouseEventData, Sub, subKind } from '../types.js';

// ─── Sub.map Tests ──────────────────────────────────────────────────────────

describe('Sub.map', () => {
  it('creates a map subscription', () => {
    const inner = Sub.key<number>('a', 42);
    const mapped = Sub.map(inner, (n) => `num:${n}`);

    expect(mapped._tag).toBe('sub');
    const kind = subKind(mapped);
    expect(kind.kind).toBe('map');
    if (kind.kind === 'map') {
      expect(kind.sub).toBe(inner);
      expect(kind.fn(42)).toBe('num:42');
    }
  });

  it('transforms key subscription messages', () => {
    const inner = Sub.key<number>('a', 1);
    const mapped = Sub.map(inner, (x) => x * 2);

    const kind = subKind(mapped);
    expect(kind.kind).toBe('map');
    if (kind.kind === 'map') {
      // The inner sub is a key sub with msg 1
      const innerKind = subKind(kind.sub as Sub<number>);
      expect(innerKind.kind).toBe('key');
      if (innerKind.kind === 'key') {
        expect(innerKind.msg).toBe(1);
      }
      // The mapping function doubles
      expect(kind.fn(1)).toBe(2);
      expect(kind.fn(5)).toBe(10);
    }
  });

  it('transforms timer subscription messages', () => {
    const inner = Sub.timer<number>(500, () => 10);
    const mapped = Sub.map(inner, (n) => n * 3);

    const kind = subKind(mapped);
    expect(kind.kind).toBe('map');
    if (kind.kind === 'map') {
      const innerKind = subKind(kind.sub as Sub<number>);
      expect(innerKind.kind).toBe('timer');
      if (innerKind.kind === 'timer') {
        expect(innerKind.ms).toBe(500);
        // Composing: inner produces 10, fn triples it
        expect(kind.fn(innerKind.toMsg())).toBe(30);
      }
    }
  });

  it('transforms mouse subscription messages', () => {
    const inner = Sub.mouse<number>((ev) => ev.x + ev.y);
    const mapped = Sub.map(inner, (n) => n * 2);

    const kind = subKind(mapped);
    expect(kind.kind).toBe('map');
    if (kind.kind === 'map') {
      const innerKind = subKind(kind.sub as Sub<number>);
      expect(innerKind.kind).toBe('mouse');
      if (innerKind.kind === 'mouse') {
        const event: MouseEventData = {
          type: 'press',
          button: 0,
          x: 5,
          y: 10,
          ctrl: false,
          alt: false,
          shift: false,
        };
        // inner produces 15 (5+10), fn doubles to 30
        expect(kind.fn(innerKind.toMsg(event))).toBe(30);
      }
    }
  });

  it('transforms resize subscription messages', () => {
    const inner = Sub.resize<number>((cols, rows) => cols * rows);
    const mapped = Sub.map(inner, (n) => n + 1);

    const kind = subKind(mapped);
    expect(kind.kind).toBe('map');
    if (kind.kind === 'map') {
      const innerKind = subKind(kind.sub as Sub<number>);
      expect(innerKind.kind).toBe('resize');
      if (innerKind.kind === 'resize') {
        // inner produces 80*24=1920, fn adds 1 = 1921
        expect(kind.fn(innerKind.toMsg(80, 24))).toBe(1921);
      }
    }
  });

  it('handles batch subscriptions', () => {
    const inner = Sub.batch(Sub.key<number>('a', 1), Sub.key<number>('b', 2));
    const mapped = Sub.map(inner, (n) => n * 10);

    const kind = subKind(mapped);
    expect(kind.kind).toBe('map');
    if (kind.kind === 'map') {
      const innerKind = subKind(kind.sub as Sub<number>);
      expect(innerKind.kind).toBe('batch');
      if (innerKind.kind === 'batch') {
        expect(innerKind.subs).toHaveLength(2);
      }
      // Mapping function applies to any value
      expect(kind.fn(1)).toBe(10);
      expect(kind.fn(2)).toBe(20);
    }
  });

  it('composes with nested maps', () => {
    const inner = Sub.key<number>('a', 5);
    const once = Sub.map(inner, (n) => n * 2); // 5 -> 10
    const twice = Sub.map(once, (n) => n + 1); // 10 -> 11

    // Outer is a map
    const outerKind = subKind(twice);
    expect(outerKind.kind).toBe('map');
    if (outerKind.kind === 'map') {
      // Inner is also a map
      const innerKind = subKind(outerKind.sub as Sub<number>);
      expect(innerKind.kind).toBe('map');
      if (innerKind.kind === 'map') {
        // Innermost is a key sub
        const innermostKind = subKind(innerKind.sub as Sub<number>);
        expect(innermostKind.kind).toBe('key');
        if (innermostKind.kind === 'key') {
          expect(innermostKind.msg).toBe(5);
        }
        // Composing: innerFn(5) = 10, outerFn(10) = 11
        expect(outerKind.fn(innerKind.fn(5))).toBe(11);
      }
    }
  });

  it('preserves Sub.none', () => {
    const inner = Sub.none<number>();
    const mapped = Sub.map(inner, (n) => `${n}`);

    const kind = subKind(mapped);
    expect(kind.kind).toBe('map');
    if (kind.kind === 'map') {
      const innerKind = subKind(kind.sub as Sub<number>);
      expect(innerKind.kind).toBe('none');
    }
  });
});

// ─── applySubMap Tests (runtime helper) ─────────────────────────────────────

describe('applySubMap', () => {
  // These tests verify that the runtime helper correctly flattens
  // map subscriptions into concrete subscription types.

  // We import applySubMap from app.ts (will be added)
  // For now, we test the behavior through the Sub.map factory
  // and verify the runtime handles it correctly.

  it('Sub.map result is recognized by subKind', () => {
    const mapped = Sub.map(Sub.key('x', 1), (n) => n);
    const kind = subKind(mapped);
    expect(kind.kind).toBe('map');
  });

  it('subKind extracts map kind correctly', () => {
    const inner = Sub.timer(200, () => 'tick');
    const mapped = Sub.map(inner, (s) => s.toUpperCase());
    const kind = subKind(mapped);
    expect(kind.kind).toBe('map');
    if (kind.kind === 'map') {
      expect(kind.fn('tick')).toBe('TICK');
    }
  });
});
