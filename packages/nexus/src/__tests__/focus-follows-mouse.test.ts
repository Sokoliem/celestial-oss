import { describe, expect, it } from 'vitest';
import { createFocusFollowsMouseState, focusFollowsMouseUpdate, getFocusedRegionId } from '../focus-follows-mouse.js';

describe('focus-follows-mouse', () => {
  it('focuses after dwell in sloppy mode', () => {
    let state = createFocusFollowsMouseState();
    state = focusFollowsMouseUpdate({ type: 'focus-follow-mouse-move', x: 4, y: 4, regionId: 'panel-a', timestamp: 0 }, state);
    state = focusFollowsMouseUpdate({ type: 'focus-follow-mouse-tick', timestamp: 400 }, state, { dwellMs: 300 });

    expect(getFocusedRegionId(state)).toBe('panel-a');
  });

  it('requires click in strict mode', () => {
    let state = createFocusFollowsMouseState();
    state = focusFollowsMouseUpdate({ type: 'focus-follow-mouse-move', x: 4, y: 4, regionId: 'panel-a', timestamp: 0 }, state, {
      mode: 'strict',
      dwellMs: 300,
    });
    state = focusFollowsMouseUpdate({ type: 'focus-follow-mouse-tick', timestamp: 400 }, state, { mode: 'strict', dwellMs: 300 });
    expect(getFocusedRegionId(state)).toBeNull();

    state = focusFollowsMouseUpdate({ type: 'focus-follow-mouse-click', regionId: 'panel-a' }, state, { mode: 'strict' });
    expect(getFocusedRegionId(state)).toBe('panel-a');
  });

  it('ignores excluded regions', () => {
    let state = createFocusFollowsMouseState();
    state = focusFollowsMouseUpdate({ type: 'focus-follow-mouse-move', x: 4, y: 4, regionId: 'statusbar', timestamp: 0 }, state, {
      excludeRegions: ['statusbar'],
    });
    state = focusFollowsMouseUpdate({ type: 'focus-follow-mouse-tick', timestamp: 400 }, state, { excludeRegions: ['statusbar'] });

    expect(getFocusedRegionId(state)).toBeNull();
  });
});
