import { describe, expect, it } from 'vitest';
import { buildSpatialNavMap, createSpatialNavState, findSpatialNeighbor, type SpatialNavState, type SpatialRegion, spatialNavUpdate } from '../spatial-nav.js';

// ─── Test Layouts ───────────────────────────────────────────────────────────
//
// Horizontal row:     A(0,0,10,5)  B(12,0,10,5)  C(24,0,10,5)
//
// Vertical column:    D(0,0,10,5)
//                     E(0,7,10,5)
//                     F(0,14,10,5)
//
// Grid (2x2):         G(0,0,10,5)   H(12,0,10,5)
//                     I(0,7,10,5)   J(12,7,10,5)

const horizontalRow: SpatialRegion[] = [
  { id: 'A', x: 0, y: 0, width: 10, height: 5 },
  { id: 'B', x: 12, y: 0, width: 10, height: 5 },
  { id: 'C', x: 24, y: 0, width: 10, height: 5 },
];

const verticalColumn: SpatialRegion[] = [
  { id: 'D', x: 0, y: 0, width: 10, height: 5 },
  { id: 'E', x: 0, y: 7, width: 10, height: 5 },
  { id: 'F', x: 0, y: 14, width: 10, height: 5 },
];

const grid2x2: SpatialRegion[] = [
  { id: 'G', x: 0, y: 0, width: 10, height: 5 },
  { id: 'H', x: 12, y: 0, width: 10, height: 5 },
  { id: 'I', x: 0, y: 7, width: 10, height: 5 },
  { id: 'J', x: 12, y: 7, width: 10, height: 5 },
];

describe('spatial-nav', () => {
  describe('createSpatialNavState', () => {
    it('returns state with null focusedId when no initial', () => {
      const state = createSpatialNavState();
      expect(state).toEqual({ focusedId: null, navMap: {} });
    });

    it('returns state with initial focusedId when provided', () => {
      const state = createSpatialNavState('btn-1');
      expect(state).toEqual({ focusedId: 'btn-1', navMap: {} });
    });
  });

  describe('buildSpatialNavMap', () => {
    it('finds right neighbor in horizontal row', () => {
      const map = buildSpatialNavMap(horizontalRow);
      expect(map['A']!.right).toBe('B');
      expect(map['B']!.right).toBe('C');
    });

    it('finds left neighbor', () => {
      const map = buildSpatialNavMap(horizontalRow);
      expect(map['C']!.left).toBe('B');
      expect(map['B']!.left).toBe('A');
    });

    it('finds down neighbor in vertical column', () => {
      const map = buildSpatialNavMap(verticalColumn);
      expect(map['D']!.down).toBe('E');
      expect(map['E']!.down).toBe('F');
    });

    it('finds up neighbor', () => {
      const map = buildSpatialNavMap(verticalColumn);
      expect(map['F']!.up).toBe('E');
      expect(map['E']!.up).toBe('D');
    });

    it('prefers candidate with cross-axis overlap over distant one', () => {
      // Source at (0,0,10,5). Two candidates to the right:
      // - near: (12,10,10,5) — no vertical overlap, close edge
      // - far: (14,0,10,5) — has vertical overlap, slightly farther edge
      const regions: SpatialRegion[] = [
        { id: 'src', x: 0, y: 0, width: 10, height: 5 },
        { id: 'near', x: 12, y: 10, width: 10, height: 5 },
        { id: 'far', x: 14, y: 0, width: 10, height: 5 },
      ];
      const map = buildSpatialNavMap(regions);
      // 'far' has vertical overlap with src (both y: 0..5), 'near' does not
      expect(map['src']!.right).toBe('far');
    });

    it('breaks ties by edge distance', () => {
      // Two candidates to the right, both with same vertical overlap.
      // Closer edge wins.
      const regions: SpatialRegion[] = [
        { id: 'src', x: 0, y: 0, width: 10, height: 5 },
        { id: 'close', x: 12, y: 0, width: 10, height: 5 },
        { id: 'distant', x: 30, y: 0, width: 10, height: 5 },
      ];
      const map = buildSpatialNavMap(regions);
      expect(map['src']!.right).toBe('close');
    });

    it('breaks edge-distance ties by center-to-center distance', () => {
      // Two candidates to the right at same edge distance, but one is offset
      // on the cross-axis so its center-to-center distance is larger.
      const regions: SpatialRegion[] = [
        { id: 'src', x: 0, y: 5, width: 10, height: 5 },
        { id: 'aligned', x: 12, y: 5, width: 10, height: 5 },
        { id: 'offset', x: 12, y: 0, width: 10, height: 5 },
      ];
      const map = buildSpatialNavMap(regions);
      // Both have same edge distance (12), both have overlap.
      // 'aligned' has smaller center-to-center distance.
      expect(map['src']!.right).toBe('aligned');
    });

    it('returns null when no neighbor in direction', () => {
      const map = buildSpatialNavMap(horizontalRow);
      expect(map['A']!.left).toBeNull();
      expect(map['C']!.right).toBeNull();
      // All on same row, so up/down are null
      expect(map['A']!.up).toBeNull();
      expect(map['A']!.down).toBeNull();
    });

    it('skips disabled regions', () => {
      const regions: SpatialRegion[] = [
        { id: 'A', x: 0, y: 0, width: 10, height: 5 },
        { id: 'B', x: 12, y: 0, width: 10, height: 5, disabled: true },
        { id: 'C', x: 24, y: 0, width: 10, height: 5 },
      ];
      const map = buildSpatialNavMap(regions);
      // B is disabled, so A → right should skip B and pick C
      expect(map['A']!.right).toBe('C');
      // B itself should not appear in the map
      expect(map['B']).toBeUndefined();
    });

    it('handles single region (all null)', () => {
      const regions: SpatialRegion[] = [{ id: 'solo', x: 5, y: 5, width: 10, height: 10 }];
      const map = buildSpatialNavMap(regions);
      expect(map['solo']).toEqual({
        up: null,
        down: null,
        left: null,
        right: null,
      });
    });

    it('handles empty array', () => {
      const map = buildSpatialNavMap([]);
      expect(map).toEqual({});
    });
  });

  describe('spatialNavUpdate', () => {
    it('sets focusedId on spatial-focus', () => {
      const navMap = buildSpatialNavMap(horizontalRow);
      const state: SpatialNavState = { focusedId: null, navMap };
      const next = spatialNavUpdate({ type: 'spatial-focus', id: 'A' }, state);
      expect(next.focusedId).toBe('A');
    });

    it('moves focus to neighbor on spatial-move', () => {
      const navMap = buildSpatialNavMap(horizontalRow);
      const state: SpatialNavState = { focusedId: 'A', navMap };
      const next = spatialNavUpdate({ type: 'spatial-move', direction: 'right' }, state);
      expect(next.focusedId).toBe('B');
    });

    it('no-ops spatial-move when no focused region', () => {
      const navMap = buildSpatialNavMap(horizontalRow);
      const state: SpatialNavState = { focusedId: null, navMap };
      const next = spatialNavUpdate({ type: 'spatial-move', direction: 'right' }, state);
      expect(next).toBe(state);
    });

    it('no-ops spatial-move when no neighbor in direction', () => {
      const navMap = buildSpatialNavMap(horizontalRow);
      const state: SpatialNavState = { focusedId: 'A', navMap };
      const next = spatialNavUpdate({ type: 'spatial-move', direction: 'left' }, state);
      expect(next).toBe(state);
    });

    it('does not change state on spatial-activate', () => {
      const navMap = buildSpatialNavMap(horizontalRow);
      const state: SpatialNavState = { focusedId: 'B', navMap };
      const next = spatialNavUpdate({ type: 'spatial-activate' }, state);
      expect(next).toBe(state);
    });

    it('clears focusedId on spatial-blur', () => {
      const navMap = buildSpatialNavMap(horizontalRow);
      const state: SpatialNavState = { focusedId: 'B', navMap };
      const next = spatialNavUpdate({ type: 'spatial-blur' }, state);
      expect(next.focusedId).toBeNull();
    });
  });

  describe('findSpatialNeighbor', () => {
    it('finds correct neighbor for each direction', () => {
      // Grid layout:
      //   G(0,0) H(12,0)
      //   I(0,7) J(12,7)
      expect(findSpatialNeighbor('G', 'right', grid2x2)).toBe('H');
      expect(findSpatialNeighbor('G', 'down', grid2x2)).toBe('I');
      expect(findSpatialNeighbor('J', 'left', grid2x2)).toBe('I');
      expect(findSpatialNeighbor('J', 'up', grid2x2)).toBe('H');
    });

    it('returns null at grid boundary', () => {
      expect(findSpatialNeighbor('G', 'left', grid2x2)).toBeNull();
      expect(findSpatialNeighbor('G', 'up', grid2x2)).toBeNull();
      expect(findSpatialNeighbor('J', 'right', grid2x2)).toBeNull();
      expect(findSpatialNeighbor('J', 'down', grid2x2)).toBeNull();
    });

    it('returns null for unknown sourceId', () => {
      expect(findSpatialNeighbor('unknown', 'right', grid2x2)).toBeNull();
    });

    it('skips disabled regions', () => {
      const regions: SpatialRegion[] = [
        { id: 'A', x: 0, y: 0, width: 10, height: 5 },
        { id: 'B', x: 12, y: 0, width: 10, height: 5, disabled: true },
        { id: 'C', x: 24, y: 0, width: 10, height: 5 },
      ];
      expect(findSpatialNeighbor('A', 'right', regions)).toBe('C');
    });
  });
});
