import type { HitRegionInfo } from '@celestial/nebula';
import { describe, expect, it } from 'vitest';
import { createRegionRouter, resolveRegionHandler } from '../region-router.js';

function region(overrides: Partial<HitRegionInfo> & Pick<HitRegionInfo, 'id'>): HitRegionInfo {
  return {
    handlers: {},
    rect: { x: 0, y: 0, width: 10, height: 3 },
    zIndex: 0,
    isHover: false,
    eventPath: [overrides.id],
    ...overrides,
  };
}

describe('createRegionRouter', () => {
  it('routes to the topmost matching region and preserves local coordinates', () => {
    const router = createRegionRouter([
      region({ id: 'base', handlers: { onClick: 'base-click' }, zIndex: 0 }),
      region({ id: 'overlay', handlers: { onClick: 'overlay-click' }, rect: { x: 2, y: 1, width: 4, height: 2 }, zIndex: 5 }),
    ]);

    const match = router.route({ type: 'press', button: 0, x: 3, y: 2, ctrl: false, alt: false, shift: false });

    expect(match?.region.id).toBe('overlay');
    expect(match?.handlerTag).toBe('overlay-click');
    expect(match?.localX).toBe(1);
    expect(match?.localY).toBe(1);
  });

  it('can stop fallthrough at blocking layers', () => {
    const router = createRegionRouter(
      [
        region({ id: 'base', handlers: { onClick: 'base-click' }, zIndex: 0 }),
        region({ id: 'backdrop', handlers: {}, zIndex: 10, metadata: { scope: 'overlay:backdrop' } }),
      ],
      {
        getLayer: (r) => (r.id === 'backdrop' ? { id: 'overlay', blocksBelow: true } : 'base'),
      },
    );

    const match = router.route({ type: 'press', button: 0, x: 1, y: 1, ctrl: false, alt: false, shift: false });

    expect(match).toBeNull();
  });

  it('resolves modifier-aware handlers', () => {
    const target = region({
      id: 'row',
      handlers: { onClick: { default: 'open', shift: 'range-open' } },
    });

    expect(resolveRegionHandler(target, { type: 'press', button: 0, x: 0, y: 0, ctrl: false, alt: false, shift: true })).toBe('range-open');
  });

  it('falls back to mouse-down when a modifier-aware click handler does not match', () => {
    const target = region({
      id: 'row',
      handlers: { onClick: { shift: 'range-open' }, onMouseDown: 'select' },
    });

    expect(resolveRegionHandler(target, { type: 'press', button: 0, x: 0, y: 0, ctrl: false, alt: false, shift: false })).toBe('select');
  });

  it('routes scroll events through onScroll with direction retained on the event', () => {
    const router = createRegionRouter([region({ id: 'list', handlers: { onScroll: 'wheel' } })]);
    const match = router.route({ type: 'scroll-down', button: 'none', x: 4, y: 1, ctrl: false, alt: false, shift: false });

    expect(match?.region.id).toBe('list');
    expect(match?.handlerTag).toBe('wheel');
  });
});
