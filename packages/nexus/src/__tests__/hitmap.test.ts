import { describe, expect, it } from 'vitest';
import { HitMap, type HitRegion } from '../hitmap.js';

describe('HitMap', () => {
  it('register adds a region', () => {
    const map = new HitMap<string>();
    map.register({ x: 0, y: 0, width: 10, height: 5 });
    expect(map.getAll()).toHaveLength(1);
  });

  it('hitTest returns the region when coords are inside', () => {
    const map = new HitMap<string>();
    const region: HitRegion<string> = { x: 5, y: 5, width: 10, height: 10, onClick: 'clicked' };
    map.register(region);

    const hit = map.hitTest(10, 10);
    expect(hit).toBe(region);
  });

  it('hitTest returns region for coords on the boundary', () => {
    const map = new HitMap<string>();
    const region: HitRegion<string> = { x: 5, y: 5, width: 10, height: 10 };
    map.register(region);

    // Top-left corner
    expect(map.hitTest(5, 5)).toBe(region);
    // Bottom-right corner (x: 5+10-1=14, y: 5+10-1=14)
    expect(map.hitTest(14, 14)).toBe(region);
  });

  it('hitTest returns null when coords are outside', () => {
    const map = new HitMap<string>();
    map.register({ x: 5, y: 5, width: 10, height: 10 });

    expect(map.hitTest(0, 0)).toBeNull();
    expect(map.hitTest(20, 20)).toBeNull();
    expect(map.hitTest(15, 10)).toBeNull(); // just outside right edge
    expect(map.hitTest(10, 15)).toBeNull(); // just outside bottom edge
  });

  it('hitTest returns last registered for overlapping regions (z-order)', () => {
    const map = new HitMap<string>();
    const bottom: HitRegion<string> = { x: 0, y: 0, width: 20, height: 20, onClick: 'bottom' };
    const top: HitRegion<string> = { x: 5, y: 5, width: 10, height: 10, onClick: 'top' };
    map.register(bottom);
    map.register(top);

    // Point in overlap area
    const hit = map.hitTest(10, 10);
    expect(hit).toBe(top);
    expect(hit?.onClick).toBe('top');

    // Point only in bottom
    const hitBottom = map.hitTest(1, 1);
    expect(hitBottom).toBe(bottom);
    expect(hitBottom?.onClick).toBe('bottom');
  });

  it('clear removes all regions', () => {
    const map = new HitMap<string>();
    map.register({ x: 0, y: 0, width: 10, height: 10 });
    map.register({ x: 5, y: 5, width: 10, height: 10 });
    expect(map.getAll()).toHaveLength(2);

    map.clear();
    expect(map.getAll()).toHaveLength(0);
    expect(map.hitTest(5, 5)).toBeNull();
  });

  it('getAll returns all registered regions', () => {
    const map = new HitMap<string>();
    const r1: HitRegion<string> = { x: 0, y: 0, width: 5, height: 5 };
    const r2: HitRegion<string> = { x: 10, y: 10, width: 5, height: 5 };
    const r3: HitRegion<string> = { x: 20, y: 20, width: 5, height: 5 };
    map.register(r1);
    map.register(r2);
    map.register(r3);

    const all = map.getAll();
    expect(all).toHaveLength(3);
    expect(all).toContain(r1);
    expect(all).toContain(r2);
    expect(all).toContain(r3);
  });

  it('regions with onClick store handlers correctly', () => {
    const map = new HitMap<{ action: string; id: number }>();
    const region: HitRegion<{ action: string; id: number }> = {
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      onClick: { action: 'navigate', id: 42 },
    };
    map.register(region);

    const hit = map.hitTest(5, 5);
    expect(hit?.onClick).toEqual({ action: 'navigate', id: 42 });
  });

  it('regions with onHover store handlers correctly', () => {
    const map = new HitMap<string>();
    const region: HitRegion<string> = {
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      onHover: {
        enter: 'hover-enter',
        exit: 'hover-exit',
      },
    };
    map.register(region);

    const hit = map.hitTest(5, 5);
    expect(hit?.onHover?.enter).toBe('hover-enter');
    expect(hit?.onHover?.exit).toBe('hover-exit');
  });

  it('regions with cursor property store it correctly', () => {
    const map = new HitMap<string>();
    const region: HitRegion<string> = {
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      cursor: 'pointer',
    };
    map.register(region);

    const hit = map.hitTest(5, 5);
    expect(hit?.cursor).toBe('pointer');
  });
});
