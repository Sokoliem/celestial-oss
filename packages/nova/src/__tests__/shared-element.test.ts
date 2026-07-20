import { describe, expect, it } from 'vitest';
import {
  beginTransition,
  type CapturedElement,
  captureElements,
  createSharedElementState,
  endTransition,
  getInterpolatedRect,
  getTransitionProgress,
  interpolateRectAlongCurve,
  isTransitioning,
  type LayoutRect,
  type SharedElementState,
} from '../shared-element.js';

describe('shared-element', () => {
  // --- createSharedElementState ---

  describe('createSharedElementState', () => {
    it('returns empty captured map and not transitioning', () => {
      const state = createSharedElementState();
      expect(state.captured.size).toBe(0);
      expect(state.transitioning).toBe(false);
      expect(state.startTick).toBe(0);
      expect(state.duration).toBe(0);
    });
  });

  // --- captureElements ---

  describe('captureElements', () => {
    it('stores element rects in captured map', () => {
      const state = createSharedElementState();
      const elements = new Map<string, CapturedElement>([
        ['hero', { rect: { x: 10, y: 20, width: 100, height: 50 }, content: 'Hello' }],
        ['sidebar', { rect: { x: 0, y: 0, width: 30, height: 200 }, content: 'Nav' }],
      ]);

      const next = captureElements(state, elements);

      expect(next.captured.size).toBe(2);
      expect(next.captured.get('hero')).toEqual({
        rect: { x: 10, y: 20, width: 100, height: 50 },
        content: 'Hello',
      });
      expect(next.captured.get('sidebar')).toEqual({
        rect: { x: 0, y: 0, width: 30, height: 200 },
        content: 'Nav',
      });
    });
  });

  // --- beginTransition ---

  describe('beginTransition', () => {
    it('sets transitioning=true, startTick, and duration', () => {
      const state = createSharedElementState();
      const next = beginTransition(state, 42, 10);

      expect(next.transitioning).toBe(true);
      expect(next.startTick).toBe(42);
      expect(next.duration).toBe(10);
    });
  });

  // --- getInterpolatedRect ---

  describe('getInterpolatedRect', () => {
    const sourceRect: LayoutRect = { x: 0, y: 0, width: 100, height: 50 };
    const targetRect: LayoutRect = { x: 200, y: 100, width: 300, height: 150 };

    function makeTransitioningState(): SharedElementState {
      let state = createSharedElementState();
      const elements = new Map<string, CapturedElement>([['hero', { rect: sourceRect, content: 'Source' }]]);
      state = captureElements(state, elements);
      state = beginTransition(state, 0, 10);
      return state;
    }

    it('at progress 0 returns captured source rect', () => {
      const state = makeTransitioningState();
      const result = getInterpolatedRect(state, 'hero', targetRect, 0);
      expect(result).toEqual(sourceRect);
    });

    it('at progress 1 returns target rect', () => {
      const state = makeTransitioningState();
      const result = getInterpolatedRect(state, 'hero', targetRect, 10);
      expect(result).toEqual(targetRect);
    });

    it('at progress 0.5 returns midpoint', () => {
      const state = makeTransitioningState();
      const result = getInterpolatedRect(state, 'hero', targetRect, 5);
      expect(result).toEqual({
        x: 100,
        y: 50,
        width: 200,
        height: 100,
      });
    });

    it('with easing applies easing to progress', () => {
      const state = makeTransitioningState();
      // Easing that maps any t to 1 (always fully complete)
      const alwaysOne = (_t: number): number => 1;
      const result = getInterpolatedRect(state, 'hero', targetRect, 5, alwaysOne);
      expect(result).toEqual(targetRect);
    });

    it('with easing at various values', () => {
      const state = makeTransitioningState();
      // Easing that maps any t to 0 (always at start)
      const alwaysZero = (_t: number): number => 0;
      const result = getInterpolatedRect(state, 'hero', targetRect, 5, alwaysZero);
      expect(result).toEqual(sourceRect);
    });

    it('for non-captured ID returns target rect unchanged', () => {
      const state = makeTransitioningState();
      const result = getInterpolatedRect(state, 'nonexistent', targetRect, 5);
      expect(result).toEqual(targetRect);
    });

    it('clamps progress below 0 to 0', () => {
      // startTick=10, tick=5 => negative elapsed => clamped to 0
      let state = createSharedElementState();
      const elements = new Map<string, CapturedElement>([['hero', { rect: sourceRect, content: 'Source' }]]);
      state = captureElements(state, elements);
      state = beginTransition(state, 10, 10);

      const result = getInterpolatedRect(state, 'hero', targetRect, 5);
      expect(result).toEqual(sourceRect);
    });

    it('clamps progress above 1 to 1', () => {
      const state = makeTransitioningState();
      // tick=20, duration=10, startTick=0 => progress=2 => clamped to 1
      const result = getInterpolatedRect(state, 'hero', targetRect, 20);
      expect(result).toEqual(targetRect);
    });
  });

  // --- getTransitionProgress ---

  describe('getTransitionProgress', () => {
    it('returns 0 at transition start', () => {
      let state = createSharedElementState();
      state = beginTransition(state, 10, 20);
      expect(getTransitionProgress(state, 10)).toBe(0);
    });

    it('returns 0.5 at midpoint', () => {
      let state = createSharedElementState();
      state = beginTransition(state, 10, 20);
      expect(getTransitionProgress(state, 20)).toBe(0.5);
    });

    it('returns 1 at end', () => {
      let state = createSharedElementState();
      state = beginTransition(state, 10, 20);
      expect(getTransitionProgress(state, 30)).toBe(1);
    });

    it('clamps to 0 before start', () => {
      let state = createSharedElementState();
      state = beginTransition(state, 10, 20);
      expect(getTransitionProgress(state, 5)).toBe(0);
    });

    it('clamps to 1 past end', () => {
      let state = createSharedElementState();
      state = beginTransition(state, 10, 20);
      expect(getTransitionProgress(state, 100)).toBe(1);
    });
  });

  // --- isTransitioning ---

  describe('isTransitioning', () => {
    it('returns false for initial state', () => {
      const state = createSharedElementState();
      expect(isTransitioning(state)).toBe(false);
    });

    it('returns true after beginTransition', () => {
      let state = createSharedElementState();
      state = beginTransition(state, 0, 10);
      expect(isTransitioning(state)).toBe(true);
    });

    it('returns false after endTransition', () => {
      let state = createSharedElementState();
      state = beginTransition(state, 0, 10);
      state = endTransition(state);
      expect(isTransitioning(state)).toBe(false);
    });
  });

  // --- endTransition ---

  describe('endTransition', () => {
    it('clears transitioning flag', () => {
      let state = createSharedElementState();
      state = beginTransition(state, 5, 10);
      expect(state.transitioning).toBe(true);

      const ended = endTransition(state);
      expect(ended.transitioning).toBe(false);
    });
  });

  // --- Immutability ---

  describe('immutability', () => {
    it('captureElements returns a new object', () => {
      const state = createSharedElementState();
      const elements = new Map<string, CapturedElement>([['hero', { rect: { x: 0, y: 0, width: 10, height: 10 }, content: 'X' }]]);
      const next = captureElements(state, elements);
      expect(next).not.toBe(state);
      // Original should be unchanged
      expect(state.captured.size).toBe(0);
    });

    it('beginTransition returns a new object', () => {
      const state = createSharedElementState();
      const next = beginTransition(state, 0, 10);
      expect(next).not.toBe(state);
      expect(state.transitioning).toBe(false);
    });

    it('endTransition returns a new object', () => {
      let state = createSharedElementState();
      state = beginTransition(state, 0, 10);
      const ended = endTransition(state);
      expect(ended).not.toBe(state);
      expect(state.transitioning).toBe(true);
    });
  });

  describe('validation', () => {
    it('rejects invalid timing, geometry, and easing results', () => {
      const state = createSharedElementState();
      expect(() => beginTransition(state, Number.NaN, 10)).toThrow(TypeError);
      expect(() => beginTransition(state, 0, -1)).toThrow(RangeError);
      expect(() => interpolateRectAlongCurve({ x: 0, y: 0, width: -1, height: 1 }, { x: 1, y: 1, width: 1, height: 1 }, 0.5)).toThrow(RangeError);

      const captured = captureElements(state, new Map([['hero', { rect: { x: 0, y: 0, width: 1, height: 1 }, content: 'x' }]]));
      const active = beginTransition(captured, 0, 10);
      expect(() => getInterpolatedRect(active, 'hero', { x: 1, y: 1, width: 1, height: 1 }, 5, () => Number.NaN)).toThrow(TypeError);
    });
  });
});
