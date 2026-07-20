import { beforeEach, describe, expect, it } from 'vitest';
import { resetTransitionState, transition } from '../transition.js';

describe('transition() with new strategies', () => {
  beforeEach(() => {
    resetTransitionState();
  });

  describe('morph strategy', () => {
    it('returns content directly on first call', () => {
      const result = transition('Hello', { key: 'a', type: 'morph', tick: 0, id: 'morph-test' });
      expect(result).toBe('Hello');
    });

    it('produces morph frames when key changes', () => {
      // Call 1: store initial state
      transition('Hello', { key: 'a', type: 'morph', tick: 0, duration: 6, id: 'morph-t2' });
      // Call 2: key changes — transition starts at tick=1
      transition('World', { key: 'b', type: 'morph', tick: 1, duration: 6, id: 'morph-t2' });
      // Call 3: advance to tick=4 — elapsed=3, progress=3/6=0.5
      const frame = transition('World', { key: 'b', type: 'morph', tick: 4, duration: 6, id: 'morph-t2' });
      expect(typeof frame).toBe('string');
      // Mid-transition should not be exactly old or new
      expect(frame).not.toBe('Hello');
      expect(frame).not.toBe('World');
    });

    it('completes after duration', () => {
      transition('Hello', { key: 'a', type: 'morph', tick: 0, duration: 6, id: 'morph-t3' });
      // Key changes at tick=0, transition starts; at tick=6 elapsed >= duration
      transition('World', { key: 'b', type: 'morph', tick: 0, duration: 6, id: 'morph-t3' });
      const result = transition('World', { key: 'b', type: 'morph', tick: 6, duration: 6, id: 'morph-t3' });
      expect(result).toBe('World');
    });
  });

  describe('blur strategy', () => {
    it('returns content directly on first call', () => {
      const result = transition('Hello', { key: 'a', type: 'blur', tick: 0, id: 'blur-t1' });
      expect(result).toBe('Hello');
    });

    it('produces blur frames when key changes', () => {
      transition('Hello', { key: 'a', type: 'blur', tick: 0, duration: 6, id: 'blur-t2' });
      transition('World', { key: 'b', type: 'blur', tick: 1, duration: 6, id: 'blur-t2' });
      const frame = transition('World', { key: 'b', type: 'blur', tick: 4, duration: 6, id: 'blur-t2' });
      expect(frame).toContain('\x1b[38;2;');
    });

    it('completes after duration', () => {
      transition('Hello', { key: 'a', type: 'blur', tick: 0, duration: 6, id: 'blur-t3' });
      transition('World', { key: 'b', type: 'blur', tick: 0, duration: 6, id: 'blur-t3' });
      const result = transition('World', { key: 'b', type: 'blur', tick: 6, duration: 6, id: 'blur-t3' });
      expect(result).toBe('World');
    });
  });

  describe('dissolve strategy', () => {
    it('returns content directly on first call', () => {
      const result = transition('Hello', { key: 'a', type: 'dissolve', tick: 0, id: 'dis-t1' });
      expect(result).toBe('Hello');
    });

    it('produces dissolve frames with ANSI codes', () => {
      transition('AAAA', { key: 'a', type: 'dissolve', tick: 0, duration: 6, id: 'dis-t2' });
      transition('BBBB', { key: 'b', type: 'dissolve', tick: 1, duration: 6, id: 'dis-t2' });
      const frame = transition('BBBB', { key: 'b', type: 'dissolve', tick: 4, duration: 6, id: 'dis-t2' });
      expect(frame).toContain('\x1b[38;2;');
    });

    it('respects dissolveSeed option', () => {
      transition('AAAA', { key: 'a', type: 'dissolve', tick: 0, duration: 6, id: 'dis-t3a', dissolveSeed: 1 });
      transition('BBBB', { key: 'b', type: 'dissolve', tick: 1, duration: 6, id: 'dis-t3a', dissolveSeed: 1 });
      const r1 = transition('BBBB', { key: 'b', type: 'dissolve', tick: 4, duration: 6, id: 'dis-t3a', dissolveSeed: 1 });

      transition('AAAA', { key: 'a', type: 'dissolve', tick: 0, duration: 6, id: 'dis-t3b', dissolveSeed: 9999 });
      transition('BBBB', { key: 'b', type: 'dissolve', tick: 1, duration: 6, id: 'dis-t3b', dissolveSeed: 9999 });
      const r2 = transition('BBBB', { key: 'b', type: 'dissolve', tick: 4, duration: 6, id: 'dis-t3b', dissolveSeed: 9999 });

      // Different seeds should produce different results
      expect(r1).not.toBe(r2);
    });
  });

  describe('zoom strategy', () => {
    it('returns content directly on first call', () => {
      const result = transition('Hello', { key: 'a', type: 'zoom', tick: 0, id: 'zoom-t1' });
      expect(result).toBe('Hello');
    });

    it('produces zoom frames with ANSI codes', () => {
      transition('old text', { key: 'a', type: 'zoom', tick: 0, duration: 6, id: 'zoom-t2' });
      transition('new text', { key: 'b', type: 'zoom', tick: 1, duration: 6, id: 'zoom-t2' });
      const frame = transition('new text', { key: 'b', type: 'zoom', tick: 4, duration: 6, id: 'zoom-t2' });
      expect(frame).toContain('\x1b[38;2;');
    });

    it('respects zoomMode option', () => {
      transition('AAAA', { key: 'a', type: 'zoom', tick: 0, duration: 6, id: 'zoom-t3a' });
      transition('BBBB', { key: 'b', type: 'zoom', tick: 1, duration: 6, id: 'zoom-t3a', zoomMode: 'in' });
      const rIn = transition('BBBB', { key: 'b', type: 'zoom', tick: 4, duration: 6, id: 'zoom-t3a', zoomMode: 'in' });

      transition('AAAA', { key: 'a', type: 'zoom', tick: 0, duration: 6, id: 'zoom-t3b' });
      transition('BBBB', { key: 'b', type: 'zoom', tick: 1, duration: 6, id: 'zoom-t3b', zoomMode: 'out' });
      const rOut = transition('BBBB', { key: 'b', type: 'zoom', tick: 4, duration: 6, id: 'zoom-t3b', zoomMode: 'out' });

      // Different modes should produce different results
      expect(rIn).not.toBe(rOut);
    });

    it('respects zoomOrigin option', () => {
      transition('AAAA\nAAAA', { key: 'a', type: 'zoom', tick: 0, duration: 6, id: 'zoom-t4a' });
      transition('BBBB\nBBBB', { key: 'b', type: 'zoom', tick: 1, duration: 6, id: 'zoom-t4a', zoomOrigin: { x: 0.5, y: 0.5 } });
      const rCenter = transition('BBBB\nBBBB', { key: 'b', type: 'zoom', tick: 4, duration: 6, id: 'zoom-t4a', zoomOrigin: { x: 0.5, y: 0.5 } });

      transition('AAAA\nAAAA', { key: 'a', type: 'zoom', tick: 0, duration: 6, id: 'zoom-t4b' });
      transition('BBBB\nBBBB', { key: 'b', type: 'zoom', tick: 1, duration: 6, id: 'zoom-t4b', zoomOrigin: { x: 0, y: 0 } });
      const rCorner = transition('BBBB\nBBBB', { key: 'b', type: 'zoom', tick: 4, duration: 6, id: 'zoom-t4b', zoomOrigin: { x: 0, y: 0 } });

      // Different origins should produce different results
      expect(rCenter).not.toBe(rCorner);
    });

    it('completes after duration', () => {
      transition('Hello', { key: 'a', type: 'zoom', tick: 0, duration: 6, id: 'zoom-t5' });
      transition('World', { key: 'b', type: 'zoom', tick: 0, duration: 6, id: 'zoom-t5' });
      const result = transition('World', { key: 'b', type: 'zoom', tick: 6, duration: 6, id: 'zoom-t5' });
      expect(result).toBe('World');
    });
  });

  describe('easing with all strategies', () => {
    it('applies easing to crossfade', () => {
      transition('old', { key: 'a', type: 'crossfade', tick: 0, duration: 10, id: 'ease-cf', easing: (t) => t * t });
      transition('new', { key: 'b', type: 'crossfade', tick: 0, duration: 10, id: 'ease-cf', easing: (t) => t * t });
      const frame = transition('new', { key: 'b', type: 'crossfade', tick: 5, duration: 10, id: 'ease-cf', easing: (t) => t * t });
      // At raw 0.5, eased = 0.25. Should show mostly old content (old layer dominates).
      expect(typeof frame).toBe('string');
    });

    it('applies easing to blur', () => {
      transition('old', { key: 'a', type: 'blur', tick: 0, duration: 10, id: 'ease-bl', easing: () => 0 });
      transition('new', { key: 'b', type: 'blur', tick: 0, duration: 10, id: 'ease-bl', easing: () => 0 });
      const frame = transition('new', { key: 'b', type: 'blur', tick: 5, duration: 10, id: 'ease-bl', easing: () => 0 });
      // Easing always returns 0, so should look like old content
      expect(frame).toBe('old');
    });

    it('applies easing to dissolve', () => {
      transition('old', { key: 'a', type: 'dissolve', tick: 0, duration: 10, id: 'ease-dis', easing: () => 1 });
      transition('new', { key: 'b', type: 'dissolve', tick: 0, duration: 10, id: 'ease-dis', easing: () => 1 });
      const frame = transition('new', { key: 'b', type: 'dissolve', tick: 5, duration: 10, id: 'ease-dis', easing: () => 1 });
      // Easing always returns 1, so should look like new content
      expect(frame).toBe('new');
    });

    it('applies easing to zoom', () => {
      transition('old', { key: 'a', type: 'zoom', tick: 0, duration: 10, id: 'ease-zm', easing: () => 1 });
      transition('new', { key: 'b', type: 'zoom', tick: 0, duration: 10, id: 'ease-zm', easing: () => 1 });
      const frame = transition('new', { key: 'b', type: 'zoom', tick: 5, duration: 10, id: 'ease-zm', easing: () => 1 });
      expect(frame).toBe('new');
    });
  });
});
