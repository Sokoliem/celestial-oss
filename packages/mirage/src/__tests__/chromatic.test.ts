import { color } from '@celestial/corona';
import { describe, expect, it } from 'vitest';
import { chromaticText } from '../chromatic.js';

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('chromaticText', () => {
  it('should produce output with ANSI background codes', () => {
    const result = chromaticText('Hi', { color: color.rgb(255, 255, 255) });
    expect(result).toMatch(/\x1b\[/);
  });

  it('should produce output wider than input due to channel offsets', () => {
    const result = chromaticText('AB', { color: color.rgb(255, 255, 255), offset: 1 });
    const visible = stripAnsi(result);
    expect(visible.length).toBeGreaterThan(2);
  });

  it('should produce different output at different ticks', () => {
    const result1 = chromaticText('Hello', { color: color.rgb(255, 0, 255), tick: 0 });
    const result2 = chromaticText('Hello', { color: color.rgb(255, 0, 255), tick: 10 });
    expect(result1).not.toBe(result2);
  });

  it('should handle empty string', () => {
    const result = chromaticText('', { color: color.rgb(255, 0, 0) });
    expect(result).toBe('');
  });

  it('should handle color without rgb (null rgb)', () => {
    const result = chromaticText('Hi', { color: color.reset });
    expect(result).toBe('Hi');
  });

  it('should produce background color codes for non-zero channels', () => {
    const result = chromaticText('ABC', { color: color.rgb(255, 100, 50), offset: 1 });
    expect(result).toMatch(/\x1b\[48;2;\d+;\d+;\d+m/);
  });

  it('should contain the original characters in the output', () => {
    const result = chromaticText('AB', { color: color.rgb(255, 255, 255) });
    const visible = stripAnsi(result);
    expect(visible).toContain('A');
    expect(visible).toContain('B');
  });
});
