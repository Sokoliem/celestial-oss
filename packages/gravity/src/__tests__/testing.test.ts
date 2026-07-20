import type { RowNode, VNode } from '@celestial/nebula';
import { describe, expect, it } from 'vitest';
import { createSplitterController, splitter } from '../splitter.js';
import { createMockMeasurementContext, fakeNow, resolveTree, simulateScroll, simulateSplitterDrag, tickModel } from '../testing.js';
import { createScrollController, virtualList } from '../virtual-list.js';

describe('testing helpers', () => {
  describe('createMockMeasurementContext', () => {
    it('defaults to 80x24 with available + container matching terminal', () => {
      const ctx = createMockMeasurementContext();
      expect(ctx.terminal).toEqual({ cols: 80, rows: 24 });
      expect(ctx.available).toEqual({ cols: 80, rows: 24 });
      expect(ctx.container).toEqual({ cols: 80, rows: 24 });
    });

    it('honors overrides for cols/rows and lets available/container differ', () => {
      const ctx = createMockMeasurementContext({
        cols: 120,
        rows: 40,
        available: { cols: 100, rows: 30 },
        container: { cols: 50, rows: 20 },
      });
      expect(ctx.terminal).toEqual({ cols: 120, rows: 40 });
      expect(ctx.available).toEqual({ cols: 100, rows: 30 });
      expect(ctx.container).toEqual({ cols: 50, rows: 20 });
    });

    it('clamps cols/rows to a positive minimum', () => {
      const ctx = createMockMeasurementContext({ cols: 0, rows: -3 });
      expect(ctx.terminal).toEqual({ cols: 1, rows: 1 });
    });
  });

  describe('resolveTree', () => {
    it('renders a single-level component to its static children', () => {
      const node = splitter({
        direction: 'row',
        panes: [
          { id: 'a', child: { kind: 'text', content: 'A' }, weight: 1 },
          { id: 'b', child: { kind: 'text', content: 'B' }, weight: 1 },
        ],
      });
      const tree = resolveTree(node) as RowNode;
      expect(tree.kind).toBe('row');
      expect(tree.children.length).toBeGreaterThan(0);
    });

    it('returns non-component nodes unchanged', () => {
      const text: VNode = { kind: 'text', content: 'hi' };
      expect(resolveTree(text)).toBe(text);
    });

    it('throws when a component infinitely re-renders itself', () => {
      const loop: VNode = {
        kind: 'component',
        render: () => loop,
      };
      expect(() => resolveTree(loop)).toThrow(/infinite render loop/);
    });
  });

  describe('simulateSplitterDrag', () => {
    it('translates a width change into a normalized weight via the controller', () => {
      const controller = createSplitterController({
        panes: [
          { id: 'left', child: { kind: 'empty' }, weight: 0.5 },
          { id: 'right', child: { kind: 'empty' }, weight: 0.5 },
        ],
      });
      simulateSplitterDrag(controller, { leading: 'left', totalAxis: 80, fromWidth: 40, toWidth: 50 });
      expect(controller.getWeight('left')).toBeCloseTo(50 / 80, 5);
      expect(controller.getWeight('right')).toBeCloseTo(30 / 80, 5);
    });

    it('clamps target width to [0, totalAxis]', () => {
      const controller = createSplitterController({
        panes: [
          { id: 'a', child: { kind: 'empty' }, weight: 0.5 },
          { id: 'b', child: { kind: 'empty' }, weight: 0.5 },
        ],
      });
      simulateSplitterDrag(controller, { leading: 'a', totalAxis: 60, fromWidth: 30, toWidth: 999 });
      expect(controller.getWeight('a')).toBeCloseTo(1, 5);
    });
  });

  describe('simulateScroll', () => {
    it('advances the controller offset by delta', () => {
      const controller = createScrollController({ viewportHeight: 30 });
      const node = virtualList({
        items: Array.from({ length: 100 }, (_, i) => `i-${i}`),
        estimateSize: 3,
        viewportHeight: 30,
        renderItem: (item) => ({ kind: 'text', content: item }),
        controller,
      });
      resolveTree(node);
      simulateScroll(controller, 30);
      expect(controller.offset()).toBe(30);
      simulateScroll(controller, -10);
      expect(controller.offset()).toBe(20);
    });
  });

  describe('fakeNow', () => {
    it('starts at 0 and advances monotonically', () => {
      const clock = fakeNow();
      expect(clock.now()).toBe(0);
      clock.advance(50);
      expect(clock.now()).toBe(50);
      clock.advance(25);
      expect(clock.now()).toBe(75);
    });

    it('rejects negative advances', () => {
      const clock = fakeNow(100);
      clock.advance(-200);
      expect(clock.now()).toBe(100);
    });

    it('reset() jumps to a specific value', () => {
      const clock = fakeNow(50);
      clock.reset(200);
      expect(clock.now()).toBe(200);
      clock.reset();
      expect(clock.now()).toBe(0);
    });
  });

  describe('tickModel', () => {
    it('advances a model over a duration at the specified step', () => {
      type M = { count: number; latestNow: number };
      type Msg = { type: 'tick'; now: number };
      const start: M = { count: 0, latestNow: 0 };
      const result = tickModel<M, Msg>(start, {
        duration: 100,
        step: 25,
        tick: (now) => ({ type: 'tick', now }),
        update: (msg, m) => ({ count: m.count + 1, latestNow: msg.now }),
      });
      expect(result.model.count).toBe(4); // 25, 50, 75, 100
      expect(result.now).toBe(100);
      expect(result.model.latestNow).toBe(100);
    });

    it('halts early when `until` returns true', () => {
      const start = { value: 0 };
      const result = tickModel<typeof start, { now: number }>(start, {
        duration: 1000,
        step: 16,
        tick: (now) => ({ now }),
        update: (msg) => ({ value: msg.now }),
        until: (m) => m.value >= 100,
      });
      expect(result.model.value).toBeGreaterThanOrEqual(100);
      expect(result.now).toBeLessThan(200);
    });
  });
});
