import { describe, expect, it } from 'vitest';
import { createLayerHitMap, type LayeredRegion } from '../layer-hitmap.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function region(id: string, layerId: string, x: number, y: number, w: number, h: number): LayeredRegion {
  return { id, layerId, handlers: {}, x, y, width: w, height: h };
}

// ---------------------------------------------------------------------------
// createLayerHitMap
// ---------------------------------------------------------------------------

describe('createLayerHitMap', () => {
  it('creates an empty hit map', () => {
    const map = createLayerHitMap(10, 5);
    expect(map.hitTest(0, 0)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// register + hitTest
// ---------------------------------------------------------------------------

describe('register and hitTest', () => {
  it('registers a region and makes it hittable', () => {
    const map = createLayerHitMap(20, 10);
    map.register(region('btn', 'base', 2, 1, 5, 3));

    const hit = map.hitTest(3, 2);
    expect(hit).toBeDefined();
    expect(hit!.id).toBe('btn');
    expect(hit!.layerId).toBe('base');
  });

  it('returns topmost layer region for overlapping layers', () => {
    const map = createLayerHitMap(20, 10);
    map.register(region('bg', 'base', 0, 0, 20, 10));
    map.register(region('dialog', 'modal', 5, 3, 10, 4));

    // In overlap: modal layer wins
    const hit = map.hitTest(8, 5);
    expect(hit!.id).toBe('dialog');

    // Outside modal but inside base
    const hitBase = map.hitTest(2, 1);
    expect(hitBase!.id).toBe('bg');
  });

  it('returns undefined for out-of-bounds coordinates', () => {
    const map = createLayerHitMap(10, 5);
    map.register(region('btn', 'base', 0, 0, 10, 5));

    expect(map.hitTest(-1, 0)).toBeUndefined();
    expect(map.hitTest(0, -1)).toBeUndefined();
    expect(map.hitTest(10, 0)).toBeUndefined();
    expect(map.hitTest(0, 5)).toBeUndefined();
  });

  it('clips regions to grid bounds', () => {
    const map = createLayerHitMap(10, 5);
    map.register(region('overflow', 'base', 8, 3, 5, 5));

    expect(map.hitTest(9, 4)!.id).toBe('overflow');
    expect(map.hitTest(12, 6)).toBeUndefined();
  });

  it('last-registered wins within the same layer', () => {
    const map = createLayerHitMap(20, 10);
    map.register(region('first', 'base', 0, 0, 10, 10));
    map.register(region('second', 'base', 3, 3, 4, 4));

    expect(map.hitTest(5, 5)!.id).toBe('second');
    expect(map.hitTest(1, 1)!.id).toBe('first');
  });
});

// ---------------------------------------------------------------------------
// hitTestInLayer
// ---------------------------------------------------------------------------

describe('hitTestInLayer', () => {
  it('returns region only from the specified layer', () => {
    const map = createLayerHitMap(20, 10);
    map.register(region('bg', 'base', 0, 0, 20, 10));
    map.register(region('dialog', 'modal', 5, 3, 10, 4));

    // Should find base region even in modal overlap area
    const hitBase = map.hitTestInLayer(8, 5, 'base');
    expect(hitBase!.id).toBe('bg');

    // Should find modal region
    const hitModal = map.hitTestInLayer(8, 5, 'modal');
    expect(hitModal!.id).toBe('dialog');
  });

  it('returns undefined for nonexistent layer', () => {
    const map = createLayerHitMap(10, 5);
    map.register(region('btn', 'base', 0, 0, 5, 3));

    expect(map.hitTestInLayer(2, 1, 'nope')).toBeUndefined();
  });

  it('returns undefined for out-of-bounds', () => {
    const map = createLayerHitMap(10, 5);
    map.register(region('btn', 'base', 0, 0, 5, 3));

    expect(map.hitTestInLayer(-1, 0, 'base')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// hitTestAll
// ---------------------------------------------------------------------------

describe('hitTestAll', () => {
  it('returns empty array when no regions contain the point', () => {
    const map = createLayerHitMap(10, 5);
    expect(map.hitTestAll(5, 3)).toEqual([]);
  });

  it('returns all regions across layers in topmost-first order', () => {
    const map = createLayerHitMap(20, 10);
    map.register(region('bg', 'base', 0, 0, 20, 10));
    map.register(region('dialog', 'modal', 5, 3, 10, 4));
    map.register(region('tooltip', 'overlay', 6, 4, 4, 2));

    const hits = map.hitTestAll(8, 5);
    expect(hits).toHaveLength(3);
    expect(hits[0]!.id).toBe('tooltip');
    expect(hits[1]!.id).toBe('dialog');
    expect(hits[2]!.id).toBe('bg');
  });

  it('returns empty array for out-of-bounds', () => {
    const map = createLayerHitMap(10, 5);
    map.register(region('btn', 'base', 0, 0, 5, 3));

    expect(map.hitTestAll(-1, 0)).toEqual([]);
    expect(map.hitTestAll(10, 0)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getLayerRegions
// ---------------------------------------------------------------------------

describe('getLayerRegions', () => {
  it('returns all regions in a layer', () => {
    const map = createLayerHitMap(20, 10);
    map.register(region('a', 'base', 0, 0, 5, 3));
    map.register(region('b', 'base', 5, 0, 5, 3));
    map.register(region('c', 'modal', 3, 3, 4, 4));

    const baseRegions = map.getLayerRegions('base');
    expect(baseRegions).toHaveLength(2);
    expect(baseRegions.map((r) => r.id).sort()).toEqual(['a', 'b']);
  });

  it('returns empty array for nonexistent layer', () => {
    const map = createLayerHitMap(10, 5);
    expect(map.getLayerRegions('nope')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// clear
// ---------------------------------------------------------------------------

describe('clear', () => {
  it('removes all regions and layers', () => {
    const map = createLayerHitMap(20, 10);
    map.register(region('a', 'base', 0, 0, 10, 5));
    map.register(region('b', 'modal', 2, 2, 6, 3));

    map.clear();
    expect(map.hitTest(5, 3)).toBeUndefined();
    expect(map.getLayerRegions('base')).toEqual([]);
    expect(map.getLayerRegions('modal')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// clearLayer
// ---------------------------------------------------------------------------

describe('clearLayer', () => {
  it('removes only regions from the specified layer', () => {
    const map = createLayerHitMap(20, 10);
    map.register(region('bg', 'base', 0, 0, 20, 10));
    map.register(region('dialog', 'modal', 5, 3, 10, 4));

    map.clearLayer('modal');

    // Base still works
    expect(map.hitTest(2, 1)!.id).toBe('bg');
    // Modal is gone
    expect(map.getLayerRegions('modal')).toEqual([]);
    // In the overlap area, only base is left
    expect(map.hitTest(8, 5)!.id).toBe('bg');
  });

  it('handles clearing nonexistent layer gracefully', () => {
    const map = createLayerHitMap(10, 5);
    map.clearLayer('nope'); // should not throw
    expect(map.hitTest(0, 0)).toBeUndefined();
  });
});
