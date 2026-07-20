import { describe, expect, it, vi } from 'vitest';
import { type CapturedElement, createSharedElementTransition, type LayoutRect, type SharedElementTransitionState } from '../index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sourceRect: LayoutRect = { x: 0, y: 0, width: 10, height: 5 };
const targetRect: LayoutRect = { x: 20, y: 10, width: 30, height: 15 };

function makeElements(id = 'hero', rect = sourceRect): Map<string, CapturedElement> {
  return new Map([[id, { rect, content: 'src' }]]);
}

function multiLineContent(label: string, rows = 3, cols = 10): string {
  return Array.from({ length: rows }, (_, i) => (label + i.toString()).padEnd(cols).slice(0, cols)).join('\n');
}

const OLD = multiLineContent('OLD', 3, 10);
const NEW = multiLineContent('NEW', 3, 10);

// ---------------------------------------------------------------------------
// createSharedElementTransition
// ---------------------------------------------------------------------------

describe('shared-element-transition', () => {
  // --- init ---

  describe('init', () => {
    it('returns idle state with no captured elements', () => {
      const ctrl = createSharedElementTransition();
      const state = ctrl.init();
      expect(state.active).toBe(false);
      expect(state.completed).toBe(false);
      expect(state.tick).toBe(0);
      expect(state.sharedElements.captured.size).toBe(0);
    });
  });

  // --- capture ---

  describe('capture', () => {
    it('stores elements in shared element state', () => {
      const ctrl = createSharedElementTransition();
      let state = ctrl.init();
      state = ctrl.capture(state, makeElements());
      expect(state.sharedElements.captured.size).toBe(1);
      expect(state.sharedElements.captured.get('hero')).toBeDefined();
    });

    it('preserves immutability', () => {
      const ctrl = createSharedElementTransition();
      const state = ctrl.init();
      const next = ctrl.capture(state, makeElements());
      expect(next).not.toBe(state);
      expect(state.sharedElements.captured.size).toBe(0);
    });
  });

  // --- begin ---

  describe('begin', () => {
    it('sets active=true and records start tick', () => {
      const ctrl = createSharedElementTransition({ duration: 10 });
      let state = ctrl.init();
      state = ctrl.capture(state, makeElements());
      state = ctrl.begin(state, 5);
      expect(state.active).toBe(true);
      expect(state.completed).toBe(false);
      expect(state.tick).toBe(5);
      expect(state.sharedElements.transitioning).toBe(true);
    });
  });

  // --- tick ---

  describe('tick', () => {
    it('updates tick value', () => {
      const ctrl = createSharedElementTransition({ duration: 10 });
      let state = ctrl.init();
      state = ctrl.capture(state, makeElements());
      state = ctrl.begin(state, 0);
      state = ctrl.tick(state, 3);
      expect(state.tick).toBe(3);
    });

    it('auto-completes when progress reaches 1', () => {
      const ctrl = createSharedElementTransition({ duration: 10 });
      let state = ctrl.init();
      state = ctrl.capture(state, makeElements());
      state = ctrl.begin(state, 0);
      state = ctrl.tick(state, 10);
      expect(state.active).toBe(false);
      expect(state.completed).toBe(true);
    });

    it('calls onComplete callback when auto-completing', () => {
      const onComplete = vi.fn();
      const ctrl = createSharedElementTransition({ duration: 5, onComplete });
      let state = ctrl.init();
      state = ctrl.capture(state, makeElements());
      state = ctrl.begin(state, 0);
      state = ctrl.tick(state, 5);
      expect(onComplete).toHaveBeenCalledOnce();
    });

    it('does not call onComplete more than once', () => {
      const onComplete = vi.fn();
      const ctrl = createSharedElementTransition({ duration: 5, onComplete });
      let state = ctrl.init();
      state = ctrl.capture(state, makeElements());
      state = ctrl.begin(state, 0);
      state = ctrl.tick(state, 5);
      // Already completed; ticking again should not re-fire
      state = ctrl.tick(state, 6);
      expect(onComplete).toHaveBeenCalledOnce();
    });

    it('passes through tick when not active', () => {
      const ctrl = createSharedElementTransition();
      let state = ctrl.init();
      state = ctrl.tick(state, 42);
      expect(state.tick).toBe(42);
      expect(state.active).toBe(false);
    });
  });

  // --- progress ---

  describe('progress', () => {
    it('returns 0 at start', () => {
      const ctrl = createSharedElementTransition({ duration: 10 });
      let state = ctrl.init();
      state = ctrl.capture(state, makeElements());
      state = ctrl.begin(state, 0);
      expect(ctrl.progress(state)).toBe(0);
    });

    it('returns 0.5 at midpoint', () => {
      const ctrl = createSharedElementTransition({ duration: 10 });
      let state = ctrl.init();
      state = ctrl.capture(state, makeElements());
      state = ctrl.begin(state, 0);
      state = ctrl.tick(state, 5);
      expect(ctrl.progress(state)).toBe(0.5);
    });

    it('applies easing when provided', () => {
      const easeDouble = (t: number) => Math.min(1, t * 2);
      const ctrl = createSharedElementTransition({ duration: 10, easing: easeDouble });
      let state = ctrl.init();
      state = ctrl.capture(state, makeElements());
      state = ctrl.begin(state, 0);
      state = ctrl.tick(state, 3);
      // raw=0.3, eased=0.6
      expect(ctrl.progress(state)).toBeCloseTo(0.6, 5);
    });
  });

  // --- isActive ---

  describe('isActive', () => {
    it('returns false before begin', () => {
      const ctrl = createSharedElementTransition();
      expect(ctrl.isActive(ctrl.init())).toBe(false);
    });

    it('returns true during transition', () => {
      const ctrl = createSharedElementTransition({ duration: 10 });
      let state = ctrl.init();
      state = ctrl.capture(state, makeElements());
      state = ctrl.begin(state, 0);
      expect(ctrl.isActive(state)).toBe(true);
    });

    it('returns false after completion', () => {
      const ctrl = createSharedElementTransition({ duration: 5 });
      let state = ctrl.init();
      state = ctrl.capture(state, makeElements());
      state = ctrl.begin(state, 0);
      state = ctrl.tick(state, 5);
      expect(ctrl.isActive(state)).toBe(false);
    });
  });

  // --- renderBackground ---

  describe('renderBackground', () => {
    it('returns new content when not active and completed', () => {
      const ctrl = createSharedElementTransition({ duration: 5 });
      let state = ctrl.init();
      state = ctrl.capture(state, makeElements());
      state = ctrl.begin(state, 0);
      state = ctrl.tick(state, 5); // completes
      const frame = ctrl.renderBackground(state, OLD, NEW);
      expect(frame).toBe(NEW);
    });

    it('returns new content when never started', () => {
      const ctrl = createSharedElementTransition();
      const state = ctrl.init();
      const frame = ctrl.renderBackground(state, OLD, NEW);
      expect(frame).toBe(NEW);
    });

    it('returns crossfade frame during transition (default strategy)', () => {
      const ctrl = createSharedElementTransition({ strategy: 'crossfade', duration: 10 });
      let state = ctrl.init();
      state = ctrl.capture(state, makeElements());
      state = ctrl.begin(state, 0);
      state = ctrl.tick(state, 5);
      const frame = ctrl.renderBackground(state, OLD, NEW);
      // Mid-crossfade: should differ from both old and new
      expect(frame).not.toBe(OLD);
      expect(frame).not.toBe(NEW);
    });

    it('uses slide strategy when configured', () => {
      const ctrl = createSharedElementTransition({
        strategy: 'slide',
        direction: 'left',
        duration: 10,
      });
      let state = ctrl.init();
      state = ctrl.capture(state, makeElements());
      state = ctrl.begin(state, 0);
      state = ctrl.tick(state, 5);
      const frame = ctrl.renderBackground(state, OLD, NEW);
      expect(frame).not.toBe(OLD);
      expect(frame).not.toBe(NEW);
    });

    it('uses blur strategy when configured', () => {
      const ctrl = createSharedElementTransition({ strategy: 'blur', duration: 10 });
      let state = ctrl.init();
      state = ctrl.capture(state, makeElements());
      state = ctrl.begin(state, 0);
      state = ctrl.tick(state, 2);
      const frame = ctrl.renderBackground(state, OLD, NEW);
      expect(typeof frame).toBe('string');
      expect(frame.length).toBeGreaterThan(0);
    });

    it('uses dissolve strategy when configured', () => {
      const ctrl = createSharedElementTransition({
        strategy: 'dissolve',
        dissolveSeed: 99,
        duration: 10,
      });
      let state = ctrl.init();
      state = ctrl.capture(state, makeElements());
      state = ctrl.begin(state, 0);
      state = ctrl.tick(state, 5);
      const frame = ctrl.renderBackground(state, OLD, NEW);
      expect(typeof frame).toBe('string');
    });

    it('uses zoom strategy when configured', () => {
      const ctrl = createSharedElementTransition({
        strategy: 'zoom',
        zoomMode: 'out',
        zoomOrigin: { x: 0, y: 0 },
        duration: 10,
      });
      let state = ctrl.init();
      state = ctrl.capture(state, makeElements());
      state = ctrl.begin(state, 0);
      state = ctrl.tick(state, 5);
      const frame = ctrl.renderBackground(state, OLD, NEW);
      expect(typeof frame).toBe('string');
    });

    it('uses morph strategy when configured', () => {
      const ctrl = createSharedElementTransition({ strategy: 'morph', duration: 10 });
      let state = ctrl.init();
      state = ctrl.capture(state, makeElements());
      state = ctrl.begin(state, 0);
      state = ctrl.tick(state, 5);
      const frame = ctrl.renderBackground(state, OLD, NEW);
      expect(typeof frame).toBe('string');
    });

    it('uses wipe strategy when configured', () => {
      const ctrl = createSharedElementTransition({ strategy: 'wipe', duration: 10 });
      let state = ctrl.init();
      state = ctrl.capture(state, makeElements());
      state = ctrl.begin(state, 0);
      state = ctrl.tick(state, 5);
      const frame = ctrl.renderBackground(state, OLD, NEW);
      expect(typeof frame).toBe('string');
    });
  });

  // --- getElementRect ---

  describe('getElementRect', () => {
    it('returns target rect when not active', () => {
      const ctrl = createSharedElementTransition();
      const state = ctrl.init();
      const rect = ctrl.getElementRect(state, 'hero', targetRect);
      expect(rect).toEqual(targetRect);
    });

    it('returns source rect at progress 0', () => {
      const ctrl = createSharedElementTransition({ duration: 10 });
      let state = ctrl.init();
      state = ctrl.capture(state, makeElements('hero', sourceRect));
      state = ctrl.begin(state, 0);
      // tick=0 => progress=0
      const rect = ctrl.getElementRect(state, 'hero', targetRect);
      expect(rect).toEqual(sourceRect);
    });

    it('returns interpolated rect at midpoint', () => {
      const ctrl = createSharedElementTransition({ duration: 10 });
      let state = ctrl.init();
      state = ctrl.capture(state, makeElements('hero', sourceRect));
      state = ctrl.begin(state, 0);
      state = ctrl.tick(state, 5);
      const rect = ctrl.getElementRect(state, 'hero', targetRect);
      // Midpoint: lerp(0, 20, 0.5) = 10, lerp(0, 10, 0.5) = 5, etc.
      expect(rect.x).toBeCloseTo(10, 5);
      expect(rect.y).toBeCloseTo(5, 5);
      expect(rect.width).toBeCloseTo(20, 5);
      expect(rect.height).toBeCloseTo(10, 5);
    });

    it('applies easing to rect interpolation', () => {
      const alwaysOne = (_t: number) => 1;
      const ctrl = createSharedElementTransition({ duration: 10, easing: alwaysOne });
      let state = ctrl.init();
      state = ctrl.capture(state, makeElements('hero', sourceRect));
      state = ctrl.begin(state, 0);
      state = ctrl.tick(state, 3); // raw=0.3, eased=1
      const rect = ctrl.getElementRect(state, 'hero', targetRect);
      expect(rect).toEqual(targetRect);
    });

    it('returns target rect for unknown element id', () => {
      const ctrl = createSharedElementTransition({ duration: 10 });
      let state = ctrl.init();
      state = ctrl.capture(state, makeElements('hero', sourceRect));
      state = ctrl.begin(state, 0);
      state = ctrl.tick(state, 5);
      const rect = ctrl.getElementRect(state, 'unknown', targetRect);
      expect(rect).toEqual(targetRect);
    });

    it('supports multiple shared elements simultaneously', () => {
      const ctrl = createSharedElementTransition({ duration: 10 });
      let state = ctrl.init();

      const elements = new Map<string, CapturedElement>([
        ['hero', { rect: { x: 0, y: 0, width: 10, height: 10 }, content: 'A' }],
        ['title', { rect: { x: 100, y: 0, width: 50, height: 20 }, content: 'B' }],
      ]);
      state = ctrl.capture(state, elements);
      state = ctrl.begin(state, 0);
      state = ctrl.tick(state, 5);

      const heroTarget: LayoutRect = { x: 20, y: 20, width: 30, height: 30 };
      const titleTarget: LayoutRect = { x: 50, y: 50, width: 100, height: 40 };

      const heroRect = ctrl.getElementRect(state, 'hero', heroTarget);
      const titleRect = ctrl.getElementRect(state, 'title', titleTarget);

      // Hero: midpoint between (0,0,10,10) and (20,20,30,30)
      expect(heroRect.x).toBeCloseTo(10, 5);
      expect(heroRect.y).toBeCloseTo(10, 5);
      expect(heroRect.width).toBeCloseTo(20, 5);
      expect(heroRect.height).toBeCloseTo(20, 5);

      // Title: midpoint between (100,0,50,20) and (50,50,100,40)
      expect(titleRect.x).toBeCloseTo(75, 5);
      expect(titleRect.y).toBeCloseTo(25, 5);
      expect(titleRect.width).toBeCloseTo(75, 5);
      expect(titleRect.height).toBeCloseTo(30, 5);
    });
  });

  // --- end ---

  describe('end', () => {
    it('manually ends an active transition', () => {
      const ctrl = createSharedElementTransition({ duration: 10 });
      let state = ctrl.init();
      state = ctrl.capture(state, makeElements());
      state = ctrl.begin(state, 0);
      state = ctrl.tick(state, 3);
      expect(state.active).toBe(true);
      state = ctrl.end(state);
      expect(state.active).toBe(false);
      expect(state.completed).toBe(true);
    });
  });

  // --- reset ---

  describe('reset', () => {
    it('returns fresh initial state', () => {
      const ctrl = createSharedElementTransition({ duration: 10 });
      let state = ctrl.init();
      state = ctrl.capture(state, makeElements());
      state = ctrl.begin(state, 0);
      state = ctrl.tick(state, 5);
      const fresh = ctrl.reset();
      expect(fresh.active).toBe(false);
      expect(fresh.completed).toBe(false);
      expect(fresh.tick).toBe(0);
      expect(fresh.sharedElements.captured.size).toBe(0);
    });
  });

  // --- Full lifecycle ---

  describe('full lifecycle', () => {
    it('capture → begin → tick through → auto-complete', () => {
      const onComplete = vi.fn();
      const ctrl = createSharedElementTransition({
        strategy: 'crossfade',
        duration: 4,
        onComplete,
      });
      let state = ctrl.init();

      // 1. Capture source elements
      state = ctrl.capture(state, makeElements('hero', sourceRect));
      expect(ctrl.isActive(state)).toBe(false);

      // 2. Begin transition
      state = ctrl.begin(state, 0);
      expect(ctrl.isActive(state)).toBe(true);
      expect(ctrl.progress(state)).toBe(0);

      // 3. Mid-transition
      state = ctrl.tick(state, 2);
      expect(ctrl.isActive(state)).toBe(true);
      expect(ctrl.progress(state)).toBeCloseTo(0.5, 5);

      // Background is mid-transition
      const frame = ctrl.renderBackground(state, OLD, NEW);
      expect(frame).not.toBe(OLD);
      expect(frame).not.toBe(NEW);

      // Shared element is mid-flight
      const rect = ctrl.getElementRect(state, 'hero', targetRect);
      expect(rect.x).toBeGreaterThan(sourceRect.x);
      expect(rect.x).toBeLessThan(targetRect.x);

      // 4. Complete
      state = ctrl.tick(state, 4);
      expect(ctrl.isActive(state)).toBe(false);
      expect(state.completed).toBe(true);
      expect(onComplete).toHaveBeenCalledOnce();

      // After completion, background returns new content
      const finalFrame = ctrl.renderBackground(state, OLD, NEW);
      expect(finalFrame).toBe(NEW);

      // After completion, element rect returns target
      const finalRect = ctrl.getElementRect(state, 'hero', targetRect);
      expect(finalRect).toEqual(targetRect);
    });

    it('can be reset and reused for another transition', () => {
      const ctrl = createSharedElementTransition({ duration: 4 });
      let state = ctrl.init();
      state = ctrl.capture(state, makeElements());
      state = ctrl.begin(state, 0);
      state = ctrl.tick(state, 4); // complete

      // Reset and start a new one
      state = ctrl.reset();
      expect(state.active).toBe(false);
      expect(state.completed).toBe(false);

      const newSource: LayoutRect = { x: 50, y: 50, width: 5, height: 5 };
      state = ctrl.capture(state, makeElements('btn', newSource));
      state = ctrl.begin(state, 10);
      state = ctrl.tick(state, 12);

      const btnTarget: LayoutRect = { x: 100, y: 100, width: 20, height: 20 };
      const rect = ctrl.getElementRect(state, 'btn', btnTarget);
      // progress = 2/4 = 0.5
      expect(rect.x).toBeCloseTo(75, 5);
      expect(rect.y).toBeCloseTo(75, 5);
    });
  });

  // --- Immutability ---

  describe('immutability', () => {
    it('all state transitions return new objects', () => {
      const ctrl = createSharedElementTransition({ duration: 10 });
      const s0 = ctrl.init();
      const s1 = ctrl.capture(s0, makeElements());
      const s2 = ctrl.begin(s1, 0);
      const s3 = ctrl.tick(s2, 5);
      const s4 = ctrl.end(s3);
      const s5 = ctrl.reset();

      // All should be distinct objects
      const states: SharedElementTransitionState[] = [s0, s1, s2, s3, s4, s5];
      for (let i = 0; i < states.length; i++) {
        for (let j = i + 1; j < states.length; j++) {
          expect(states[i]).not.toBe(states[j]);
        }
      }
    });
  });
});
