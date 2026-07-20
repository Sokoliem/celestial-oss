import { describe, expect, it } from 'vitest';
import {
  circle,
  ellipse,
  isInsideCircle,
  isInsideEllipse,
  isInsidePolygon,
  isInsideRing,
  isInsideRoundedRect,
  isInsideStar,
  polygon,
  ring,
  roundedRect,
  type ShapeTestFn,
  shapeIntersect,
  shapeSubtract,
  shapeUnion,
  star,
} from '../shapes.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Assert a value is approximately equal within tolerance */
function approx(actual: number, expected: number, tolerance = 0.01): void {
  expect(actual).toBeGreaterThanOrEqual(expected - tolerance);
  expect(actual).toBeLessThanOrEqual(expected + tolerance);
}

// ── isInsideCircle ───────────────────────────────────────────────────────────

describe('isInsideCircle', () => {
  it('returns 1.0 at the center of the circle', () => {
    expect(isInsideCircle(5, 5, 5, 5, 10)).toBe(1);
  });

  it('returns 1.0 well inside the circle', () => {
    expect(isInsideCircle(5, 5, 5, 5, 100)).toBe(1);
  });

  it('returns ~0.5 at the edge of the circle', () => {
    // Point exactly on the radius boundary => smoothstep midpoint
    const val = isInsideCircle(15, 5, 5, 5, 10);
    approx(val, 0.5, 0.05);
  });

  it('returns 0.0 well outside the circle', () => {
    expect(isInsideCircle(100, 100, 5, 5, 10)).toBe(0);
  });

  it('works with small radius', () => {
    expect(isInsideCircle(0, 0, 0, 0, 1)).toBe(1);
    expect(isInsideCircle(0.5, 0, 0, 0, 1)).toBe(1);
  });

  it('returns value in transition band near edge', () => {
    // Just inside the edge (within 0.5 units inside boundary)
    const val = isInsideCircle(14.7, 5, 5, 5, 10);
    expect(val).toBeGreaterThan(0.5);
    expect(val).toBeLessThanOrEqual(1);
  });

  it('returns value in transition band just outside edge', () => {
    // Just outside the edge (within 0.5 units outside boundary)
    const val = isInsideCircle(15.3, 5, 5, 5, 10);
    expect(val).toBeGreaterThanOrEqual(0);
    expect(val).toBeLessThan(0.5);
  });
});

// ── isInsideEllipse ──────────────────────────────────────────────────────────

describe('isInsideEllipse', () => {
  it('returns 1.0 at the center', () => {
    expect(isInsideEllipse(5, 5, 5, 5, 10, 5)).toBe(1);
  });

  it('returns ~0.5 at the edge along x-axis', () => {
    const val = isInsideEllipse(15, 5, 5, 5, 10, 5);
    approx(val, 0.5, 0.05);
  });

  it('returns ~0.5 at the edge along y-axis', () => {
    const val = isInsideEllipse(5, 10, 5, 5, 10, 5);
    approx(val, 0.5, 0.05);
  });

  it('returns 0.0 well outside', () => {
    expect(isInsideEllipse(100, 100, 5, 5, 10, 5)).toBe(0);
  });

  it('handles different rx and ry', () => {
    // Inside a wide, short ellipse
    expect(isInsideEllipse(10, 5, 5, 5, 20, 2)).toBe(1);
    // Outside along y (ry=2)
    expect(isInsideEllipse(5, 10, 5, 5, 20, 2)).toBe(0);
  });
});

// ── isInsidePolygon ──────────────────────────────────────────────────────────

describe('isInsidePolygon', () => {
  // Triangle: (0,0), (10,0), (5,10)
  const triangle: [number, number][] = [
    [0, 0],
    [10, 0],
    [5, 10],
  ];

  it('returns 1.0 for a point inside a triangle', () => {
    expect(isInsidePolygon(5, 3, triangle)).toBe(1);
  });

  it('returns 0.0 for a point outside a triangle', () => {
    expect(isInsidePolygon(20, 20, triangle)).toBe(0);
  });

  it('returns a value between 0 and 1 near the edge', () => {
    // Point very close to the bottom edge (y ≈ 0)
    const val = isInsidePolygon(5, 0, triangle);
    expect(val).toBeGreaterThanOrEqual(0);
    expect(val).toBeLessThanOrEqual(1);
  });

  it('works with a convex quadrilateral', () => {
    const quad: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    expect(isInsidePolygon(5, 5, quad)).toBe(1);
    expect(isInsidePolygon(20, 20, quad)).toBe(0);
  });

  it('works with a concave polygon (L-shape)', () => {
    // L-shaped polygon
    const lShape: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 5],
      [5, 5],
      [5, 10],
      [0, 10],
    ];
    // Inside the bottom arm
    expect(isInsidePolygon(2, 2, lShape)).toBe(1);
    // Inside the left arm
    expect(isInsidePolygon(2, 8, lShape)).toBe(1);
    // In the concave cutout (upper right) — outside
    expect(isInsidePolygon(8, 8, lShape)).toBe(0);
  });
});

// ── isInsideStar ─────────────────────────────────────────────────────────────

describe('isInsideStar', () => {
  it('returns 1.0 at the center of the star', () => {
    expect(isInsideStar(10, 10, 10, 10, 5, 10, 4)).toBe(1);
  });

  it('returns 0.0 well outside the star', () => {
    expect(isInsideStar(50, 50, 10, 10, 5, 10, 4)).toBe(0);
  });

  it('returns a value near 0 or in transition at an outer tip', () => {
    // The first outer tip of a 5-pointed star at angle -90deg is at (cx, cy - outerR)
    // For a 5-pointed star with outerR=10, the tip is at (10, 0)
    const val = isInsideStar(10, 0, 10, 10, 5, 10, 4);
    // This should be on the edge or in transition
    expect(val).toBeGreaterThanOrEqual(0);
    expect(val).toBeLessThanOrEqual(1);
  });

  it('returns value between 0 and 1 at inner valley distance', () => {
    // Point at innerR distance from center (between tips)
    // For 5 points, inner vertices are at halfway angles
    const angle = Math.PI / 5; // 36 degrees (first valley)
    const innerR = 4;
    const vx = 10 + innerR * Math.cos(-Math.PI / 2 + angle);
    const vy = 10 + innerR * Math.sin(-Math.PI / 2 + angle);
    const val = isInsideStar(vx, vy, 10, 10, 5, 10, innerR);
    expect(val).toBeGreaterThanOrEqual(0);
    expect(val).toBeLessThanOrEqual(1);
  });
});

// ── isInsideRing ─────────────────────────────────────────────────────────────

describe('isInsideRing', () => {
  it('returns 1.0 inside the ring (between inner and outer radii)', () => {
    // Ring with outerR=10, innerR=5, center at (10,10)
    // Point at distance 7.5 from center
    expect(isInsideRing(17, 10, 10, 10, 10, 5)).toBe(1);
  });

  it('returns 0.0 inside the hole', () => {
    // Point at the center — inside the hole
    expect(isInsideRing(10, 10, 10, 10, 10, 5)).toBe(0);
  });

  it('returns 0.0 outside the ring', () => {
    expect(isInsideRing(50, 50, 10, 10, 10, 5)).toBe(0);
  });

  it('returns ~0.5 on the outer edge', () => {
    const val = isInsideRing(20, 10, 10, 10, 10, 5);
    approx(val, 0.5, 0.05);
  });

  it('returns ~0.5 on the inner edge', () => {
    const val = isInsideRing(15, 10, 10, 10, 10, 5);
    approx(val, 0.5, 0.05);
  });
});

// ── isInsideRoundedRect ──────────────────────────────────────────────────────

describe('isInsideRoundedRect', () => {
  // Rect at (5,5) with w=20, h=10, corner radius 3
  it('returns 1.0 at the center', () => {
    expect(isInsideRoundedRect(15, 10, 5, 5, 20, 10, 3)).toBe(1);
  });

  it('returns 0.0 well outside', () => {
    expect(isInsideRoundedRect(100, 100, 5, 5, 20, 10, 3)).toBe(0);
  });

  it('returns 1.0 inside a flat edge (not corner)', () => {
    // Middle of top edge, well inside
    expect(isInsideRoundedRect(15, 8, 5, 5, 20, 10, 3)).toBe(1);
  });

  it('handles the rounded corner region', () => {
    // Point exactly at the corner arc center — should be inside
    // Corner arc center for top-left corner: (5+3, 5+3) = (8, 8)
    expect(isInsideRoundedRect(8, 8, 5, 5, 20, 10, 3)).toBe(1);
  });

  it('returns 0 at a sharp corner outside the rounding', () => {
    // Point at the actual corner of the bounding box (5, 5) — outside the rounding
    const val = isInsideRoundedRect(5, 5, 5, 5, 20, 10, 3);
    expect(val).toBeLessThan(1);
  });

  it('returns ~0.5 on the straight edge boundary', () => {
    // On the right edge: x = 5 + 20 = 25, middle of height
    const val = isInsideRoundedRect(25, 10, 5, 5, 20, 10, 3);
    approx(val, 0.5, 0.05);
  });
});

// ── shapeUnion ───────────────────────────────────────────────────────────────

describe('shapeUnion', () => {
  it('returns max of overlapping shapes', () => {
    const fn1: ShapeTestFn = () => 0.3;
    const fn2: ShapeTestFn = () => 0.7;
    const union = shapeUnion(fn1, fn2);
    expect(union(0, 0)).toBe(0.7);
  });

  it('returns 1 if any shape is fully inside', () => {
    const fn1: ShapeTestFn = () => 0;
    const fn2: ShapeTestFn = () => 1;
    const union = shapeUnion(fn1, fn2);
    expect(union(0, 0)).toBe(1);
  });

  it('works with non-overlapping shapes', () => {
    // Two circles far apart, test a point inside only one
    const c1 = circle({ cx: 0, cy: 0, r: 5 });
    const c2 = circle({ cx: 100, cy: 100, r: 5 });
    const union = shapeUnion(c1, c2);
    expect(union(0, 0)).toBe(1); // Inside c1
    expect(union(100, 100)).toBe(1); // Inside c2
    expect(union(50, 50)).toBe(0); // Inside neither
  });
});

// ── shapeIntersect ───────────────────────────────────────────────────────────

describe('shapeIntersect', () => {
  it('returns min of overlapping shapes', () => {
    const fn1: ShapeTestFn = () => 0.3;
    const fn2: ShapeTestFn = () => 0.7;
    const intersect = shapeIntersect(fn1, fn2);
    expect(intersect(0, 0)).toBe(0.3);
  });

  it('returns 0 when non-overlapping', () => {
    const c1 = circle({ cx: 0, cy: 0, r: 5 });
    const c2 = circle({ cx: 100, cy: 100, r: 5 });
    const intersect = shapeIntersect(c1, c2);
    // At (0,0): inside c1 (1.0) but outside c2 (0.0) => min => 0
    expect(intersect(0, 0)).toBe(0);
  });

  it('returns 1 when both fully contain the point', () => {
    const c1 = circle({ cx: 0, cy: 0, r: 10 });
    const c2 = circle({ cx: 1, cy: 1, r: 10 });
    const intersect = shapeIntersect(c1, c2);
    expect(intersect(0, 0)).toBe(1);
  });
});

// ── shapeSubtract ────────────────────────────────────────────────────────────

describe('shapeSubtract', () => {
  it('subtracts the cutout from the base shape', () => {
    const base: ShapeTestFn = () => 1;
    const cut: ShapeTestFn = () => 1;
    const result = shapeSubtract(base, cut);
    // min(1, 1 - 1) = min(1, 0) = 0
    expect(result(0, 0)).toBe(0);
  });

  it('preserves base where cutout is absent', () => {
    const base: ShapeTestFn = () => 1;
    const cut: ShapeTestFn = () => 0;
    const result = shapeSubtract(base, cut);
    // min(1, 1 - 0) = min(1, 1) = 1
    expect(result(0, 0)).toBe(1);
  });

  it('works with real shapes (ring-like via subtract)', () => {
    const outer = circle({ cx: 10, cy: 10, r: 10 });
    const inner = circle({ cx: 10, cy: 10, r: 5 });
    const ringLike = shapeSubtract(outer, inner);
    // Center: outside (cut by inner)
    expect(ringLike(10, 10)).toBe(0);
    // Between radii: inside
    expect(ringLike(18, 10)).toBe(1);
    // Well outside: outside
    expect(ringLike(50, 50)).toBe(0);
  });
});

// ── Factory functions ────────────────────────────────────────────────────────

describe('factory functions', () => {
  it('circle() returns a ShapeTestFn', () => {
    const fn = circle({ cx: 0, cy: 0, r: 5 });
    expect(fn(0, 0)).toBe(1);
    expect(fn(100, 100)).toBe(0);
  });

  it('ellipse() returns a ShapeTestFn', () => {
    const fn = ellipse({ cx: 0, cy: 0, rx: 10, ry: 5 });
    expect(fn(0, 0)).toBe(1);
    expect(fn(100, 100)).toBe(0);
  });

  it('polygon() returns a ShapeTestFn', () => {
    const fn = polygon({
      points: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
    });
    expect(fn(5, 5)).toBe(1);
    expect(fn(20, 20)).toBe(0);
  });

  it('star() returns a ShapeTestFn', () => {
    const fn = star({ cx: 10, cy: 10, points: 5, outerR: 10, innerR: 4 });
    expect(fn(10, 10)).toBe(1);
    expect(fn(50, 50)).toBe(0);
  });

  it('ring() returns a ShapeTestFn', () => {
    const fn = ring({ cx: 10, cy: 10, outerR: 10, innerR: 5 });
    expect(fn(17, 10)).toBe(1); // In the ring
    expect(fn(10, 10)).toBe(0); // In the hole
  });

  it('roundedRect() returns a ShapeTestFn', () => {
    const fn = roundedRect({ x: 0, y: 0, w: 20, h: 10, r: 2 });
    expect(fn(10, 5)).toBe(1);
    expect(fn(100, 100)).toBe(0);
  });
});
