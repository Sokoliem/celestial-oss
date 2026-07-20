import { describe, expect, it } from 'vitest';
import { buildSpatialNavMap, findSpatialNeighbor, type SpatialNavState, type SpatialRegion, spatialNavUpdate } from '../spatial-nav.js';

const tabs: SpatialRegion[] = [
  { id: 'a', x: 0, y: 0, width: 10, height: 2 },
  { id: 'b', x: 10, y: 0, width: 10, height: 2 },
  { id: 'c', x: 20, y: 0, width: 10, height: 2 },
];

describe('horizon spatial-nav re-export', () => {
  it('buildSpatialNavMap exposes left/right neighbors for a tab strip', () => {
    const map = buildSpatialNavMap(tabs);
    expect(map.a?.right).toBe('b');
    expect(map.b?.right).toBe('c');
    expect(map.b?.left).toBe('a');
    expect(map.c?.left).toBe('b');
  });

  it('findSpatialNeighbor returns null when no neighbor exists in direction', () => {
    expect(findSpatialNeighbor('a', 'left', tabs)).toBeNull();
    expect(findSpatialNeighbor('c', 'right', tabs)).toBeNull();
  });

  it('spatialNavUpdate moves focus along the map', () => {
    let state: SpatialNavState = { focusedId: 'a', navMap: buildSpatialNavMap(tabs) };
    state = spatialNavUpdate({ type: 'spatial-move', direction: 'right' }, state);
    expect(state.focusedId).toBe('b');
    state = spatialNavUpdate({ type: 'spatial-move', direction: 'right' }, state);
    expect(state.focusedId).toBe('c');
    state = spatialNavUpdate({ type: 'spatial-move', direction: 'right' }, state);
    expect(state.focusedId).toBe('c');
  });
});
