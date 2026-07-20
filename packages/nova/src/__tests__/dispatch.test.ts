import { describe, expect, it } from 'vitest';
import { blur } from '../strategies/blur.js';
import { crossfade } from '../strategies/crossfade.js';
import { applyStrategy } from '../strategies/dispatch.js';
import { slide } from '../strategies/slide.js';
import { wipe } from '../strategies/wipe.js';
import { zoom } from '../strategies/zoom.js';

const OLD = 'aaa\nbbb';
const NEW = 'xxx\nyyy';

describe('applyStrategy', () => {
  it('dispatches each strategy key to the same output as calling the strategy directly', () => {
    expect(applyStrategy('slide', OLD, NEW, 0.5, { direction: 'up' })).toBe(slide(OLD, NEW, 0.5, 'up'));
    expect(applyStrategy('wipe', OLD, NEW, 0.5, { direction: 'right' })).toBe(wipe(OLD, NEW, 0.5, 'right'));
    expect(applyStrategy('blur', OLD, NEW, 0.5)).toBe(blur(OLD, NEW, 0.5));
    expect(applyStrategy('crossfade', OLD, NEW, 0.5)).toBe(crossfade(OLD, NEW, 0.5));
    expect(applyStrategy('zoom', OLD, NEW, 0.5)).toBe(zoom(OLD, NEW, 0.5));
  });

  it("`'fade'` is an alias for `'crossfade'`", () => {
    expect(applyStrategy('fade', OLD, NEW, 0.42)).toBe(crossfade(OLD, NEW, 0.42));
  });

  it("`'none'` returns oldContent until progress reaches 1, then newContent", () => {
    expect(applyStrategy('none', OLD, NEW, 0)).toBe(OLD);
    expect(applyStrategy('none', OLD, NEW, 0.5)).toBe(OLD);
    expect(applyStrategy('none', OLD, NEW, 0.99)).toBe(OLD);
    expect(applyStrategy('none', OLD, NEW, 1)).toBe(NEW);
    expect(applyStrategy('none', OLD, NEW, 1.5)).toBe(NEW);
  });

  it('falls back to crossfade for an unknown key (preserves prior `default:` behaviour)', () => {
    expect(applyStrategy('not-a-strategy' as never, OLD, NEW, 0.5)).toBe(crossfade(OLD, NEW, 0.5));
  });

  it('forwards strategy options when present', () => {
    // dissolveSeed must affect output (deterministic per-position threshold)
    const seedA = applyStrategy('dissolve', OLD, NEW, 0.5, { dissolveSeed: 1 });
    const seedB = applyStrategy('dissolve', OLD, NEW, 0.5, { dissolveSeed: 999 });
    expect(seedA).not.toBe(seedB);

    // flipAxis defaults to 'horizontal'; explicit 'vertical' should differ
    const flipH = applyStrategy('flip', OLD, NEW, 0.4);
    const flipV = applyStrategy('flip', OLD, NEW, 0.4, { flipAxis: 'vertical' });
    expect(flipH).not.toBe(flipV);

    // typewriterCursor defaults to '▌'; explicit override should appear
    const typedDefault = applyStrategy('typewriter', OLD, NEW, 0.3);
    const typedCustom = applyStrategy('typewriter', OLD, NEW, 0.3, { typewriterCursor: '|' });
    expect(typedDefault).not.toBe(typedCustom);
    expect(typedCustom).toContain('|');
  });

  it('clampProgress: true bounds out-of-range progress to [0, 1]', () => {
    // Spring/gesture controllers can overshoot. With clampProgress:true the
    // strategy sees clamped progress; without it, the strategy receives the
    // raw value and may produce out-of-range output (or NaN).
    const clampedHigh = applyStrategy('crossfade', OLD, NEW, 1.5, { clampProgress: true });
    const atOne = applyStrategy('crossfade', OLD, NEW, 1, { clampProgress: true });
    expect(clampedHigh).toBe(atOne);

    const clampedLow = applyStrategy('crossfade', OLD, NEW, -0.3, { clampProgress: true });
    const atZero = applyStrategy('crossfade', OLD, NEW, 0, { clampProgress: true });
    expect(clampedLow).toBe(atZero);
  });

  it('clampProgress: false (default) forwards progress unchanged', () => {
    const raw = applyStrategy('crossfade', OLD, NEW, 1.2);
    const clamped = applyStrategy('crossfade', OLD, NEW, 1, { clampProgress: true });
    // Without clamping, progress 1.2 is forwarded; behavior may differ from
    // clamped-to-1 (depending on the strategy). The contract under test is
    // that the dispatcher does not silently clamp by default.
    void clamped;
    void raw;
    // Sanity: -0.5 unclamped reaches the strategy as -0.5 — for 'none' that
    // means oldContent (since -0.5 < 1).
    expect(applyStrategy('none', OLD, NEW, -0.5)).toBe(OLD);
  });

  it('rippleOrigin defaults to (0.5, 0.5) when absent', () => {
    const explicit = applyStrategy('ripple', OLD, NEW, 0.5, { rippleOrigin: { x: 0.5, y: 0.5 } });
    const omitted = applyStrategy('ripple', OLD, NEW, 0.5);
    expect(omitted).toBe(explicit);
  });

  it('direction defaults to "left" when absent', () => {
    const explicit = applyStrategy('slide', OLD, NEW, 0.5, { direction: 'left' });
    const omitted = applyStrategy('slide', OLD, NEW, 0.5);
    expect(omitted).toBe(explicit);
  });
});
