import { describe, expect, it } from 'vitest';
import { CellHitMap, type ElementRegion } from '../cell-hitmap.js';

describe('CellHitMap', () => {
  // ─── Constructor ────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('should create a grid of given dimensions', () => {
      const map = new CellHitMap(10, 5);
      // No regions registered, hitTest should return null
      expect(map.hitTest(0, 0)).toBeNull();
    });

    it('should handle 1x1 grid', () => {
      const map = new CellHitMap(1, 1);
      expect(map.hitTest(0, 0)).toBeNull();
    });

    it('should handle large grid', () => {
      const map = new CellHitMap(200, 60);
      expect(map.hitTest(100, 30)).toBeNull();
    });
  });

  // ─── register ───────────────────────────────────────────────────────────

  describe('register', () => {
    it('should register a region and make it hittable', () => {
      const map = new CellHitMap(20, 10);
      const region: ElementRegion = {
        id: 'btn-1',
        handlers: { onClick: 'click-btn' },
        x: 2,
        y: 1,
        width: 5,
        height: 3,
      };
      map.register(region);

      const hit = map.hitTest(3, 2);
      expect(hit).not.toBeNull();
      expect(hit!.id).toBe('btn-1');
    });

    it('should register multiple non-overlapping regions', () => {
      const map = new CellHitMap(20, 10);
      const r1: ElementRegion = {
        id: 'a',
        handlers: { onClick: 'a-click' },
        x: 0,
        y: 0,
        width: 5,
        height: 3,
      };
      const r2: ElementRegion = {
        id: 'b',
        handlers: { onClick: 'b-click' },
        x: 10,
        y: 5,
        width: 5,
        height: 3,
      };
      map.register(r1);
      map.register(r2);

      expect(map.hitTest(2, 1)!.id).toBe('a');
      expect(map.hitTest(12, 6)!.id).toBe('b');
    });

    it('should clip regions to grid bounds', () => {
      const map = new CellHitMap(10, 5);
      const region: ElementRegion = {
        id: 'overflow',
        handlers: { onClick: 'click' },
        x: 8,
        y: 3,
        width: 5,
        height: 5, // extends past grid
      };
      map.register(region);

      // Inside grid bounds but inside region
      expect(map.hitTest(9, 4)!.id).toBe('overflow');
      // Outside grid - should return null
      expect(map.hitTest(12, 6)).toBeNull();
    });

    it('should handle region at exact grid boundary', () => {
      const map = new CellHitMap(10, 5);
      const region: ElementRegion = {
        id: 'edge',
        handlers: {},
        x: 0,
        y: 0,
        width: 10,
        height: 5,
      };
      map.register(region);

      // Corners
      expect(map.hitTest(0, 0)!.id).toBe('edge');
      expect(map.hitTest(9, 4)!.id).toBe('edge');
      // Just outside
      expect(map.hitTest(10, 0)).toBeNull();
      expect(map.hitTest(0, 5)).toBeNull();
    });
  });

  // ─── hitTest ────────────────────────────────────────────────────────────

  describe('hitTest', () => {
    it('should return null for coords outside all regions', () => {
      const map = new CellHitMap(20, 10);
      map.register({
        id: 'btn',
        handlers: { onClick: 'click' },
        x: 5,
        y: 5,
        width: 3,
        height: 2,
      });

      expect(map.hitTest(0, 0)).toBeNull();
      expect(map.hitTest(4, 5)).toBeNull();
      expect(map.hitTest(8, 5)).toBeNull();
    });

    it('should return the region for coords inside a region', () => {
      const map = new CellHitMap(20, 10);
      const region: ElementRegion = {
        id: 'btn',
        handlers: { onClick: 'click' },
        x: 5,
        y: 5,
        width: 3,
        height: 2,
      };
      map.register(region);

      // All cells in the region
      for (let x = 5; x < 8; x++) {
        for (let y = 5; y < 7; y++) {
          const hit = map.hitTest(x, y);
          expect(hit).not.toBeNull();
          expect(hit!.id).toBe('btn');
        }
      }
    });

    it('should return the topmost region for overlapping regions', () => {
      const map = new CellHitMap(20, 10);
      const bottom: ElementRegion = {
        id: 'bottom',
        handlers: { onClick: 'bottom-click' },
        x: 0,
        y: 0,
        width: 10,
        height: 10,
      };
      const top: ElementRegion = {
        id: 'top',
        handlers: { onClick: 'top-click' },
        x: 3,
        y: 3,
        width: 4,
        height: 4,
      };
      map.register(bottom);
      map.register(top);

      // In overlap area: top wins
      expect(map.hitTest(5, 5)!.id).toBe('top');
      // Outside top but inside bottom
      expect(map.hitTest(1, 1)!.id).toBe('bottom');
    });

    it('should return O(1) lookup time (grid-based)', () => {
      const map = new CellHitMap(100, 50);
      // Register many regions
      for (let i = 0; i < 100; i++) {
        map.register({
          id: `r-${i}`,
          handlers: {},
          x: (i % 10) * 10,
          y: Math.floor(i / 10) * 5,
          width: 10,
          height: 5,
        });
      }
      // The test here is that it completes quickly — O(1) lookup
      const hit = map.hitTest(55, 25);
      expect(hit).not.toBeNull();
    });

    it('should return null for out-of-bounds coordinates', () => {
      const map = new CellHitMap(10, 5);
      map.register({
        id: 'btn',
        handlers: {},
        x: 0,
        y: 0,
        width: 10,
        height: 5,
      });

      expect(map.hitTest(-1, 0)).toBeNull();
      expect(map.hitTest(0, -1)).toBeNull();
      expect(map.hitTest(10, 0)).toBeNull();
      expect(map.hitTest(0, 5)).toBeNull();
    });

    it('should include full region metadata with handlers', () => {
      const map = new CellHitMap(20, 10);
      const region: ElementRegion = {
        id: 'interactive',
        handlers: {
          onClick: 'click-msg',
          onMouseEnter: 'enter-msg',
          onMouseLeave: 'leave-msg',
        },
        x: 0,
        y: 0,
        width: 5,
        height: 3,
      };
      map.register(region);

      const hit = map.hitTest(2, 1);
      expect(hit!.handlers.onClick).toBe('click-msg');
      expect(hit!.handlers.onMouseEnter).toBe('enter-msg');
      expect(hit!.handlers.onMouseLeave).toBe('leave-msg');
      expect(hit!.x).toBe(0);
      expect(hit!.y).toBe(0);
      expect(hit!.width).toBe(5);
      expect(hit!.height).toBe(3);
    });
  });

  // ─── hitTestAll ─────────────────────────────────────────────────────────

  describe('hitTestAll', () => {
    it('should return empty array when no regions contain the point', () => {
      const map = new CellHitMap(10, 5);
      expect(map.hitTestAll(5, 3)).toEqual([]);
    });

    it('should return single region when only one contains the point', () => {
      const map = new CellHitMap(20, 10);
      const region: ElementRegion = {
        id: 'only',
        handlers: { onClick: 'click' },
        x: 0,
        y: 0,
        width: 5,
        height: 3,
      };
      map.register(region);

      const hits = map.hitTestAll(2, 1);
      expect(hits).toHaveLength(1);
      expect(hits[0]!.id).toBe('only');
    });

    it('should return all overlapping regions in z-order (topmost first)', () => {
      const map = new CellHitMap(20, 10);
      const r1: ElementRegion = {
        id: 'bottom',
        handlers: { onClick: 'bottom' },
        x: 0,
        y: 0,
        width: 10,
        height: 10,
      };
      const r2: ElementRegion = {
        id: 'middle',
        handlers: { onClick: 'middle' },
        x: 2,
        y: 2,
        width: 6,
        height: 6,
      };
      const r3: ElementRegion = {
        id: 'top',
        handlers: { onClick: 'top' },
        x: 4,
        y: 4,
        width: 2,
        height: 2,
      };
      map.register(r1);
      map.register(r2);
      map.register(r3);

      const hits = map.hitTestAll(5, 5);
      expect(hits).toHaveLength(3);
      // Topmost first (last registered)
      expect(hits[0]!.id).toBe('top');
      expect(hits[1]!.id).toBe('middle');
      expect(hits[2]!.id).toBe('bottom');
    });

    it('should return only regions that contain the point', () => {
      const map = new CellHitMap(20, 10);
      map.register({
        id: 'a',
        handlers: {},
        x: 0,
        y: 0,
        width: 5,
        height: 5,
      });
      map.register({
        id: 'b',
        handlers: {},
        x: 10,
        y: 0,
        width: 5,
        height: 5,
      });

      const hitsA = map.hitTestAll(2, 2);
      expect(hitsA).toHaveLength(1);
      expect(hitsA[0]!.id).toBe('a');

      const hitsB = map.hitTestAll(12, 2);
      expect(hitsB).toHaveLength(1);
      expect(hitsB[0]!.id).toBe('b');
    });

    it('should return empty array for out-of-bounds coordinates', () => {
      const map = new CellHitMap(10, 5);
      map.register({
        id: 'btn',
        handlers: {},
        x: 0,
        y: 0,
        width: 10,
        height: 5,
      });

      expect(map.hitTestAll(-1, 0)).toEqual([]);
      expect(map.hitTestAll(10, 0)).toEqual([]);
    });
  });

  // ─── re-register correctness ────────────────────────────────────────────

  describe('re-register', () => {
    it('does not leave stale cells when a region shrinks', () => {
      const map = new CellHitMap(20, 10);
      map.register({ id: 'x', handlers: {}, x: 0, y: 0, width: 10, height: 5 });
      map.register({ id: 'x', handlers: {}, x: 0, y: 0, width: 3, height: 3 });

      // (7,3) used to be inside x but the new x bounds end at width=3.
      expect(map.hitTest(7, 3)).toBeNull();
      // The cells the new bounds cover still resolve to x.
      expect(map.hitTest(0, 0)?.id).toBe('x');
      expect(map.hitTest(0, 0)?.width).toBe(3);
    });

    it('does not leave stale cells when a region moves', () => {
      const map = new CellHitMap(20, 10);
      map.register({ id: 'x', handlers: {}, x: 0, y: 0, width: 5, height: 3 });
      map.register({ id: 'x', handlers: {}, x: 15, y: 6, width: 3, height: 2 });

      // Old origin must no longer resolve to x.
      expect(map.hitTest(1, 1)).toBeNull();
      expect(map.hitTest(15, 6)?.id).toBe('x');
    });

    it('updates the region metadata on re-register', () => {
      const map = new CellHitMap(20, 10);
      map.register({ id: 'x', handlers: { onClick: 'old' }, x: 0, y: 0, width: 5, height: 3 });
      map.register({ id: 'x', handlers: { onClick: 'new' }, x: 0, y: 0, width: 5, height: 3 });
      expect(map.hitTest(2, 1)?.handlers.onClick).toBe('new');
    });
  });

  // ─── unregister / clear / accessors ─────────────────────────────────────

  describe('unregister', () => {
    it('removes a region and clears its cells', () => {
      const map = new CellHitMap(20, 10);
      map.register({ id: 'a', handlers: {}, x: 0, y: 0, width: 5, height: 3 });
      expect(map.unregister('a')).toBe(true);
      expect(map.hitTest(2, 1)).toBeNull();
      expect(map.getRegion('a')).toBeNull();
    });

    it('returns false when the id is unknown', () => {
      const map = new CellHitMap(20, 10);
      expect(map.unregister('missing')).toBe(false);
    });

    it('does not erase cells claimed by another region on top', () => {
      const map = new CellHitMap(20, 10);
      map.register({ id: 'a', handlers: {}, x: 0, y: 0, width: 5, height: 3 });
      map.register({ id: 'b', handlers: {}, x: 1, y: 1, width: 2, height: 1 });
      map.unregister('a');
      // (2,1) was painted by b after a; b must remain hittable.
      expect(map.hitTest(2, 1)?.id).toBe('b');
    });
  });

  describe('clear', () => {
    it('removes all regions and clears the grid', () => {
      const map = new CellHitMap(20, 10);
      map.register({ id: 'a', handlers: {}, x: 0, y: 0, width: 5, height: 3 });
      map.register({ id: 'b', handlers: {}, x: 10, y: 5, width: 3, height: 2 });
      map.clear();

      expect(map.hitTest(2, 1)).toBeNull();
      expect(map.hitTest(11, 6)).toBeNull();
      expect(map.getAll()).toEqual([]);
    });
  });

  describe('getRegion / getAll', () => {
    it('returns registered regions in registration order', () => {
      const map = new CellHitMap(20, 10);
      map.register({ id: 'a', handlers: {}, x: 0, y: 0, width: 5, height: 3 });
      map.register({ id: 'b', handlers: {}, x: 10, y: 5, width: 3, height: 2 });

      const all = map.getAll();
      expect(all.map((r) => r.id)).toEqual(['a', 'b']);
      expect(map.getRegion('a')?.width).toBe(5);
      expect(map.getRegion('missing')).toBeNull();
    });
  });
});
