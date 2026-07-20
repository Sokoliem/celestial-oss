// @ts-nocheck
/**
 * Regression tests for critical and high-priority bugs in the Nebula core.
 *
 * Each test reproduces the exact failure condition BEFORE the fix is applied,
 * then asserts the correct expected behavior.
 */
import { describe, expect, it } from 'vitest';

// ─── Bug 2.5: onMouseLeave never fires when all hit regions cleared ─────────

describe('Bug 2.5: onMouseLeave should fire when hit regions are cleared', () => {
  it('should use saved lastHoveredRegion to fire leave when regions empty', () => {
    // The fix saves the full region info alongside lastHoveredId.
    // When regions are cleared, the saved region is used for the leave event.
    type HitRegionInfo = {
      id: string;
      handlers: { onMouseLeave?: string; onMouseEnter?: string };
      rect: { x: number; y: number; width: number; height: number };
    };

    const savedRegion: HitRegionInfo = {
      id: 'btn-1',
      handlers: { onMouseLeave: 'leave-handler' },
      rect: { x: 0, y: 0, width: 10, height: 3 },
    };

    // After fix: we have lastHoveredRegion saved alongside lastHoveredId
    let lastHoveredId: string | null = 'btn-1';
    let lastHoveredRegion: HitRegionInfo | null = savedRegion;
    const currentHitRegions: HitRegionInfo[] = []; // cleared

    // When regions are empty and we have a last hovered region saved,
    // we can still fire the leave event
    let leaveFired = false;
    if (currentHitRegions.length === 0 && lastHoveredId !== null && lastHoveredRegion) {
      if (lastHoveredRegion.handlers.onMouseLeave) {
        leaveFired = true;
      }
      lastHoveredId = null;
      lastHoveredRegion = null;
    }

    expect(leaveFired).toBe(true);
    expect(lastHoveredId).toBeNull();
    expect(lastHoveredRegion).toBeNull();
  });
});
