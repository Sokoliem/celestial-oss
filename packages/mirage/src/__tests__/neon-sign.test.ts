import { color } from '@celestial/corona';
import { describe, expect, it } from 'vitest';
import { neonSign } from '../neon-sign.js';

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('neonSign', () => {
  it('should produce output wider than input due to glow padding', () => {
    const text = 'OPEN';
    const result = neonSign(text, { color: color.rgb(255, 0, 100), tick: 0, intensity: 3 });
    const visible = stripAnsi(result);
    expect(visible.length).toBeGreaterThan(text.length);
  });

  it('should produce ANSI escape codes', () => {
    const result = neonSign('Hi', { color: color.rgb(0, 255, 100), tick: 0 });
    expect(result).toMatch(/\x1b\[/);
  });

  it('should produce different output at different ticks', () => {
    const result1 = neonSign('OPEN', { color: color.rgb(255, 0, 100), tick: 0 });
    const result2 = neonSign('OPEN', { color: color.rgb(255, 0, 100), tick: 10 });
    expect(result1).not.toBe(result2);
  });

  it('should handle empty string', () => {
    const result = neonSign('', { color: color.rgb(255, 0, 0), tick: 0 });
    expect(result).toBe('');
  });

  it('should contain the original text in the output', () => {
    const text = 'OPEN';
    const result = neonSign(text, { color: color.rgb(255, 0, 100), tick: 0 });
    const visible = stripAnsi(result);
    expect(visible).toContain(text);
  });

  it('should produce both foreground and background ANSI codes', () => {
    const result = neonSign('Hi', { color: color.rgb(255, 50, 200), tick: 0 });
    expect(result).toMatch(/\x1b\[38;2;/);
    expect(result).toMatch(/\x1b\[48;2;/);
  });

  it('should handle color without rgb (null rgb)', () => {
    const result = neonSign('Hi', { color: color.reset, tick: 0 });
    expect(result).toBe('Hi');
  });
});
