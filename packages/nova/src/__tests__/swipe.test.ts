import { describe, expect, it } from 'vitest';
import { createSwipeNavigator } from '../index.js';

describe('createSwipeNavigator', () => {
  it('dispatches matching swipe callbacks', () => {
    const navigator = createSwipeNavigator({
      threshold: 5,
      velocity: 0.2,
      onSwipeLeft: () => 'left',
      onSwipeRight: () => 'right',
    });

    expect(navigator.matches({ gesture: 'swipe', direction: 'left', distance: 6, velocity: 0.3 })).toBe(true);
    expect(navigator.handleSwipe({ gesture: 'swipe', direction: 'left', distance: 6, velocity: 0.3 })).toBe('left');
    expect(navigator.handleSwipe({ gesture: 'swipe', direction: 'right', distance: 6, velocity: 0.3 })).toBe('right');
  });

  it('ignores swipes below distance or velocity thresholds', () => {
    const navigator = createSwipeNavigator({
      threshold: 10,
      velocity: 0.5,
      onSwipeLeft: () => 'left',
    });

    expect(navigator.matches({ gesture: 'swipe', direction: 'left', distance: 9, velocity: 0.6 })).toBe(false);
    expect(navigator.matches({ gesture: 'swipe', direction: 'left', distance: 12, velocity: 0.4 })).toBe(false);
    expect(navigator.handleSwipe({ gesture: 'swipe', direction: 'left', distance: 12, velocity: 0.4 })).toBeUndefined();
  });

  it('ignores non-swipe gesture payloads', () => {
    const navigator = createSwipeNavigator({
      threshold: 1,
      velocity: 0,
      onSwipeLeft: () => 'left',
    });

    const notASwipe = { gesture: 'double-click', direction: 'left', distance: 99, velocity: 9 } as never;
    expect(navigator.matches(notASwipe)).toBe(false);
    expect(navigator.handleSwipe(notASwipe)).toBeUndefined();
  });

  it('rejects invalid thresholds and gesture measurements', () => {
    expect(() => createSwipeNavigator({ threshold: -1 })).toThrow(RangeError);
    const navigator = createSwipeNavigator({});
    expect(() => navigator.matches({ gesture: 'swipe', direction: 'left', distance: Number.NaN, velocity: 1 })).toThrow(TypeError);
  });
});
