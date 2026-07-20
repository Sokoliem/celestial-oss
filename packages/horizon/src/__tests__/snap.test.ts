import { describe, expect, it } from 'vitest';
import { computeSnappedPosition } from '../snap.js';

describe('snap', () => {
  it('snaps floating windows to terminal edges', () => {
    const result = computeSnappedPosition({ x: 1, y: 18 }, { x: 0, y: 0, width: 10, height: 5 }, [], { cols: 80, rows: 24 }, { edgeThreshold: 2 });

    expect(result.x).toBe(0);
    expect(result.y).toBe(19);
    expect(result.guides.length).toBeGreaterThan(0);
  });

  it('snaps against nearby window bounds', () => {
    const result = computeSnappedPosition(
      { x: 29, y: 5 },
      { x: 0, y: 0, width: 10, height: 5 },
      [{ id: 'other', content: { kind: 'text', content: 'other' }, x: 20, y: 5, width: 10, height: 5, zIndex: 1 }],
      { cols: 80, rows: 24 },
      { windowThreshold: 2 },
    );

    expect(result.x).toBe(30);
    expect(result.guides.some((guide) => guide.kind === 'window')).toBe(true);
  });
});
