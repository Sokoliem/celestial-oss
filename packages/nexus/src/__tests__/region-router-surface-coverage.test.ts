/**
 * Surface-coverage contract for `region-router`.
 *
 * Phase 4b of the claude-wrapper-rewire PRD (see
 * docs/specs/2026-05-14-claude-wrapper-rewire-prd-phase-4-amendment.md §3,
 * Q-T5). `apps/claude-wrapper/src/wrapper-pointer-audit.ts` is a static
 * manifest that guards, per named pointer surface: (a) the surface is
 * pointer-routable, (b) its encoded id round-trips without collision or
 * truncation, (c) scope-derived layering groups/blocks correctly, (d) the
 * declared interaction (click / right-click / mouse-up / scroll, with
 * modifiers and capture phase) resolves to a handler, and (e) decorative
 * (hover-only / handler-less) regions never shadow an interactive one.
 *
 * The PRD's Q-T5 deletes that wrapper-side manifest on the premise that
 * "nexus/region-router contract tests own the invariants." Those tests did
 * not exist (region-router.test.ts had 5 tests, none covering breadth,
 * id round-tripping, scope layering, or the decorative-shadow rule). This
 * suite encodes those invariants generically (no wrapper import — nexus
 * must not depend on apps/), so the audit manifest can be retired at
 * Phase 4e without losing the guarantees.
 *
 * The fixtures mirror the wrapper's real shape: ids are
 * `cwptr|<surface>|<k=v&...>` (opaque to region-router), scope is
 * `claude-wrapper:<surface>` (split on the first ':' by defaultLayer), and
 * the surface count matches the 69 `WrapperPointerSurface` union members.
 */

import type { EventHandlers, HitRegionInfo, RegionMetadata } from '@celestial/nebula';
import { describe, expect, it } from 'vitest';
import { createRegionRouter, resolveRegionHandler } from '../region-router.js';

// ─── Fixtures faithful to the wrapper's encode/scope shape ──────────────────

/** Matches `WrapperPointerSurface` cardinality (wrapper-pointer-regions.ts:64+). */
const SURFACE_COUNT = 69;

function surfaceId(surface: string, fields: Record<string, string | number> = {}): string {
  const encoded = Object.entries(fields)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
  return encoded ? `cwptr|${surface}|${encoded}` : `cwptr|${surface}`;
}

function region(
  overrides: Partial<HitRegionInfo> & Pick<HitRegionInfo, 'id'>,
): HitRegionInfo {
  return {
    handlers: {},
    rect: { x: 0, y: 0, width: 10, height: 3 },
    zIndex: 0,
    isHover: false,
    eventPath: [overrides.id],
    ...overrides,
  };
}

/** A pointer-routable surface: distinct rect row, scope, and a primary handler. */
function surfaceRegion(
  surface: string,
  index: number,
  opts: { handlers?: EventHandlers; metadata?: Partial<RegionMetadata>; isHover?: boolean; zIndex?: number } = {},
): HitRegionInfo {
  return region({
    id: surfaceId(surface, { i: index }),
    rect: { x: 0, y: index, width: 20, height: 1 },
    zIndex: opts.zIndex ?? 0,
    isHover: opts.isHover ?? false,
    handlers: opts.handlers ?? { onClick: `${surface}-press` },
    metadata: { scope: `claude-wrapper:${surface}`, ...opts.metadata },
  });
}

const SURFACES = Array.from({ length: SURFACE_COUNT }, (_, i) => `surface-${i}`);

describe('region-router surface-coverage contract (Phase 4b / Q-T5)', () => {
  // ─── (a)+(b) Every surface is routable; encoded ids round-trip intact ─────

  it('hit-tests every one of the 69 surfaces to its own region with no collision', () => {
    const regions = SURFACES.map((s, i) => surfaceRegion(s, i));
    const router = createRegionRouter(regions);

    const resolvedIds = new Set<string>();
    SURFACES.forEach((s, i) => {
      const match = router.hitTest(5, i, { type: 'press', button: 0 });
      expect(match, `surface "${s}" must be routable`).not.toBeNull();
      expect(match?.region.id).toBe(surfaceId(s, { i }));
      expect(match?.handlerTag).toBe(`${s}-press`);
      resolvedIds.add(match!.region.id);
    });
    // No aliasing: 69 distinct surfaces → 69 distinct resolved ids.
    expect(resolvedIds.size).toBe(SURFACE_COUNT);
  });

  it('disambiguates colliding surfaces stacked at the identical rect by zIndex (no id aliasing)', () => {
    // Stronger than the breadth test above: all three occupy the SAME cell,
    // so correct resolution depends entirely on region-router, not on the
    // fixture's non-overlapping rows.
    const at = { x: 0, y: 0, width: 8, height: 1 };
    const router = createRegionRouter([
      region({ id: surfaceId('alpha'), rect: at, zIndex: 1, handlers: { onClick: 'alpha' } }),
      region({ id: surfaceId('beta'), rect: at, zIndex: 2, handlers: { onClick: 'beta' } }),
      region({ id: surfaceId('gamma'), rect: at, zIndex: 3, handlers: { onClick: 'gamma' } }),
    ]);
    const match = router.hitTest(3, 0, { type: 'press', button: 0 });
    expect(match?.region.id).toBe(surfaceId('gamma')); // topmost, distinct id
    const all = router.hitTestAll(3, 0, { type: 'press', button: 0 }).map((m) => m.region.id);
    expect(new Set(all).size).toBe(3); // all three preserved, none aliased
  });

  it('treats the encoded target id as opaque — pipe/colon/equals/ampersand survive untruncated', () => {
    const hostile = surfaceId('theme-builder-field', {
      hitKind: 'slider:value',
      category: 'a&b=c',
      label: 'x|y',
    });
    const router = createRegionRouter([region({ id: hostile, handlers: { onClick: 'tag' }, rect: { x: 0, y: 0, width: 4, height: 1 } })]);

    const match = router.hitTest(1, 0, { type: 'press', button: 0 });
    expect(match?.region.id).toBe(hostile); // byte-identical, not parsed/split
  });

  // ─── (c) Scope-derived layering groups and blocks correctly ──────────────

  it('collapses all claude-wrapper:* surfaces into one default layer (scope split on first colon)', () => {
    const regions = SURFACES.slice(0, 5).map((s, i) => surfaceRegion(s, i));
    const router = createRegionRouter(regions);
    const layers = new Set(
      SURFACES.slice(0, 5).map((_, i) => router.hitTest(5, i, { type: 'press', button: 0 })?.layer.id),
    );
    expect([...layers]).toEqual(['claude-wrapper']);
  });

  it('overlay isolation requires a host-supplied getLayer (all wrapper scopes share the claude-wrapper prefix)', () => {
    // Faithful model of the post-migration contract: every wrapper surface
    // emits scope `claude-wrapper:<surface>`, so `defaultLayer` collapses
    // overlay + base into ONE layer (see prior test). Overlay-blocks-base is
    // therefore impossible via defaultLayer alone — the wrapper host MUST
    // supply a getLayer that promotes overlay surfaces to a blocking layer
    // keyed on the surface name (not a distinct scope prefix the wrapper
    // never emits). The backdrop carries a real handler so this proves the
    // *block* shields the base, not the handler-less requireHandler skip.
    const fixture = () => [
      surfaceRegion('base-surface', 0, { zIndex: 0, handlers: { onClick: 'base-press' } }),
      surfaceRegion('overlay-backdrop', 0, { zIndex: 10, handlers: { onClick: 'backdrop-press' } }),
    ];
    const isOverlay = (r: HitRegionInfo) => r.metadata?.scope === 'claude-wrapper:overlay-backdrop';

    // With the blocking host getLayer: the backdrop wins and the base is shielded.
    const blocking = createRegionRouter(fixture(), {
      getLayer: (r) => (isOverlay(r) ? { id: 'overlay', blocksBelow: true } : 'base'),
    });
    const blocked = blocking.route({ type: 'press', button: 0, x: 5, y: 0, ctrl: false, alt: false, shift: false });
    expect(blocked?.region.id).toBe(surfaceId('overlay-backdrop', { i: 0 }));

    // Sibling assertion isolating blocksBelow: identical fixture WITHOUT the
    // blocking layer → the lower base surface remains reachable. This proves
    // it is `blocksBelow`, not the stacking order, doing the shielding.
    const nonBlocking = createRegionRouter(fixture(), {
      getLayer: (r) => (isOverlay(r) ? { id: 'overlay' } : 'base'),
    });
    const all = nonBlocking.hitTestAll(5, 0, { type: 'press', button: 0 }).map((m) => m.region.id);
    expect(all).toContain(surfaceId('base-surface', { i: 0 }));
  });

  // ─── (d) The full declared-interaction matrix resolves ───────────────────

  it('resolves every routable interaction kind a surface can declare', () => {
    const surface = region({
      id: surfaceId('full-surface'),
      handlers: {
        onClick: 'left',
        onRightClick: 'context',
        onMouseUp: 'release',
        onMouseMove: 'hover-move',
        onScroll: 'wheel',
      },
    });
    const ev = { x: 0, y: 0, ctrl: false, alt: false, shift: false } as const;
    expect(resolveRegionHandler(surface, { ...ev, type: 'press', button: 0 })).toBe('left');
    expect(resolveRegionHandler(surface, { ...ev, type: 'press', button: 2 })).toBe('context');
    expect(resolveRegionHandler(surface, { ...ev, type: 'release', button: 0 })).toBe('release');
    expect(resolveRegionHandler(surface, { ...ev, type: 'move', button: 'none' })).toBe('hover-move');
    expect(resolveRegionHandler(surface, { ...ev, type: 'scroll-up', button: 'none' })).toBe('wheel');
    expect(resolveRegionHandler(surface, { ...ev, type: 'scroll-down', button: 'none' })).toBe('wheel');
  });

  it('routes modifier-aware and capture-phase handlers per surface', () => {
    const surface = region({
      id: surfaceId('mod-surface'),
      handlers: {
        onClick: { default: 'open', shift: 'range', ctrl: 'multi' },
        onClickCapture: 'pre',
      },
    });
    const ev = { x: 0, y: 0, alt: false } as const;
    expect(resolveRegionHandler(surface, { ...ev, type: 'press', button: 0, ctrl: false, shift: true })).toBe('range');
    expect(resolveRegionHandler(surface, { ...ev, type: 'press', button: 0, ctrl: true, shift: false })).toBe('multi');
    expect(resolveRegionHandler(surface, { ...ev, type: 'press', button: 0, ctrl: false, shift: false })).toBe('open');
    expect(resolveRegionHandler(surface, { ...ev, type: 'press', button: 0, ctrl: false, shift: false }, 'capture')).toBe('pre');
  });

  // ─── (e) Decorative / hover-only regions never shadow an interactive one ──

  it('a hover-only decoration above an interactive surface does not steal its click', () => {
    const router = createRegionRouter([
      surfaceRegion('interactive', 0, { zIndex: 0, handlers: { onClick: 'do-it' } }),
      surfaceRegion('decoration', 0, { zIndex: 99, isHover: true, handlers: {} }),
    ]);
    const match = router.hitTest(5, 0, { type: 'press', button: 0 });
    expect(match?.region.id).toBe(surfaceId('interactive', { i: 0 }));
    expect(match?.handlerTag).toBe('do-it');
  });

  it('a handler-less region above an interactive surface does not shadow it (requireHandler default)', () => {
    const router = createRegionRouter([
      surfaceRegion('interactive', 0, { zIndex: 0, handlers: { onClick: 'do-it' } }),
      surfaceRegion('panel-chrome', 0, { zIndex: 50, handlers: {} }),
    ]);
    const match = router.hitTest(5, 0, { type: 'press', button: 0 });
    expect(match?.region.id).toBe(surfaceId('interactive', { i: 0 }));
  });

  // ─── Determinism at breadth ──────────────────────────────────────────────

  it('is deterministic across repeated hit-tests over the full 69-surface stack', () => {
    const regions = SURFACES.map((s, i) => surfaceRegion(s, i, { zIndex: i }));
    const router = createRegionRouter(regions);
    for (let pass = 0; pass < 3; pass++) {
      SURFACES.forEach((s, i) => {
        const match = router.hitTest(5, i, { type: 'press', button: 0 });
        expect(match?.region.id).toBe(surfaceId(s, { i }));
      });
    }
  });

  it('topmost zIndex wins when surfaces overlap (stacking determinism)', () => {
    const router = createRegionRouter([
      surfaceRegion('low', 0, { zIndex: 1, handlers: { onClick: 'low' } }),
      surfaceRegion('high', 0, { zIndex: 9, handlers: { onClick: 'high' } }),
      surfaceRegion('mid', 0, { zIndex: 5, handlers: { onClick: 'mid' } }),
    ]);
    expect(router.hitTest(5, 0, { type: 'press', button: 0 })?.handlerTag).toBe('high');
  });
});
