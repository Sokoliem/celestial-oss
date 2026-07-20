import { extractNodeText } from '@celestial/core/nebula';
import { describe, expect, it, vi } from 'vitest';
import type { RangeSliderModel } from '../range-slider.js';
import { rangeSlider, rangeSliderDragTest, rangeSliderHitTest } from '../range-slider.js';

describe('rangeSlider', () => {
  // ── init ──────────────────────────────────────────────────────────────

  describe('init', () => {
    it('initializes with defaults low=min, high=max', () => {
      const c = rangeSlider({});
      const [m] = c.init();
      expect(m.low).toBe(0);
      expect(m.high).toBe(100);
      expect(m.activeHandle).toBe('low');
      expect(m.focused).toBe(false);
    });

    it('initializes with custom low and high', () => {
      const c = rangeSlider({ min: 0, max: 100, low: 20, high: 80 });
      const [m] = c.init();
      expect(m.low).toBe(20);
      expect(m.high).toBe(80);
    });

    it('clamps low below min to min', () => {
      const c = rangeSlider({ min: 10, max: 90, low: -5 });
      const [m] = c.init();
      expect(m.low).toBe(10);
    });

    it('clamps high above max to max', () => {
      const c = rangeSlider({ min: 10, max: 90, high: 200 });
      const [m] = c.init();
      expect(m.high).toBe(90);
    });

    it('snaps initial values to step', () => {
      const c = rangeSlider({ min: 0, max: 100, step: 10, low: 23, high: 77 });
      const [m] = c.init();
      expect(m.low).toBe(20);
      expect(m.high).toBe(80);
    });

    it('enforces high >= low', () => {
      const c = rangeSlider({ min: 0, max: 100, low: 60, high: 40 });
      const [m] = c.init();
      expect(m.high).toBeGreaterThanOrEqual(m.low);
    });

    it('uses custom min/max/step/width defaults', () => {
      const c = rangeSlider({ min: 5, max: 50, step: 5 });
      const [m] = c.init();
      expect(m.low).toBe(5);
      expect(m.high).toBe(50);
    });
  });

  // ── update – low handle ───────────────────────────────────────────────

  describe('update – low handle active', () => {
    const base: RangeSliderModel = { low: 50, high: 80, activeHandle: 'low', focused: true };

    it('increment moves low up by step', () => {
      const c = rangeSlider({ min: 0, max: 100, step: 5 });
      const [m] = c.update({ type: 'increment' }, base);
      expect(m.low).toBe(55);
    });

    it('decrement moves low down by step', () => {
      const c = rangeSlider({ min: 0, max: 100, step: 5 });
      const [m] = c.update({ type: 'decrement' }, base);
      expect(m.low).toBe(45);
    });

    it('increment-large moves low by step*10', () => {
      const c = rangeSlider({ min: 0, max: 100, step: 1 });
      const [m] = c.update({ type: 'increment-large' }, base);
      expect(m.low).toBe(60);
    });

    it('decrement-large moves low by step*10', () => {
      const c = rangeSlider({ min: 0, max: 100, step: 1 });
      const [m] = c.update({ type: 'decrement-large' }, base);
      expect(m.low).toBe(40);
    });

    it('low does not exceed high', () => {
      const c = rangeSlider({ min: 0, max: 100, step: 1 });
      const m0: RangeSliderModel = { low: 80, high: 80, activeHandle: 'low', focused: true };
      const [m] = c.update({ type: 'increment' }, m0);
      expect(m.low).toBe(80);
    });

    it('low does not go below min', () => {
      const c = rangeSlider({ min: 0, max: 100, step: 1 });
      const m0: RangeSliderModel = { low: 0, high: 80, activeHandle: 'low', focused: true };
      const [m] = c.update({ type: 'decrement' }, m0);
      expect(m.low).toBe(0);
    });

    it('set-min sets low to min', () => {
      const c = rangeSlider({ min: 10, max: 90 });
      const [m] = c.update({ type: 'set-min' }, base);
      expect(m.low).toBe(10);
    });

    it('set-max with low handle moves low to high', () => {
      const c = rangeSlider({ min: 0, max: 100 });
      const [m] = c.update({ type: 'set-max' }, base);
      expect(m.low).toBe(80);
    });
  });

  // ── update – high handle ──────────────────────────────────────────────

  describe('update – high handle active', () => {
    const base: RangeSliderModel = { low: 20, high: 50, activeHandle: 'high', focused: true };

    it('increment moves high up by step', () => {
      const c = rangeSlider({ min: 0, max: 100, step: 5 });
      const [m] = c.update({ type: 'increment' }, base);
      expect(m.high).toBe(55);
    });

    it('decrement moves high down by step', () => {
      const c = rangeSlider({ min: 0, max: 100, step: 5 });
      const [m] = c.update({ type: 'decrement' }, base);
      expect(m.high).toBe(45);
    });

    it('increment-large moves high by step*10', () => {
      const c = rangeSlider({ min: 0, max: 100, step: 1 });
      const [m] = c.update({ type: 'increment-large' }, base);
      expect(m.high).toBe(60);
    });

    it('decrement-large moves high by step*10', () => {
      const c = rangeSlider({ min: 0, max: 100, step: 1 });
      const [m] = c.update({ type: 'decrement-large' }, base);
      expect(m.high).toBe(40);
    });

    it('high does not exceed max', () => {
      const c = rangeSlider({ min: 0, max: 100, step: 1 });
      const m0: RangeSliderModel = { low: 20, high: 100, activeHandle: 'high', focused: true };
      const [m] = c.update({ type: 'increment' }, m0);
      expect(m.high).toBe(100);
    });

    it('high does not go below low', () => {
      const c = rangeSlider({ min: 0, max: 100, step: 1 });
      const m0: RangeSliderModel = { low: 20, high: 20, activeHandle: 'high', focused: true };
      const [m] = c.update({ type: 'decrement' }, m0);
      expect(m.high).toBe(20);
    });

    it('set-min with high handle moves high to low', () => {
      const c = rangeSlider({ min: 0, max: 100 });
      const [m] = c.update({ type: 'set-min' }, base);
      expect(m.high).toBe(20);
    });

    it('set-max sets high to max', () => {
      const c = rangeSlider({ min: 10, max: 90 });
      const [m] = c.update({ type: 'set-max' }, base);
      expect(m.high).toBe(90);
    });
  });

  // ── update – set-low / set-high ───────────────────────────────────────

  describe('update – set-low / set-high', () => {
    const base: RangeSliderModel = { low: 30, high: 70, activeHandle: 'low', focused: true };

    it('set-low updates low and switches activeHandle to low', () => {
      const c = rangeSlider({ min: 0, max: 100 });
      const m0: RangeSliderModel = { ...base, activeHandle: 'high' };
      const [m] = c.update({ type: 'set-low', value: 40 }, m0);
      expect(m.low).toBe(40);
      expect(m.activeHandle).toBe('low');
    });

    it('set-high updates high and switches activeHandle to high', () => {
      const c = rangeSlider({ min: 0, max: 100 });
      const [m] = c.update({ type: 'set-high', value: 60 }, base);
      expect(m.high).toBe(60);
      expect(m.activeHandle).toBe('high');
    });

    it('set-low clamps to [min, high]', () => {
      const c = rangeSlider({ min: 0, max: 100 });
      const [m] = c.update({ type: 'set-low', value: 200 }, base);
      expect(m.low).toBeLessThanOrEqual(base.high);
    });

    it('set-high clamps to [low, max]', () => {
      const c = rangeSlider({ min: 0, max: 100 });
      const [m] = c.update({ type: 'set-high', value: -5 }, base);
      expect(m.high).toBeGreaterThanOrEqual(base.low);
    });

    it('set-low calls onChange when value changes', () => {
      const onChange = vi.fn();
      const c = rangeSlider({ min: 0, max: 100, onChange });
      c.update({ type: 'set-low', value: 40 }, base);
      expect(onChange).toHaveBeenCalledWith(40, 70);
    });

    it('set-high calls onChange when value changes', () => {
      const onChange = vi.fn();
      const c = rangeSlider({ min: 0, max: 100, onChange });
      c.update({ type: 'set-high', value: 60 }, base);
      expect(onChange).toHaveBeenCalledWith(30, 60);
    });
  });

  // ── update – switch-handle ────────────────────────────────────────────

  describe('update – switch-handle', () => {
    it('toggles from low to high', () => {
      const c = rangeSlider({});
      const m0: RangeSliderModel = { low: 0, high: 100, activeHandle: 'low', focused: true };
      const [m] = c.update({ type: 'switch-handle' }, m0);
      expect(m.activeHandle).toBe('high');
    });

    it('toggles from high to low', () => {
      const c = rangeSlider({});
      const m0: RangeSliderModel = { low: 0, high: 100, activeHandle: 'high', focused: true };
      const [m] = c.update({ type: 'switch-handle' }, m0);
      expect(m.activeHandle).toBe('low');
    });
  });

  // ── update – focus / blur ─────────────────────────────────────────────

  describe('update – focus / blur', () => {
    it('focus sets focused to true', () => {
      const c = rangeSlider({});
      const m0: RangeSliderModel = { low: 0, high: 100, activeHandle: 'low', focused: false };
      const [m] = c.update({ type: 'focus' }, m0);
      expect(m.focused).toBe(true);
    });

    it('blur sets focused to false', () => {
      const c = rangeSlider({});
      const m0: RangeSliderModel = { low: 0, high: 100, activeHandle: 'low', focused: true };
      const [m] = c.update({ type: 'blur' }, m0);
      expect(m.focused).toBe(false);
    });
  });

  // ── update – onChange callback ────────────────────────────────────────

  describe('update – onChange', () => {
    it('calls onChange on low increment', () => {
      const onChange = vi.fn();
      const c = rangeSlider({ min: 0, max: 100, step: 1, onChange });
      const m0: RangeSliderModel = { low: 50, high: 80, activeHandle: 'low', focused: true };
      c.update({ type: 'increment' }, m0);
      expect(onChange).toHaveBeenCalledWith(51, 80);
    });

    it('calls onChange on high decrement', () => {
      const onChange = vi.fn();
      const c = rangeSlider({ min: 0, max: 100, step: 1, onChange });
      const m0: RangeSliderModel = { low: 20, high: 50, activeHandle: 'high', focused: true };
      c.update({ type: 'decrement' }, m0);
      expect(onChange).toHaveBeenCalledWith(20, 49);
    });

    it('does not call onChange when low is clamped at min', () => {
      const onChange = vi.fn();
      const c = rangeSlider({ min: 0, max: 100, step: 1, onChange });
      const m0: RangeSliderModel = { low: 0, high: 80, activeHandle: 'low', focused: true };
      c.update({ type: 'decrement' }, m0);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('does not call onChange when high is clamped at max', () => {
      const onChange = vi.fn();
      const c = rangeSlider({ min: 0, max: 100, step: 1, onChange });
      const m0: RangeSliderModel = { low: 20, high: 100, activeHandle: 'high', focused: true };
      c.update({ type: 'increment' }, m0);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('does not call onChange when low clamped to high', () => {
      const onChange = vi.fn();
      const c = rangeSlider({ min: 0, max: 100, step: 1, onChange });
      const m0: RangeSliderModel = { low: 80, high: 80, activeHandle: 'low', focused: true };
      c.update({ type: 'increment' }, m0);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('calls onChange on set-min when low is not already at min', () => {
      const onChange = vi.fn();
      const c = rangeSlider({ min: 0, max: 100, onChange });
      const m0: RangeSliderModel = { low: 50, high: 80, activeHandle: 'low', focused: true };
      c.update({ type: 'set-min' }, m0);
      expect(onChange).toHaveBeenCalledWith(0, 80);
    });

    it('does not call onChange on set-min when low is already at min', () => {
      const onChange = vi.fn();
      const c = rangeSlider({ min: 0, max: 100, onChange });
      const m0: RangeSliderModel = { low: 0, high: 80, activeHandle: 'low', focused: true };
      c.update({ type: 'set-min' }, m0);
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  // ── view ──────────────────────────────────────────────────────────────

  describe('view', () => {
    it('renders a row node', () => {
      const c = rangeSlider({ min: 0, max: 100 });
      const [m] = c.init();
      const vnode = c.view(m);
      expect(vnode.kind).toBe('row');
    });

    it('includes track characters ░ and █', () => {
      const c = rangeSlider({ min: 0, max: 100, low: 25, high: 75, width: 20 });
      const [m] = c.init();
      const vnode = c.view(m);
      if (vnode.kind === 'row') {
        const rendered = extractNodeText(vnode);
        expect(rendered).toContain('░');
        expect(rendered).toContain('█');
      }
    });

    it('shows range label with low-high', () => {
      const c = rangeSlider({ min: 0, max: 100, low: 25, high: 75 });
      const [m] = c.init();
      const vnode = c.view(m);
      if (vnode.kind === 'row') {
        const texts = vnode.children.filter((c) => c.kind === 'text').map((c) => (c.kind === 'text' ? c.content : ''));
        expect(texts.some((t) => t.includes('25') && t.includes('75'))).toBe(true);
      }
    });

    it('shows active handle indicator when focused', () => {
      const c = rangeSlider({ min: 0, max: 100, low: 25, high: 75 });
      const m: RangeSliderModel = { low: 25, high: 75, activeHandle: 'low', focused: true };
      const vnode = c.view(m);
      if (vnode.kind === 'row') {
        const texts = vnode.children.filter((c) => c.kind === 'text').map((c) => (c.kind === 'text' ? c.content : ''));
        expect(texts.some((t) => t.includes('◄'))).toBe(true);
      }
    });

    it('shows ► indicator when high handle is active', () => {
      const c = rangeSlider({ min: 0, max: 100, low: 25, high: 75 });
      const m: RangeSliderModel = { low: 25, high: 75, activeHandle: 'high', focused: true };
      const vnode = c.view(m);
      if (vnode.kind === 'row') {
        const texts = vnode.children.filter((c) => c.kind === 'text').map((c) => (c.kind === 'text' ? c.content : ''));
        expect(texts.some((t) => t.includes('►'))).toBe(true);
      }
    });

    it('does not show indicator when unfocused', () => {
      const c = rangeSlider({ min: 0, max: 100, low: 25, high: 75 });
      const m: RangeSliderModel = { low: 25, high: 75, activeHandle: 'low', focused: false };
      const vnode = c.view(m);
      if (vnode.kind === 'row') {
        const texts = vnode.children.filter((c) => c.kind === 'text').map((c) => (c.kind === 'text' ? c.content : ''));
        expect(texts.some((t) => t.includes('◄') || t.includes('►'))).toBe(false);
      }
    });
  });

  // ── subscriptions ─────────────────────────────────────────────────────

  describe('subscriptions', () => {
    it('keeps pointer subscriptions active when not focused', () => {
      const c = rangeSlider({});
      const sub = c.subscriptions!({ low: 0, high: 100, activeHandle: 'low', focused: false });
      expect(sub).toBeDefined();
      if (sub) {
        expect(sub._kind.kind).toBe('batch');
      }
    });

    it('returns batch of key subscriptions when focused', () => {
      const c = rangeSlider({});
      const sub = c.subscriptions!({ low: 0, high: 100, activeHandle: 'low', focused: true });
      expect(sub).toBeDefined();
      if (sub) {
        expect(sub._kind.kind).toBe('batch');
      }
    });
  });

  it('normalizes reversed ranges and malformed numeric options', () => {
    const c = rangeSlider({ min: 100, max: 0, step: 0, width: Number.POSITIVE_INFINITY, low: Number.NaN, high: Number.POSITIVE_INFINITY });
    const [model] = c.init();
    expect(model).toMatchObject({ low: 0, high: 100 });
    expect(() => c.view(model)).not.toThrow();
  });

  it('supports pointer selection and drag lifecycle', () => {
    const c = rangeSlider({ min: 0, max: 100, width: 10 });
    const [initial] = c.init();
    const [pressed] = c.update({ type: 'set-at', index: 8 }, initial);
    expect(pressed.focused).toBe(true);
    expect(pressed.dragging).toBe(true);
    const [dragged] = c.update({ type: 'drag-at', index: 9 }, pressed);
    const [released] = c.update({ type: 'drag-end' }, dragged);
    expect(released.dragging).toBe(false);
  });
});

// ── rangeSliderHitTest ────────────────────────────────────────────────

describe('rangeSliderHitTest', () => {
  const cfg = { min: 0, max: 100, step: 1, width: 20 };

  it('returns null when relX is negative', () => {
    expect(rangeSliderHitTest({ low: 30, high: 70 }, cfg, -1)).toBeNull();
  });

  it('returns null when relX >= width', () => {
    expect(rangeSliderHitTest({ low: 30, high: 70 }, cfg, 20)).toBeNull();
  });

  it('rejects non-finite positions and normalizes invalid config', () => {
    expect(rangeSliderHitTest({ low: 30, high: 70 }, { min: 0, max: 100, step: 0, width: -1 }, Number.NaN)).toBeNull();
    expect(() => rangeSliderHitTest({ low: Number.NaN, high: Number.POSITIVE_INFINITY }, { min: 100, max: 0, step: -2, width: 20 }, 10)).not.toThrow();
  });

  it('returns set-low when click is closer to low handle', () => {
    const msg = rangeSliderHitTest({ low: 20, high: 80 }, cfg, 2);
    expect(msg).not.toBeNull();
    expect(msg!.type).toBe('set-low');
  });

  it('returns set-high when click is closer to high handle', () => {
    const msg = rangeSliderHitTest({ low: 20, high: 80 }, cfg, 18);
    expect(msg).not.toBeNull();
    expect(msg!.type).toBe('set-high');
  });

  it('picks low when equidistant', () => {
    // low=0, high=100, click at midpoint=10 → value=50, both 50 away → picks low
    const msg = rangeSliderHitTest({ low: 0, high: 100 }, cfg, 10);
    expect(msg).not.toBeNull();
    expect(msg!.type).toBe('set-low');
  });

  it('clamps returned value to step', () => {
    const stepCfg = { min: 0, max: 100, step: 10, width: 20 };
    const msg = rangeSliderHitTest({ low: 0, high: 100 }, stepCfg, 3);
    expect(msg).not.toBeNull();
    // relX 3 → ratio 0.15 → value 15 → snapped to 20
    expect((msg as any).value).toBe(20);
  });
});

// ── rangeSliderDragTest ───────────────────────────────────────────────

describe('rangeSliderDragTest', () => {
  const cfg = { min: 0, max: 100, step: 1, width: 20 };

  it('moves low handle when activeHandle is low', () => {
    const msg = rangeSliderDragTest({ low: 30, high: 70, activeHandle: 'low' }, cfg, 4);
    expect(msg.type).toBe('set-low');
  });

  it('moves high handle when activeHandle is high', () => {
    const msg = rangeSliderDragTest({ low: 30, high: 70, activeHandle: 'high' }, cfg, 16);
    expect(msg.type).toBe('set-high');
  });

  it('clamps low drag to [min, high]', () => {
    const msg = rangeSliderDragTest(
      { low: 30, high: 70, activeHandle: 'low' },
      cfg,
      19, // far right → value ~95, but max for low is high=70
    );
    expect((msg as any).value).toBeLessThanOrEqual(70);
  });

  it('clamps high drag to [low, max]', () => {
    const msg = rangeSliderDragTest(
      { low: 30, high: 70, activeHandle: 'high' },
      cfg,
      0, // far left → value ~0, but min for high is low=30
    );
    expect((msg as any).value).toBeGreaterThanOrEqual(30);
  });

  it('clamps relX to [0, width-1]', () => {
    const msg = rangeSliderDragTest({ low: 0, high: 100, activeHandle: 'low' }, cfg, -10);
    // relX clamped to 0 → value = 0
    expect((msg as any).value).toBe(0);
  });
});
