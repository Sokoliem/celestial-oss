import { getVNodeMeta } from '@celestial/core/nebula';
import { describe, expect, it, vi } from 'vitest';
import { getScrollbarMetrics, scrollbar } from '../scrollbar.js';

describe('scrollbar metrics', () => {
  it('uses viewport-to-total geometry rather than track length as the viewport', () => {
    expect(getScrollbarMetrics(100, 20, 10, 40)).toEqual({
      needsScroll: true,
      total: 100,
      viewport: 20,
      trackLength: 10,
      maxOffset: 80,
      scroll: 40,
      thumbSize: 2,
      thumbOffset: 4,
    });
  });

  it('normalizes malformed and content-fitting geometry', () => {
    expect(getScrollbarMetrics(Number.NaN, Number.POSITIVE_INFINITY, -5, Number.NaN)).toEqual({
      needsScroll: false,
      total: 0,
      viewport: 0,
      trackLength: 0,
      maxOffset: 0,
      scroll: 0,
      thumbSize: 0,
      thumbOffset: 0,
    });
    expect(getScrollbarMetrics(4, 10, 3, 99)).toMatchObject({
      needsScroll: false,
      maxOffset: 0,
      scroll: 0,
      thumbSize: 3,
      thumbOffset: 0,
    });
    expect(getScrollbarMetrics(Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE)).toMatchObject({
      needsScroll: false,
      total: 100_000,
      viewport: 100_000,
      trackLength: 100_000,
      scroll: 0,
    });
  });
});

describe('scrollbar interactions', () => {
  it('clamps wheel and keyboard paths and reports only actual user changes', () => {
    const onScroll = vi.fn();
    const component = scrollbar({ total: 10, viewport: 4, trackLength: 4, step: 3, onScroll });
    const [model] = component.init();
    const [down] = component.update({ type: 'sb-wheel', direction: 1 }, model);
    expect(down.scroll).toBe(3);
    const [ended] = component.update({ type: 'sb-end' }, down);
    expect(ended.scroll).toBe(6);
    const [stillEnded] = component.update({ type: 'sb-wheel', direction: 1 }, ended);
    expect(stillEnded).toBe(ended);
    expect(onScroll.mock.calls.map(([value]) => value)).toEqual([3, 6]);
  });

  it('isolates host callback failures', () => {
    const component = scrollbar({
      total: 20,
      viewport: 5,
      onScroll: () => {
        throw new Error('host failed');
      },
    });
    const [model] = component.init();
    expect(() => component.update({ type: 'sb-page', direction: 1 }, model)).not.toThrow();
    expect(component.update({ type: 'sb-page', direction: 1 }, model)[0].scroll).toBe(5);
  });

  it('pages the track, drags beyond the track, and rolls back on Escape cancellation', () => {
    const onScroll = vi.fn();
    const component = scrollbar({ total: 100, viewport: 20, trackLength: 10, onScroll });
    const [model] = component.init();
    const [paged] = component.update({ type: 'sb-press', cell: 8, pointer: 20 }, model);
    expect(paged.scroll).toBe(20);
    expect(paged.drag).toBeNull();

    const [pressed] = component.update({ type: 'sb-press', cell: 0, pointer: 10 }, model);
    expect(pressed.drag).toMatchObject({ pointerStart: 10, thumbStart: 0, scrollStart: 0 });
    const [dragged] = component.update({ type: 'sb-drag', pointer: 1000 }, pressed);
    expect(dragged.scroll).toBe(80);
    const [cancelled] = component.update({ type: 'sb-cancel' }, dragged);
    expect(cancelled.scroll).toBe(0);
    expect(cancelled.drag).toBeNull();
    expect(onScroll.mock.calls.map(([value]) => value)).toEqual([20, 80, 0]);
  });

  it('commits a thumb drag when the pointer is released outside the track', () => {
    const component = scrollbar({ total: 100, viewport: 20, trackLength: 10 });
    const [model] = component.init();
    const [pressed] = component.update({ type: 'sb-press', cell: 0, pointer: 10 }, model);
    const [dragged] = component.update({ type: 'sb-drag', pointer: 14 }, pressed);
    const [released] = component.update({ type: 'sb-release' }, dragged);
    expect(released.scroll).toBe(40);
    expect(released.drag).toBeNull();
  });

  it('keeps newer hover state when a stale cell leave arrives', () => {
    const component = scrollbar({ total: 20, viewport: 5 });
    const [model] = component.init();
    const [first] = component.update({ type: 'sb-hover', cell: 0 }, model);
    const [second] = component.update({ type: 'sb-hover', cell: 1 }, first);
    const [staleLeave] = component.update({ type: 'sb-leave', cell: 0 }, second);
    expect(staleLeave.hoveredCell).toBe(1);
  });

  it('synchronizes controlled geometry without echoing callbacks or retaining drag', () => {
    const onScroll = vi.fn();
    const component = scrollbar({ total: 100, viewport: 10, scroll: 90, onScroll });
    const [model] = component.init();
    const [pressed] = component.update({ type: 'sb-press', cell: 9, pointer: 9 }, model);
    const [synced] = component.update({ type: 'sb-sync-geometry', total: 8, viewport: 8, trackLength: 4 }, pressed);
    expect(synced).toMatchObject({ total: 8, viewport: 8, trackLength: 4, scroll: 0, drag: null });
    expect(onScroll).not.toHaveBeenCalled();
  });

  it('publishes pointer handlers, drag cursor metadata, and accessible numeric state', () => {
    const component = scrollbar({ id: 'audit-scroll', label: 'Audit log', total: 100, viewport: 20, trackLength: 5 });
    const [model] = component.init();
    const view = component.view(model);
    expect(view.kind).toBe('column');
    expect(getVNodeMeta(view)?.a11y).toMatchObject({
      role: 'slider',
      label: 'Audit log',
      valueMin: 0,
      valueMax: 80,
      valueNow: 0,
    });
    if (view.kind !== 'column') throw new Error('Expected vertical scrollbar');
    const thumb = view.children[0];
    expect(thumb?.kind).toBe('event');
    if (thumb?.kind !== 'event') throw new Error('Expected event-wrapped thumb');
    expect(thumb.handlers).toMatchObject({
      onMouseDown: 'audit-scroll:press',
      onMouseEnter: 'audit-scroll:hover',
      onMouseLeave: 'audit-scroll:leave',
      onScroll: 'audit-scroll:scroll',
    });
    expect(thumb.metadata?.cursor).toBe('grab');
  });

  it('exposes orientation-correct keyboard parity only while focused', () => {
    const component = scrollbar({ total: 20, viewport: 5, orientation: 'horizontal', focused: true });
    const [model] = component.init();
    const subscription = component.subscriptions?.(model) as unknown as {
      _kind: { kind: string; subs: Array<{ _kind: { key?: string } }> };
    };
    const keys = subscription._kind.subs.map((entry) => entry._kind.key).filter(Boolean);
    expect(keys).toEqual(expect.arrayContaining(['left', 'right', 'pageup', 'pagedown', 'home', 'end']));

    const [blurred] = component.update({ type: 'sb-blur' }, model);
    const blurredSubscription = component.subscriptions?.(blurred) as unknown as { _kind: { kind: string; subs?: unknown[] } };
    expect(blurredSubscription._kind.kind).toBe('batch');
    expect(blurredSubscription._kind.subs).toHaveLength(1);
  });
});
