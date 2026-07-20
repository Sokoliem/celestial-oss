import { describe, expect, it } from 'vitest';
import { type HoverTarget, hoverIntent, hoverIntentKeys, preserveScroll, resolveHoverIntentConfig } from '../hover-intent/index.js';

function createTarget(): HoverTarget {
  return {
    id: 'help-panel',
    contains: (x, y) => x >= 10 && x < 30 && y >= 5 && y < 12,
  };
}

describe('@celestial/nexus/hover-intent', () => {
  it('progresses tooltip to overlay and back while preserving scroll', () => {
    const scrollSurface = { scrollLeft: 14, scrollTop: 27 };
    const target = {
      ...createTarget(),
      scrollPreservation: preserveScroll(scrollSurface),
    };

    const events: string[] = [];
    const handle = hoverIntent({
      target,
      tooltip: {
        onEnter: () => {
          events.push('tooltip-enter');
          return 'tooltip-enter';
        },
        onLeave: () => {
          events.push('tooltip-leave');
          return 'tooltip-leave';
        },
      },
      overlay: {
        dwellMs: 200,
        preserveScroll: true,
        onOpen: () => {
          events.push('overlay-open');
          return 'overlay-open';
        },
        onClose: () => {
          events.push('overlay-close');
          return 'overlay-close';
        },
      },
    });

    expect(handle.state()).toBe('idle');

    const entered = handle.dispatch({ type: 'move', x: 12, y: 6, timestamp: 1000 });
    expect(entered).toEqual([]);
    expect(handle.state()).toBe('idle');

    const tooltip = handle.dispatch({ type: 'tick', timestamp: 1300 });
    expect(tooltip).toEqual(['tooltip-enter']);
    expect(handle.state()).toBe('tooltip');

    const overlay = handle.dispatch({ type: 'tick', timestamp: 1500 });
    expect(overlay).toEqual(['overlay-open']);
    expect(handle.state()).toBe('overlay');

    scrollSurface.scrollLeft = 2;
    scrollSurface.scrollTop = 3;

    const closed = handle.dispatch({ type: 'key', key: 'escape' });
    expect(closed).toEqual(['overlay-close']);
    expect(handle.state()).toBe('tooltip');
    expect(scrollSurface).toEqual({ scrollLeft: 14, scrollTop: 27 });

    const leaving = handle.dispatch({ type: 'move', x: 0, y: 0, timestamp: 1700 });
    expect(leaving).toEqual([]);
    expect(handle.state()).toBe('tooltip');

    const closedAfterGrace = handle.dispatch({ type: 'tick', timestamp: 1800 });
    expect(closedAfterGrace).toEqual(['tooltip-leave']);
    expect(handle.state()).toBe('idle');
    expect(events).toEqual(['tooltip-enter', 'overlay-open', 'overlay-close', 'tooltip-leave']);
  });

  it('supports keyboard parity helpers for tooltip and overlay forcing', () => {
    const target = createTarget();
    const handle = hoverIntent({
      target,
      tooltip: {
        onEnter: () => 'tooltip-enter',
        onLeave: () => 'tooltip-leave',
      },
      overlay: {
        onOpen: () => 'overlay-open',
        onClose: () => 'overlay-close',
      },
    });

    const sub = hoverIntentKeys(handle, {
      tooltipKey: 't',
      overlayKey: 'o',
      closeKey: 'escape',
    });

    expect(sub).toBeDefined();
    expect(handle.forceState('tooltip')).toEqual(['tooltip-enter']);
    expect(handle.state()).toBe('tooltip');
    expect(handle.forceState('overlay')).toEqual(['overlay-open']);
    expect(handle.state()).toBe('overlay');
    expect(handle.dispatch({ type: 'key', key: 'escape' })).toEqual(['overlay-close']);
    expect(handle.state()).toBe('tooltip');
    expect(handle.dispatch({ type: 'key', key: 'escape' })).toEqual(['tooltip-leave']);
    expect(handle.state()).toBe('idle');
  });

  it('returns the full tooltip and overlay lifecycle when overlay is forced from idle', () => {
    const handle = hoverIntent({
      target: createTarget(),
      tooltip: {
        onEnter: () => 'tooltip-enter',
        onLeave: () => 'tooltip-leave',
      },
      overlay: {
        onOpen: () => 'overlay-open',
        onClose: () => 'overlay-close',
      },
    });

    expect(handle.forceState('overlay')).toEqual(['tooltip-enter', 'overlay-open']);
    expect(handle.state()).toBe('overlay');
  });

  it('accepts normalized and legacy escape key casing when closing', () => {
    const makeHandle = () =>
      hoverIntent({
        target: createTarget(),
        tooltip: {
          onEnter: () => 'tooltip-enter',
          onLeave: () => 'tooltip-leave',
        },
        overlay: {
          onOpen: () => 'overlay-open',
          onClose: () => 'overlay-close',
        },
      });

    const lowercase = makeHandle();
    lowercase.forceState('overlay');
    expect(lowercase.dispatch({ type: 'key', key: 'escape' })).toEqual(['overlay-close']);
    expect(lowercase.state()).toBe('tooltip');

    const legacy = makeHandle();
    legacy.forceState('overlay');
    expect(legacy.dispatch({ type: 'key', key: 'Escape' })).toEqual(['overlay-close']);
    expect(legacy.state()).toBe('tooltip');
  });

  it('keeps the subpath controller config additive and normalized', () => {
    const resolved = resolveHoverIntentConfig({
      target: 'help-panel',
      tooltip: {
        onEnter: () => 'tooltip-enter',
        onLeave: () => 'tooltip-leave',
      },
      overlay: {
        onOpen: () => 'overlay-open',
        onClose: () => 'overlay-close',
      },
    });

    expect(resolved).toMatchObject({
      target: { id: 'help-panel' },
      respectReduceMotion: true,
    });
    expect(resolved.tooltip).toMatchObject({ dwellMs: 300 });
    expect(resolved.overlay).toMatchObject({ dwellMs: 800 });

    const handle = hoverIntent({
      target: resolved.target,
      tooltip: {
        onEnter: () => 'tooltip-enter',
        onLeave: () => 'tooltip-leave',
      },
    });

    expect(handle.subscription).toBeDefined();
    expect(handle.dispatch({ type: 'move', x: 12, y: 6, timestamp: 0 })).toEqual([]);
  });
});
