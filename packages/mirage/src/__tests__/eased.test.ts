import { easing } from '@celestial/aurora';
import { color } from '@celestial/corona';
import { describe, expect, it } from 'vitest';
import { animatedGradient, easedBreathe, easedColorCycle, easedShimmer } from '../eased.js';

/** Strip ANSI escape codes to get visible text */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('easedShimmer', () => {
  it('should produce a non-empty styled string', () => {
    const result = easedShimmer('Hello', { tick: 0 });
    expect(result.length).toBeGreaterThan(0);
    expect(result).toMatch(/\x1b\[/);
    expect(stripAnsi(result)).toBe('Hello');
  });

  it('should produce different output at different ticks', () => {
    const result1 = easedShimmer('Hello World', { tick: 0 });
    const result2 = easedShimmer('Hello World', { tick: 15 });
    expect(result1).not.toBe(result2);
  });

  it('should handle empty string', () => {
    const result = easedShimmer('', { tick: 0 });
    expect(result).toBe('');
  });

  it('should accept a custom easing function', () => {
    const result = easedShimmer('Test', { tick: 10, easing: easing.bounce });
    expect(stripAnsi(result)).toBe('Test');
  });
});

describe('easedBreathe', () => {
  const from = color.rgb(255, 0, 0);
  const to = color.rgb(0, 0, 255);

  it('should produce a styled string', () => {
    const result = easedBreathe('Hello', { from, to, tick: 0 });
    expect(result.length).toBeGreaterThan(0);
    expect(result).toMatch(/\x1b\[/);
    expect(stripAnsi(result)).toBe('Hello');
  });

  it('should produce different colors at tick 0 vs tick=cycleTicks/2', () => {
    const result1 = easedBreathe('Hello', { from, to, tick: 0 });
    const result2 = easedBreathe('Hello', { from, to, tick: 60 });
    expect(result1).not.toBe(result2);
  });

  it('should handle empty string', () => {
    const result = easedBreathe('', { from, to, tick: 0 });
    expect(result).toBe('');
  });

  it('should accept a custom easing function', () => {
    const result = easedBreathe('Test', { from, to, tick: 10, easing: easing.elastic });
    expect(stripAnsi(result)).toBe('Test');
  });
});

describe('easedColorCycle', () => {
  it('should produce styled string with ANSI codes', () => {
    const result = easedColorCycle('Hello', { tick: 0 });
    const matches = result.match(/\x1b\[38;2;\d+;\d+;\d+m/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(5);
  });

  it('should produce different output at different ticks', () => {
    const result1 = easedColorCycle('Hello', { tick: 0 });
    const result2 = easedColorCycle('Hello', { tick: 5 });
    expect(result1).not.toBe(result2);
  });

  it('should handle empty string', () => {
    const result = easedColorCycle('', { tick: 0 });
    expect(result).toBe('');
  });

  it('should accept a custom easing function', () => {
    const result = easedColorCycle('Test', { tick: 5, easing: easing.easeIn });
    expect(stripAnsi(result)).toBe('Test');
  });
});

describe('animatedGradient', () => {
  const colors = [color.rgb(255, 0, 0), color.rgb(0, 255, 0), color.rgb(0, 0, 255)];

  it('should produce styled output', () => {
    const result = animatedGradient('Hello World', { colors, tick: 0 });
    expect(result.length).toBeGreaterThan(0);
    expect(result).toMatch(/\x1b\[/);
    expect(stripAnsi(result)).toBe('Hello World');
  });

  it('should produce different output at different ticks', () => {
    const result1 = animatedGradient('Hello World', { colors, tick: 0 });
    const result2 = animatedGradient('Hello World', { colors, tick: 50 });
    expect(result1).not.toBe(result2);
  });

  it('should handle empty string', () => {
    const result = animatedGradient('', { colors, tick: 0 });
    expect(result).toBe('');
  });

  it('should work with vertical direction', () => {
    const text = 'Line1\nLine2\nLine3';
    const result = animatedGradient(text, { colors, tick: 0, direction: 'vertical' });
    expect(result.length).toBeGreaterThan(0);
    const stripped = stripAnsi(result);
    expect(stripped).toBe(text);
  });

  it('should work with diagonal direction', () => {
    const text = 'AB\nCD';
    const result = animatedGradient(text, { colors, tick: 5, direction: 'diagonal' });
    expect(result.length).toBeGreaterThan(0);
    const stripped = stripAnsi(result);
    expect(stripped).toBe(text);
  });

  it('should default easing functions produce valid output', () => {
    // Verify that each standard easing works with the eased functions
    const shimmerResult = easedShimmer('Test', { tick: 10, easing: easing.linear });
    const breatheResult = easedBreathe('Test', {
      from: color.rgb(255, 0, 0),
      to: color.rgb(0, 0, 255),
      tick: 10,
      easing: easing.easeOut,
    });
    const cycleResult = easedColorCycle('Test', { tick: 10, easing: easing.easeInOut });

    expect(stripAnsi(shimmerResult)).toBe('Test');
    expect(stripAnsi(breatheResult)).toBe('Test');
    expect(stripAnsi(cycleResult)).toBe('Test');
  });
});
