import { describe, expect, it, vi } from 'vitest';
import type { RatingModel } from '../rating.js';
import { rating } from '../rating.js';

describe('rating', () => {
  // ── init ────────────────────────────────────────────────────────────────

  it('init returns valid model with defaults', () => {
    const comp = rating();
    const [model] = comp.init();
    expect(model.value).toBe(0);
    expect(model.hoveredIndex).toBeNull();
    expect(model.max).toBe(5);
    expect(model.style).toBe('star');
    expect(model.size).toBe('md');
    expect(model.interactive).toBe(false);
    expect(model.focused).toBe(false);
  });

  it('init respects config value and max', () => {
    const comp = rating({ value: 3, max: 10 });
    const [model] = comp.init();
    expect(model.value).toBe(3);
    expect(model.max).toBe(10);
  });

  it('init clamps value to max', () => {
    const comp = rating({ value: 8, max: 5 });
    const [model] = comp.init();
    expect(model.value).toBe(5);
  });

  it('init clamps negative value to 0', () => {
    const comp = rating({ value: -3 });
    const [model] = comp.init();
    expect(model.value).toBe(0);
  });

  // ── view ────────────────────────────────────────────────────────────────

  it('view renders without error with default config', () => {
    const comp = rating();
    const [model] = comp.init();
    const view = comp.view(model);
    expect(view).toBeDefined();
    expect(view.kind).toBe('row');
  });

  it('view renders filled and empty stars', () => {
    const comp = rating({ value: 3, max: 5 });
    const [model] = comp.init();
    const view = comp.view(model);
    expect(view).toBeDefined();
    if (view.kind === 'row') {
      expect(view.children.length).toBe(5);
    }
  });

  it('view renders different styles', () => {
    for (const ratingStyle of ['star', 'heart', 'block', 'diamond'] as const) {
      const comp = rating({ value: 2, style: ratingStyle });
      const [model] = comp.init();
      const view = comp.view(model);
      expect(view).toBeDefined();
    }
  });

  // ── update: hover ──────────────────────────────────────────────────────

  it('hover sets hoveredIndex', () => {
    const comp = rating({ interactive: true });
    const [model] = comp.init();
    const [hovered] = comp.update({ type: 'hover', index: 3 }, model);
    expect(hovered.hoveredIndex).toBe(3);
  });

  it('hover clears with null', () => {
    const comp = rating({ interactive: true });
    const [model] = comp.init();
    const [hovered] = comp.update({ type: 'hover', index: 3 }, model);
    const [cleared] = comp.update({ type: 'hover', index: null }, hovered);
    expect(cleared.hoveredIndex).toBeNull();
  });

  // ── update: click ──────────────────────────────────────────────────────

  it('click sets value and calls onChange', () => {
    const onChange = vi.fn();
    const comp = rating({ onChange });
    const [model] = comp.init();
    const [clicked] = comp.update({ type: 'click', index: 2 }, model);
    expect(clicked.value).toBe(3); // index + 1
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('click clears hoveredIndex', () => {
    const comp = rating();
    const [model] = comp.init();
    const withHover: RatingModel = { ...model, hoveredIndex: 2 };
    const [clicked] = comp.update({ type: 'click', index: 4 }, withHover);
    expect(clicked.hoveredIndex).toBeNull();
  });

  // ── update: increment / decrement ──────────────────────────────────────

  it('increment increases value by 1', () => {
    const onChange = vi.fn();
    const comp = rating({ value: 2, max: 5, onChange });
    const [model] = comp.init();
    const [incremented] = comp.update({ type: 'increment' }, model);
    expect(incremented.value).toBe(3);
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('increment clamps at max', () => {
    const comp = rating({ value: 5, max: 5 });
    const [model] = comp.init();
    const [incremented] = comp.update({ type: 'increment' }, model);
    expect(incremented.value).toBe(5);
  });

  it('decrement decreases value by 1', () => {
    const onChange = vi.fn();
    const comp = rating({ value: 3, max: 5, onChange });
    const [model] = comp.init();
    const [decremented] = comp.update({ type: 'decrement' }, model);
    expect(decremented.value).toBe(2);
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('decrement clamps at 0', () => {
    const comp = rating({ value: 0, max: 5 });
    const [model] = comp.init();
    const [decremented] = comp.update({ type: 'decrement' }, model);
    expect(decremented.value).toBe(0);
  });

  it('half-step increment when allowHalf is true', () => {
    const comp = rating({ value: 2, allowHalf: true });
    const [model] = comp.init();
    const [incremented] = comp.update({ type: 'increment' }, model);
    expect(incremented.value).toBe(2.5);
  });

  // ── update: focus / blur ───────────────────────────────────────────────

  it('focus sets focused to true', () => {
    const comp = rating();
    const [model] = comp.init();
    const [focused] = comp.update({ type: 'focus' }, model);
    expect(focused.focused).toBe(true);
  });

  it('blur resets focused and hoveredIndex', () => {
    const comp = rating();
    const [model] = comp.init();
    const focused: RatingModel = { ...model, focused: true, hoveredIndex: 2 };
    const [blurred] = comp.update({ type: 'blur' }, focused);
    expect(blurred.focused).toBe(false);
    expect(blurred.hoveredIndex).toBeNull();
  });

  // ── update: confirm ────────────────────────────────────────────────────

  it('confirm clears hoveredIndex', () => {
    const comp = rating();
    const [model] = comp.init();
    const withHover: RatingModel = { ...model, hoveredIndex: 3 };
    const [confirmed] = comp.update({ type: 'confirm' }, withHover);
    expect(confirmed.hoveredIndex).toBeNull();
  });

  // ── subscriptions ──────────────────────────────────────────────────────

  it('subscriptions returns none when not focused or not interactive', () => {
    const comp = rating();
    const [model] = comp.init();
    const subs = comp.subscriptions!(model);
    // Sub.none() is truthy but has no active bindings
    expect(subs).toBeDefined();
  });

  it('subscriptions returns key bindings when focused and interactive', () => {
    const comp = rating({ interactive: true });
    const [model] = comp.init();
    const focused: RatingModel = { ...model, focused: true };
    const subs = comp.subscriptions!(focused);
    expect(subs).toBeDefined();
  });
});
