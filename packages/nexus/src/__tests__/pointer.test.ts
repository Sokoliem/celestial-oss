import { describe, expect, it } from 'vitest';
import type { HitRegion } from '../hitmap.js';
import { claimFromHitRegion, createPointerState, type PointerMsg, pointerUpdate, resolvedCursor } from '../pointer.js';

describe('createPointerState', () => {
  it('returns empty claims with default cursor', () => {
    const state = createPointerState();
    expect(state.claims).toEqual([]);
    expect(state.resolved).toBe('default');
  });
});

describe('pointerUpdate', () => {
  describe('pointer-claim', () => {
    it('adds a claim and resolves cursor', () => {
      const state = createPointerState();
      const msg: PointerMsg = {
        type: 'pointer-claim',
        claim: { cursor: 'pointer', priority: 'region', source: 'region:button-ok' },
      };
      const next = pointerUpdate(msg, state);
      expect(next.claims).toHaveLength(1);
      expect(next.claims[0]).toEqual({
        cursor: 'pointer',
        priority: 'region',
        source: 'region:button-ok',
      });
      expect(next.resolved).toBe('pointer');
    });

    it('replaces existing claim from same source', () => {
      let state = createPointerState();
      state = pointerUpdate(
        {
          type: 'pointer-claim',
          claim: { cursor: 'pointer', priority: 'region', source: 'region:btn' },
        },
        state,
      );
      state = pointerUpdate(
        {
          type: 'pointer-claim',
          claim: { cursor: 'text', priority: 'region', source: 'region:btn' },
        },
        state,
      );
      expect(state.claims).toHaveLength(1);
      expect(state.claims[0]!.cursor).toBe('text');
      expect(state.resolved).toBe('text');
    });

    it('resolves to highest priority claim', () => {
      let state = createPointerState();
      state = pointerUpdate(
        {
          type: 'pointer-claim',
          claim: { cursor: 'pointer', priority: 'region', source: 'region:link' },
        },
        state,
      );
      state = pointerUpdate(
        {
          type: 'pointer-claim',
          claim: { cursor: 'grabbing', priority: 'drag', source: 'drag:item-1' },
        },
        state,
      );
      expect(state.resolved).toBe('grabbing');
    });

    it('resolves to last-added among same priority', () => {
      let state = createPointerState();
      state = pointerUpdate(
        {
          type: 'pointer-claim',
          claim: { cursor: 'pointer', priority: 'region', source: 'region:btn-a' },
        },
        state,
      );
      state = pointerUpdate(
        {
          type: 'pointer-claim',
          claim: { cursor: 'text', priority: 'region', source: 'region:input-b' },
        },
        state,
      );
      expect(state.resolved).toBe('text');
    });
  });

  describe('pointer-release', () => {
    it('removes claim by source', () => {
      let state = createPointerState();
      state = pointerUpdate(
        {
          type: 'pointer-claim',
          claim: { cursor: 'pointer', priority: 'region', source: 'region:link' },
        },
        state,
      );
      state = pointerUpdate({ type: 'pointer-release', source: 'region:link' }, state);
      expect(state.claims).toHaveLength(0);
    });

    it('re-resolves after removal', () => {
      let state = createPointerState();
      state = pointerUpdate(
        {
          type: 'pointer-claim',
          claim: { cursor: 'pointer', priority: 'region', source: 'region:link' },
        },
        state,
      );
      state = pointerUpdate(
        {
          type: 'pointer-claim',
          claim: { cursor: 'grabbing', priority: 'drag', source: 'drag:item-1' },
        },
        state,
      );
      expect(state.resolved).toBe('grabbing');
      state = pointerUpdate({ type: 'pointer-release', source: 'drag:item-1' }, state);
      expect(state.resolved).toBe('pointer');
    });

    it('resolves to default when last claim removed', () => {
      let state = createPointerState();
      state = pointerUpdate(
        {
          type: 'pointer-claim',
          claim: { cursor: 'pointer', priority: 'region', source: 'region:link' },
        },
        state,
      );
      state = pointerUpdate({ type: 'pointer-release', source: 'region:link' }, state);
      expect(state.resolved).toBe('default');
    });

    it('no-ops for unknown source', () => {
      let state = createPointerState();
      state = pointerUpdate(
        {
          type: 'pointer-claim',
          claim: { cursor: 'pointer', priority: 'region', source: 'region:link' },
        },
        state,
      );
      const next = pointerUpdate({ type: 'pointer-release', source: 'nonexistent' }, state);
      expect(next.claims).toHaveLength(1);
      expect(next.resolved).toBe('pointer');
    });
  });

  describe('pointer-release-priority', () => {
    it('removes all claims at given priority', () => {
      let state = createPointerState();
      state = pointerUpdate(
        {
          type: 'pointer-claim',
          claim: { cursor: 'pointer', priority: 'region', source: 'region:a' },
        },
        state,
      );
      state = pointerUpdate(
        {
          type: 'pointer-claim',
          claim: { cursor: 'text', priority: 'region', source: 'region:b' },
        },
        state,
      );
      state = pointerUpdate(
        {
          type: 'pointer-claim',
          claim: { cursor: 'grabbing', priority: 'drag', source: 'drag:item' },
        },
        state,
      );
      state = pointerUpdate({ type: 'pointer-release-priority', priority: 'region' }, state);
      expect(state.claims).toHaveLength(1);
      expect(state.claims[0]!.source).toBe('drag:item');
    });

    it('re-resolves after removal', () => {
      let state = createPointerState();
      state = pointerUpdate(
        {
          type: 'pointer-claim',
          claim: { cursor: 'pointer', priority: 'region', source: 'region:link' },
        },
        state,
      );
      state = pointerUpdate(
        {
          type: 'pointer-claim',
          claim: { cursor: 'grabbing', priority: 'drag', source: 'drag:item' },
        },
        state,
      );
      state = pointerUpdate({ type: 'pointer-release-priority', priority: 'drag' }, state);
      expect(state.resolved).toBe('pointer');
    });
  });

  describe('pointer-clear', () => {
    it('removes all claims', () => {
      let state = createPointerState();
      state = pointerUpdate(
        {
          type: 'pointer-claim',
          claim: { cursor: 'pointer', priority: 'region', source: 'region:a' },
        },
        state,
      );
      state = pointerUpdate(
        {
          type: 'pointer-claim',
          claim: { cursor: 'grabbing', priority: 'drag', source: 'drag:item' },
        },
        state,
      );
      state = pointerUpdate({ type: 'pointer-clear' }, state);
      expect(state.claims).toHaveLength(0);
    });

    it('resolves to default', () => {
      let state = createPointerState();
      state = pointerUpdate(
        {
          type: 'pointer-claim',
          claim: { cursor: 'grabbing', priority: 'drag', source: 'drag:item' },
        },
        state,
      );
      state = pointerUpdate({ type: 'pointer-clear' }, state);
      expect(state.resolved).toBe('default');
    });
  });
});

describe('priority resolution', () => {
  it('drag wins over resize', () => {
    let state = createPointerState();
    state = pointerUpdate(
      {
        type: 'pointer-claim',
        claim: { cursor: 'ns-resize', priority: 'resize', source: 'resize:top' },
      },
      state,
    );
    state = pointerUpdate(
      {
        type: 'pointer-claim',
        claim: { cursor: 'grabbing', priority: 'drag', source: 'drag:item' },
      },
      state,
    );
    expect(state.resolved).toBe('grabbing');
  });

  it('resize wins over system', () => {
    let state = createPointerState();
    state = pointerUpdate(
      {
        type: 'pointer-claim',
        claim: { cursor: 'wait', priority: 'system', source: 'system:loading' },
      },
      state,
    );
    state = pointerUpdate(
      {
        type: 'pointer-claim',
        claim: { cursor: 'ew-resize', priority: 'resize', source: 'resize:left' },
      },
      state,
    );
    expect(state.resolved).toBe('ew-resize');
  });

  it('system wins over region', () => {
    let state = createPointerState();
    state = pointerUpdate(
      {
        type: 'pointer-claim',
        claim: { cursor: 'pointer', priority: 'region', source: 'region:link' },
      },
      state,
    );
    state = pointerUpdate(
      {
        type: 'pointer-claim',
        claim: { cursor: 'wait', priority: 'system', source: 'system:loading' },
      },
      state,
    );
    expect(state.resolved).toBe('wait');
  });

  it('region wins over default', () => {
    let state = createPointerState();
    state = pointerUpdate(
      {
        type: 'pointer-claim',
        claim: { cursor: 'default', priority: 'default', source: 'default:base' },
      },
      state,
    );
    state = pointerUpdate(
      {
        type: 'pointer-claim',
        claim: { cursor: 'pointer', priority: 'region', source: 'region:link' },
      },
      state,
    );
    expect(state.resolved).toBe('pointer');
  });

  it('last-claimed wins within same priority', () => {
    let state = createPointerState();
    state = pointerUpdate(
      {
        type: 'pointer-claim',
        claim: { cursor: 'ns-resize', priority: 'resize', source: 'resize:top' },
      },
      state,
    );
    state = pointerUpdate(
      {
        type: 'pointer-claim',
        claim: { cursor: 'ew-resize', priority: 'resize', source: 'resize:left' },
      },
      state,
    );
    expect(state.resolved).toBe('ew-resize');
  });
});

describe('resolvedCursor', () => {
  it('returns current resolved cursor', () => {
    let state = createPointerState();
    expect(resolvedCursor(state)).toBe('default');
    state = pointerUpdate(
      {
        type: 'pointer-claim',
        claim: { cursor: 'crosshair', priority: 'system', source: 'system:draw' },
      },
      state,
    );
    expect(resolvedCursor(state)).toBe('crosshair');
  });
});

describe('claimFromHitRegion', () => {
  it('returns pointer claim for region with cursor pointer', () => {
    const region: HitRegion<string> = {
      x: 0,
      y: 0,
      width: 10,
      height: 5,
      cursor: 'pointer',
    };
    const claim = claimFromHitRegion(region);
    expect(claim).toEqual({
      cursor: 'pointer',
      priority: 'region',
      source: 'hitregion',
    });
  });

  it('uses custom source to avoid claim collisions', () => {
    const regionA: HitRegion<string> = { x: 0, y: 0, width: 10, height: 5, cursor: 'pointer' };
    const regionB: HitRegion<string> = { x: 10, y: 0, width: 10, height: 5, cursor: 'pointer' };

    const claimA = claimFromHitRegion(regionA, 'region:btn-a');
    const claimB = claimFromHitRegion(regionB, 'region:btn-b');
    expect(claimA!.source).toBe('region:btn-a');
    expect(claimB!.source).toBe('region:btn-b');

    // Both claims can coexist in PointerState
    let state = createPointerState();
    state = pointerUpdate({ type: 'pointer-claim', claim: claimA! }, state);
    state = pointerUpdate({ type: 'pointer-claim', claim: claimB! }, state);
    expect(state.claims).toHaveLength(2);
  });

  it('returns null for region with cursor default', () => {
    const region: HitRegion<string> = {
      x: 0,
      y: 0,
      width: 10,
      height: 5,
      cursor: 'default',
    };
    const claim = claimFromHitRegion(region);
    expect(claim).toBeNull();
  });

  it('returns null for region with no cursor', () => {
    const region: HitRegion<string> = {
      x: 0,
      y: 0,
      width: 10,
      height: 5,
    };
    const claim = claimFromHitRegion(region);
    expect(claim).toBeNull();
  });
});
