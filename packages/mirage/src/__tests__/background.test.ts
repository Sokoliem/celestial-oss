import { color } from '@celestial/corona';
import { describe, expect, it } from 'vitest';
import { animatedBgGradient, bgGradient, bgPulse } from '../background.js';

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('bgGradient', () => {
  it('should produce per-char ANSI background codes for a 2-color gradient', () => {
    const result = bgGradient('Hello', { from: color.rgb(255, 0, 0), to: color.rgb(0, 0, 255) });
    const matches = result.match(/\x1b\[48;2;\d+;\d+;\d+m/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(5);
  });

  it('should preserve visible text content', () => {
    const text = 'Hello World';
    const result = bgGradient(text, { from: color.rgb(255, 0, 0), to: color.rgb(0, 0, 255) });
    expect(stripAnsi(result)).toBe(text);
  });

  it('should return empty string for empty input', () => {
    const result = bgGradient('', { from: color.rgb(255, 0, 0), to: color.rgb(0, 0, 255) });
    expect(result).toBe('');
  });

  it('should accept custom foreground color', () => {
    const result = bgGradient('Hi', {
      from: color.rgb(255, 0, 0),
      to: color.rgb(0, 0, 255),
      fg: color.rgb(255, 255, 255),
    });
    expect(result).toMatch(/\x1b\[38;2;/);
    expect(stripAnsi(result)).toBe('Hi');
  });

  it('should work with vertical direction', () => {
    const text = 'Line1\nLine2\nLine3';
    const result = bgGradient(text, {
      from: color.rgb(255, 0, 0),
      to: color.rgb(0, 0, 255),
      direction: 'vertical',
    });
    const lines = result.split('\n');
    expect(lines.length).toBe(3);
    expect(stripAnsi(lines[0]!)).toBe('Line1');
    expect(stripAnsi(lines[1]!)).toBe('Line2');
    expect(stripAnsi(lines[2]!)).toBe('Line3');
  });

  it('should work with diagonal direction', () => {
    const text = 'AB\nCD';
    const result = bgGradient(text, {
      from: color.rgb(255, 0, 0),
      to: color.rgb(0, 0, 255),
      direction: 'diagonal',
    });
    expect(stripAnsi(result)).toBe('AB\nCD');
    const matches = result.match(/\x1b\[48;2;\d+;\d+;\d+m/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(4);
  });
});

describe('bgPulse', () => {
  it('should produce ANSI background codes', () => {
    const result = bgPulse('Hello', {
      from: color.rgb(255, 0, 0),
      to: color.rgb(0, 0, 255),
      tick: 0,
    });
    expect(result).toMatch(/\x1b\[48;2;/);
    expect(stripAnsi(result)).toBe('Hello');
  });

  it('should produce different output at different ticks', () => {
    const result1 = bgPulse('Hello', {
      from: color.rgb(255, 0, 0),
      to: color.rgb(0, 0, 255),
      tick: 0,
    });
    const result2 = bgPulse('Hello', {
      from: color.rgb(255, 0, 0),
      to: color.rgb(0, 0, 255),
      tick: 8,
    });
    expect(result1).not.toBe(result2);
  });

  it('should handle empty string', () => {
    const result = bgPulse('', {
      from: color.rgb(255, 0, 0),
      to: color.rgb(0, 0, 255),
      tick: 0,
    });
    expect(result).toBe('');
  });

  it('should accept custom foreground color', () => {
    const result = bgPulse('Hi', {
      from: color.rgb(255, 0, 0),
      to: color.rgb(0, 0, 255),
      tick: 0,
      fg: color.rgb(255, 255, 255),
    });
    expect(result).toMatch(/\x1b\[38;2;/);
    expect(stripAnsi(result)).toBe('Hi');
  });
});

describe('animatedBgGradient', () => {
  const colors = [color.rgb(255, 0, 0), color.rgb(0, 255, 0), color.rgb(0, 0, 255)];

  it('should produce styled output with background codes', () => {
    const result = animatedBgGradient('Hello World', { colors, tick: 0 });
    expect(result.length).toBeGreaterThan(0);
    expect(result).toMatch(/\x1b\[48;2;/);
    expect(stripAnsi(result)).toBe('Hello World');
  });

  it('should produce different output at different ticks', () => {
    const result1 = animatedBgGradient('Hello World', { colors, tick: 0 });
    const result2 = animatedBgGradient('Hello World', { colors, tick: 50 });
    expect(result1).not.toBe(result2);
  });

  it('should handle empty string', () => {
    const result = animatedBgGradient('', { colors, tick: 0 });
    expect(result).toBe('');
  });

  it('should work with vertical direction', () => {
    const text = 'Line1\nLine2\nLine3';
    const result = animatedBgGradient(text, { colors, tick: 0, direction: 'vertical' });
    expect(result.length).toBeGreaterThan(0);
    const stripped = stripAnsi(result);
    expect(stripped).toBe(text);
  });

  it('should work with diagonal direction', () => {
    const text = 'AB\nCD';
    const result = animatedBgGradient(text, { colors, tick: 5, direction: 'diagonal' });
    expect(result.length).toBeGreaterThan(0);
    const stripped = stripAnsi(result);
    expect(stripped).toBe(text);
  });
});
