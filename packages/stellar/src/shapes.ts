/**
 * Shape Hit-Testing for Content Masking
 *
 * Each function returns a value 0-1:
 *   0 = fully outside the shape
 *   1 = fully inside the shape
 *   0-1 = on the edge (for anti-aliasing)
 *
 * Anti-aliasing uses a 1-unit transition band at shape edges.
 */

export type ShapeTestFn = (x: number, y: number) => number;

const MAX_SHAPE_COORDINATE = 1_000_000_000;
const MAX_STAR_POINTS = 10_000;

function validNumber(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= MAX_SHAPE_COORDINATE;
}

function validPoint(x: number, y: number): boolean {
  return validNumber(x) && validNumber(y);
}

function coverage(value: number): number {
  return Number.isFinite(value) ? clamp(value, 0, 1) : 0;
}

// ── Utilities ────────────────────────────────────────────────────────────────

/** Clamp a value between min and max */
function clamp(val: number, min: number, max: number): number {
  return val < min ? min : val > max ? max : val;
}

/**
 * Hermite smoothstep interpolation.
 * Returns 0 when x <= edge0, 1 when x >= edge1,
 * and smooth interpolation in between.
 */
function smoothstep(edge0: number, edge1: number, x: number): number {
  if (![edge0, edge1, x].every(Number.isFinite)) return 0;
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// ── Primitive Hit-Test Functions ─────────────────────────────────────────────

/**
 * Test if point (x,y) is inside a circle centered at (cx,cy) with radius r.
 * Returns 1 inside, 0 outside, with smoothstep transition at the edge.
 */
export function isInsideCircle(x: number, y: number, cx: number, cy: number, r: number): number {
  if (!validPoint(x, y) || !validPoint(cx, cy) || !Number.isFinite(r) || r < 0 || r > MAX_SHAPE_COORDINATE) return 0;
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  // Transition band: from r-0.5 to r+0.5 (1-unit band centered on edge)
  return 1 - smoothstep(r - 0.5, r + 0.5, dist);
}

/**
 * Test if point (x,y) is inside an ellipse centered at (cx,cy)
 * with semi-axes rx and ry.
 */
export function isInsideEllipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number): number {
  if (!validPoint(x, y) || !validPoint(cx, cy) || !Number.isFinite(rx) || !Number.isFinite(ry) || rx <= 0 || ry <= 0) return 0;
  if (rx > MAX_SHAPE_COORDINATE || ry > MAX_SHAPE_COORDINATE) return 0;
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  const dist = Math.sqrt(dx * dx + dy * dy);
  // Normalized distance: 1 at the edge
  // Use the minimum semi-axis to compute the transition band in normalized space
  const minR = Math.min(rx, ry);
  const halfBand = 0.5 / minR;
  return 1 - smoothstep(1 - halfBand, 1 + halfBand, dist);
}

/**
 * Compute the minimum distance from point (px,py) to any edge of a polygon.
 * Uses closest-point-on-segment for each edge.
 */
function distToPolygonEdge(px: number, py: number, points: [number, number][]): number {
  let minDist = Infinity;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = points[i]!;
    const [bx, by] = points[(i + 1) % n]!;
    const abx = bx - ax;
    const aby = by - ay;
    const apx = px - ax;
    const apy = py - ay;
    const dot = abx * apx + aby * apy;
    const lenSq = abx * abx + aby * aby;
    const t = lenSq === 0 ? 0 : clamp(dot / lenSq, 0, 1);
    const closestX = ax + t * abx;
    const closestY = ay + t * aby;
    const dx = px - closestX;
    const dy = py - closestY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < minDist) minDist = dist;
  }
  return minDist;
}

/**
 * Test if point (x,y) is inside a polygon defined by an array of vertices.
 * Uses the ray-casting algorithm for inside/outside, smoothstep at edges.
 */
export function isInsidePolygon(x: number, y: number, points: [number, number][]): number {
  if (!validPoint(x, y) || !points.every(([px, py]) => validPoint(px, py))) return 0;
  const n = points.length;
  if (n < 3) return 0;

  // Ray-casting: count crossings of a ray going to the right
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = points[i]!;
    const [xj, yj] = points[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }

  // Distance to nearest edge for anti-aliasing
  const edgeDist = distToPolygonEdge(x, y, points);

  if (inside) {
    // Inside: fade from 1 to 0.5 as we approach the edge
    return edgeDist >= 0.5 ? 1 : smoothstep(0, 0.5, edgeDist) * 0.5 + 0.5;
  } else {
    // Outside: fade from 0.5 to 0 as we move away from the edge
    return edgeDist <= 0.5 ? (1 - smoothstep(0, 0.5, edgeDist)) * 0.5 : 0;
  }
}

/**
 * Generate star polygon vertices.
 * Alternates between outer and inner radius at equal angular intervals.
 * First outer vertex points up (-PI/2).
 */
function starVertices(cx: number, cy: number, numPoints: number, outerR: number, innerR: number): [number, number][] {
  const verts: [number, number][] = [];
  const totalVerts = numPoints * 2;
  const angleStep = (2 * Math.PI) / totalVerts;
  const startAngle = -Math.PI / 2;

  for (let i = 0; i < totalVerts; i++) {
    const angle = startAngle + i * angleStep;
    const r = i % 2 === 0 ? outerR : innerR;
    verts.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
  }

  return verts;
}

/**
 * Test if point (x,y) is inside a star shape.
 * The star has `numPoints` tips alternating between outerR and innerR.
 */
export function isInsideStar(x: number, y: number, cx: number, cy: number, numPoints: number, outerR: number, innerR: number): number {
  if (!validPoint(x, y) || !validPoint(cx, cy) || !Number.isFinite(outerR) || !Number.isFinite(innerR) || outerR < 0 || innerR < 0) return 0;
  if (!Number.isFinite(numPoints) || numPoints < 2) return 0;
  const points = Math.min(MAX_STAR_POINTS, Math.floor(numPoints));
  if (outerR > MAX_SHAPE_COORDINATE || innerR > MAX_SHAPE_COORDINATE) return 0;
  const verts = starVertices(cx, cy, points, outerR, innerR);
  return isInsidePolygon(x, y, verts);
}

/**
 * Test if point (x,y) is inside a ring (annulus) defined by an outer and inner radius.
 * Returns 1 between the radii, 0 inside the hole or outside, with smoothstep edges.
 */
export function isInsideRing(x: number, y: number, cx: number, cy: number, outerR: number, innerR: number): number {
  if (!Number.isFinite(outerR) || !Number.isFinite(innerR) || outerR < 0 || innerR < 0 || innerR > outerR) return 0;
  const outer = isInsideCircle(x, y, cx, cy, outerR);
  const inner = isInsideCircle(x, y, cx, cy, innerR);
  return Math.min(outer, 1 - inner);
}

/**
 * Signed distance from point (px,py) to a rounded rectangle.
 * The rect has top-left at (rx,ry), size (w,h), corner radius cornerR.
 * Returns negative inside, positive outside.
 */
function sdRoundedRect(px: number, py: number, rx: number, ry: number, w: number, h: number, cornerR: number): number {
  // Move to rect-local coordinates centered on the rect
  const centerX = rx + w / 2;
  const centerY = ry + h / 2;
  const halfW = w / 2;
  const halfH = h / 2;

  // Absolute offset from center
  const dx = Math.abs(px - centerX) - halfW + cornerR;
  const dy = Math.abs(py - centerY) - halfH + cornerR;

  // SDF for rounded rect
  const outsideDist = Math.sqrt(Math.max(dx, 0) ** 2 + Math.max(dy, 0) ** 2);
  const insideDist = Math.min(Math.max(dx, dy), 0);

  return outsideDist + insideDist - cornerR;
}

/**
 * Test if point (x,y) is inside a rounded rectangle.
 * The rect has top-left at (rx,ry), size (w,h), corner radius cornerR.
 */
export function isInsideRoundedRect(x: number, y: number, rx: number, ry: number, w: number, h: number, cornerR: number): number {
  if (!validPoint(x, y) || !validPoint(rx, ry) || !validNumber(w) || !validNumber(h) || w <= 0 || h <= 0 || !Number.isFinite(cornerR)) return 0;
  const radius = clamp(cornerR, 0, Math.min(w, h) / 2);
  const sd = sdRoundedRect(x, y, rx, ry, w, h, radius);
  // sd < 0 inside, sd > 0 outside, transition at 0
  return 1 - smoothstep(-0.5, 0.5, sd);
}

// ── Boolean Operations ───────────────────────────────────────────────────────

/** Union of multiple shapes (max of all shape functions). */
export function shapeUnion(...fns: ShapeTestFn[]): ShapeTestFn {
  return (x: number, y: number) => {
    let max = 0;
    for (const fn of fns) {
      const v = fn(x, y);
      const safe = coverage(v);
      if (safe > max) max = safe;
    }
    return max;
  };
}

/** Intersection of multiple shapes (min of all shape functions). */
export function shapeIntersect(...fns: ShapeTestFn[]): ShapeTestFn {
  return (x: number, y: number) => {
    let min = 1;
    for (const fn of fns) {
      const v = fn(x, y);
      const safe = coverage(v);
      if (safe < min) min = safe;
    }
    return min;
  };
}

/** Subtract a cutout from a base shape: min(base, 1 - cut). */
export function shapeSubtract(base: ShapeTestFn, cut: ShapeTestFn): ShapeTestFn {
  return (x: number, y: number) => Math.min(coverage(base(x, y)), 1 - coverage(cut(x, y)));
}

// ── Convenience Factory Functions ────────────────────────────────────────────

/** Create a circle hit-test function. */
export function circle(opts: { cx: number; cy: number; r: number }): ShapeTestFn {
  return (x, y) => isInsideCircle(x, y, opts.cx, opts.cy, opts.r);
}

/** Create an ellipse hit-test function. */
export function ellipse(opts: { cx: number; cy: number; rx: number; ry: number }): ShapeTestFn {
  return (x, y) => isInsideEllipse(x, y, opts.cx, opts.cy, opts.rx, opts.ry);
}

/** Create a polygon hit-test function. */
export function polygon(opts: { points: [number, number][] }): ShapeTestFn {
  const points = opts.points.map(([x, y]): [number, number] => [x, y]);
  return (x, y) => isInsidePolygon(x, y, points);
}

/** Create a star hit-test function. */
export function star(opts: { cx: number; cy: number; points: number; outerR: number; innerR: number }): ShapeTestFn {
  // Pre-compute vertices
  const points = Math.min(MAX_STAR_POINTS, Math.max(0, Math.floor(Number.isFinite(opts.points) ? opts.points : 0)));
  const valid =
    validPoint(opts.cx, opts.cy) &&
    points >= 2 &&
    Number.isFinite(opts.outerR) &&
    opts.outerR >= 0 &&
    opts.outerR <= MAX_SHAPE_COORDINATE &&
    Number.isFinite(opts.innerR) &&
    opts.innerR >= 0 &&
    opts.innerR <= MAX_SHAPE_COORDINATE;
  const verts = valid ? starVertices(opts.cx, opts.cy, points, opts.outerR, opts.innerR) : [];
  return (x, y) => isInsidePolygon(x, y, verts);
}

/** Create a ring (annulus) hit-test function. */
export function ring(opts: { cx: number; cy: number; outerR: number; innerR: number }): ShapeTestFn {
  return (x, y) => isInsideRing(x, y, opts.cx, opts.cy, opts.outerR, opts.innerR);
}

/** Create a rounded rectangle hit-test function. */
export function roundedRect(opts: { x: number; y: number; w: number; h: number; r: number }): ShapeTestFn {
  return (px, py) => isInsideRoundedRect(px, py, opts.x, opts.y, opts.w, opts.h, opts.r);
}
