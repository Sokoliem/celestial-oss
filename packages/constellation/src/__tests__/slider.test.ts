import { describe, expect, it, vi } from 'vitest';
import { slider } from '../slider.js';

describe('slider', () => {
  it('sets the value from the clicked track position', () => {
    const component = slider({ min: 0, max: 100, step: 10, width: 11, value: 0 });
    const [initial] = component.init();
    const [middle] = component.update({ type: 'set-at', index: 5 }, initial);
    const [maximum] = component.update({ type: 'drag-at', index: 10 }, middle);

    expect(middle.value).toBe(50);
    expect(middle.dragging).toBe(true);
    expect(maximum.value).toBe(100);
  });

  describe('init', () => {
    it('initializes with default min value when no value provided', () => {
      const component = slider({});
      const [model] = component.init();
      expect(model.value).toBe(0);
      expect(model.focused).toBe(false);
    });

    it('initializes with provided value', () => {
      const component = slider({ value: 50 });
      const [model] = component.init();
      expect(model.value).toBe(50);
    });

    it('clamps value to min/max range', () => {
      const component = slider({ min: 10, max: 90, value: 200 });
      const [model] = component.init();
      expect(model.value).toBe(90);
    });

    it('clamps value below min to min', () => {
      const component = slider({ min: 10, max: 90, value: -5 });
      const [model] = component.init();
      expect(model.value).toBe(10);
    });

    it('snaps initial value to step', () => {
      const component = slider({ min: 0, max: 100, step: 10, value: 23 });
      const [model] = component.init();
      expect(model.value).toBe(20);
    });
  });

  describe('update', () => {
    it('increments by step', () => {
      const component = slider({ min: 0, max: 100, step: 5 });
      const model = { value: 50, focused: true };
      const [updated] = component.update({ type: 'increment' }, model);
      expect(updated.value).toBe(55);
    });

    it('decrements by step', () => {
      const component = slider({ min: 0, max: 100, step: 5 });
      const model = { value: 50, focused: true };
      const [updated] = component.update({ type: 'decrement' }, model);
      expect(updated.value).toBe(45);
    });

    it('does not exceed max', () => {
      const component = slider({ min: 0, max: 100, step: 1 });
      const model = { value: 100, focused: true };
      const [updated] = component.update({ type: 'increment' }, model);
      expect(updated.value).toBe(100);
    });

    it('does not go below min', () => {
      const component = slider({ min: 0, max: 100, step: 1 });
      const model = { value: 0, focused: true };
      const [updated] = component.update({ type: 'decrement' }, model);
      expect(updated.value).toBe(0);
    });

    it('increment-large jumps by step * 10', () => {
      const component = slider({ min: 0, max: 100, step: 1 });
      const model = { value: 50, focused: true };
      const [updated] = component.update({ type: 'increment-large' }, model);
      expect(updated.value).toBe(60);
    });

    it('decrement-large jumps by step * 10', () => {
      const component = slider({ min: 0, max: 100, step: 1 });
      const model = { value: 50, focused: true };
      const [updated] = component.update({ type: 'decrement-large' }, model);
      expect(updated.value).toBe(40);
    });

    it('set-min jumps to min', () => {
      const component = slider({ min: 10, max: 90 });
      const model = { value: 50, focused: true };
      const [updated] = component.update({ type: 'set-min' }, model);
      expect(updated.value).toBe(10);
    });

    it('set-max jumps to max', () => {
      const component = slider({ min: 10, max: 90 });
      const model = { value: 50, focused: true };
      const [updated] = component.update({ type: 'set-max' }, model);
      expect(updated.value).toBe(90);
    });

    it('calls onChange when value changes', () => {
      const onChange = vi.fn();
      const component = slider({ min: 0, max: 100, step: 1, onChange });
      const model = { value: 50, focused: true };
      component.update({ type: 'increment' }, model);
      expect(onChange).toHaveBeenCalledWith(51);
    });

    it('does not call onChange when value is clamped and unchanged', () => {
      const onChange = vi.fn();
      const component = slider({ min: 0, max: 100, step: 1, onChange });
      const model = { value: 100, focused: true };
      component.update({ type: 'increment' }, model);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('handles focus message', () => {
      const component = slider({});
      const model = { value: 50, focused: false };
      const [updated] = component.update({ type: 'focus' }, model);
      expect(updated.focused).toBe(true);
    });

    it('handles blur message', () => {
      const component = slider({});
      const model = { value: 50, focused: true };
      const [updated] = component.update({ type: 'blur' }, model);
      expect(updated.focused).toBe(false);
    });
  });

  describe('view', () => {
    it('renders a row node', () => {
      const component = slider({ min: 0, max: 100, value: 50 });
      const [model] = component.init();
      const vnode = component.view(model);
      expect(vnode.kind).toBe('row');
    });

    it('includes value label by default', () => {
      const component = slider({ min: 0, max: 100, value: 50, showValue: true });
      const [model] = component.init();
      const vnode = component.view(model);
      if (vnode.kind === 'row') {
        const texts = vnode.children.filter((c) => c.kind === 'text').map((c) => (c.kind === 'text' ? c.content : ''));
        expect(texts.some((t) => t.includes('50'))).toBe(true);
      }
    });

    it('renders label when provided', () => {
      const component = slider({ label: 'Volume' });
      const [model] = component.init();
      const vnode = component.view(model);
      if (vnode.kind === 'row') {
        const first = vnode.children[0];
        if (first?.kind === 'text') {
          expect(first.content).toContain('Volume');
        }
      }
    });

    it('renders filled track characters', () => {
      const component = slider({ min: 0, max: 100, value: 50, width: 10 });
      const [model] = component.init();
      const vnode = component.view(model);
      if (vnode.kind === 'row') {
        const trackTexts = vnode.children.map((child) => {
          if (child.kind === 'text') return child.content;
          if (child.kind === 'event' && child.child.kind === 'text') return child.child.content;
          return '';
        });
        const filled = trackTexts.find((t) => t.includes('█'));
        expect(filled).toBeDefined();
      }
    });
  });

  describe('subscriptions', () => {
    it('keeps pointer subscriptions active when not focused', () => {
      const component = slider({});
      const sub = component.subscriptions?.({ value: 50, focused: false });
      expect(sub).toBeDefined();
      if (sub) {
        expect(sub._kind.kind).toBe('batch');
      }
    });

    it('returns batch of key subscriptions when focused', () => {
      const component = slider({});
      const sub = component.subscriptions?.({ value: 50, focused: true });
      expect(sub).toBeDefined();
      if (sub) {
        expect(sub._kind.kind).toBe('batch');
      }
    });
  });

  it('normalizes reversed ranges, zero steps, and unsafe dimensions', () => {
    const component = slider({ min: 100, max: 0, step: 0, width: Number.POSITIVE_INFINITY, value: Number.NaN });
    const [model] = component.init();
    expect(model.value).toBe(0);
    expect(() => component.view(model)).not.toThrow();
  });

  it('renders the full finite number range without overflow', () => {
    const component = slider({ min: -Number.MAX_VALUE, max: Number.MAX_VALUE, value: 0, width: 3 });
    const [model] = component.init();
    expect(Number.isFinite(model.value)).toBe(true);
    expect(() => component.view(model)).not.toThrow();
  });
});
