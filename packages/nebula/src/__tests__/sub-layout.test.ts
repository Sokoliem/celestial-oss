import { describe, expect, it } from 'vitest';
import { type LayoutRects, Sub, subKind } from '../types.js';
import type { LayoutRect } from '../vdom.js';

// ─── Sub.layout Tests ───────────────────────────────────────────────────────

describe('Sub.layout', () => {
  it('creates correct SubKind', () => {
    const ids = ['panel-a', 'panel-b'];
    const toMsg = (rects: LayoutRects) => ({ type: 'layout' as const, rects });
    const sub = Sub.layout(ids, toMsg);

    expect(sub._tag).toBe('sub');
    const kind = subKind(sub);
    expect(kind.kind).toBe('layout');
    if (kind.kind === 'layout') {
      expect(kind.ids).toEqual(['panel-a', 'panel-b']);
      // Verify the toMsg function works correctly
      const testRects: LayoutRects = {
        rects: new Map<string, LayoutRect>([['panel-a', { x: 0, y: 0, width: 40, height: 10 }]]),
      };
      const msg = kind.toMsg(testRects);
      expect(msg).toEqual({ type: 'layout', rects: testRects });
    }
  });

  it('works with empty ids array', () => {
    const sub = Sub.layout<string>([], () => 'empty');

    const kind = subKind(sub);
    expect(kind.kind).toBe('layout');
    if (kind.kind === 'layout') {
      expect(kind.ids).toEqual([]);
    }
  });

  it('works with batch', () => {
    const layoutSub = Sub.layout<string>(['a'], () => 'layout-msg');
    const keySub = Sub.key<string>('q', 'quit');
    const batched = Sub.batch(layoutSub, keySub);

    const kind = subKind(batched);
    expect(kind.kind).toBe('batch');
    if (kind.kind === 'batch') {
      expect(kind.subs).toHaveLength(2);
      const firstKind = subKind(kind.subs[0]!);
      expect(firstKind.kind).toBe('layout');
      const secondKind = subKind(kind.subs[1]!);
      expect(secondKind.kind).toBe('key');
    }
  });

  it('works with map', () => {
    const inner = Sub.layout<number>(['sidebar'], (rects) => rects.rects.size);
    const mapped = Sub.map(inner, (n) => n * 2);

    const kind = subKind(mapped);
    expect(kind.kind).toBe('map');
    if (kind.kind === 'map') {
      const innerKind = subKind(kind.sub as Sub<number>);
      expect(innerKind.kind).toBe('layout');
      if (innerKind.kind === 'layout') {
        expect(innerKind.ids).toEqual(['sidebar']);
        // Inner produces the size, outer doubles it
        const testRects: LayoutRects = {
          rects: new Map<string, LayoutRect>([['sidebar', { x: 0, y: 0, width: 20, height: 30 }]]),
        };
        expect(kind.fn(innerKind.toMsg(testRects))).toBe(2);
      }
    }
  });

  it('layout rects contain requested IDs from LayoutPlan index', () => {
    // Verify the toMsg callback receives only the requested rects
    const receivedRects: LayoutRects[] = [];
    const ids = ['header', 'footer'];
    const sub = Sub.layout(ids, (rects) => {
      receivedRects.push(rects);
      return 'got-rects';
    });

    const kind = subKind(sub);
    expect(kind.kind).toBe('layout');
    if (kind.kind === 'layout') {
      // Simulate what the runtime would do: collect rects for the requested IDs
      const planIndex = new Map<string, { rect: LayoutRect }>([
        ['header', { rect: { x: 0, y: 0, width: 80, height: 3 } }],
        ['footer', { rect: { x: 0, y: 21, width: 80, height: 3 } }],
        ['content', { rect: { x: 0, y: 3, width: 80, height: 18 } }],
      ]);

      // Build the LayoutRects for the requested IDs only
      const rects = new Map<string, LayoutRect>();
      for (const id of kind.ids) {
        const entry = planIndex.get(id);
        if (entry) {
          rects.set(id, entry.rect);
        }
      }

      const result = kind.toMsg({ rects });
      expect(result).toBe('got-rects');
      expect(receivedRects).toHaveLength(1);
      expect(receivedRects[0]!.rects.size).toBe(2);
      expect(receivedRects[0]!.rects.get('header')).toEqual({ x: 0, y: 0, width: 80, height: 3 });
      expect(receivedRects[0]!.rects.get('footer')).toEqual({ x: 0, y: 21, width: 80, height: 3 });
      // 'content' was NOT requested, so it should not be in the result
      expect(receivedRects[0]!.rects.has('content')).toBe(false);
    }
  });

  it('unknown IDs are silently omitted', () => {
    const ids = ['exists', 'does-not-exist'];
    const sub = Sub.layout(ids, (rects) => rects);

    const kind = subKind(sub);
    expect(kind.kind).toBe('layout');
    if (kind.kind === 'layout') {
      // Simulate runtime: only 'exists' is in the plan index
      const planIndex = new Map<string, { rect: LayoutRect }>([['exists', { rect: { x: 5, y: 10, width: 30, height: 15 } }]]);

      const rects = new Map<string, LayoutRect>();
      for (const id of kind.ids) {
        const entry = planIndex.get(id);
        if (entry) {
          rects.set(id, entry.rect);
        }
      }

      const result = kind.toMsg({ rects });
      // Only 'exists' should be in the rects map
      expect(result.rects.size).toBe(1);
      expect(result.rects.get('exists')).toEqual({ x: 5, y: 10, width: 30, height: 15 });
      expect(result.rects.has('does-not-exist')).toBe(false);
    }
  });
});
