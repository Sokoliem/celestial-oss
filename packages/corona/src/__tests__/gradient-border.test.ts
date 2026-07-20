import { describe, expect, it } from 'vitest';
import { border, renderGradientBorder } from '../border.js';
import { color } from '../color.js';
import { gradient } from '../gradient.js';
import { stripAnsi, visualWidth } from '../utils.js';

describe('renderGradientBorder', () => {
  it('renders the expected box structure for the requested outer width and height', () => {
    const output = renderGradientBorder({
      border: border.square,
      width: 6,
      height: 4,
      gradient: gradient([color.red, color.blue]),
    });

    expect(output.split('\n').map(stripAnsi)).toEqual(['┌────┐', '│    │', '│    │', '└────┘']);
  });

  it('applies ANSI color codes to the border perimeter', () => {
    const output = renderGradientBorder({
      border: border.rounded,
      width: 5,
      height: 3,
      gradient: gradient([color.red, color.blue]),
    });

    expect(output).toContain('\x1b[');
  });

  it('supports titled top edges while preserving the requested width', () => {
    const output = renderGradientBorder({
      border: border.rounded,
      width: 14,
      height: 4,
      gradient: gradient([color.red, color.blue]),
      title: 'Panel',
      titleAlign: 'center',
    });

    const lines = output.split('\n').map(stripAnsi);
    expect(lines[0]).toContain('Panel');
    for (const line of lines) {
      expect(visualWidth(line)).toBe(14);
    }
  });

  it('changes color distribution across directions', () => {
    const horizontal = renderGradientBorder({
      border: border.square,
      width: 8,
      height: 4,
      gradient: gradient([color.red, color.blue]),
      direction: 'horizontal',
    });
    const vertical = renderGradientBorder({
      border: border.square,
      width: 8,
      height: 4,
      gradient: gradient([color.red, color.blue]),
      direction: 'vertical',
    });
    const clockwise = renderGradientBorder({
      border: border.square,
      width: 8,
      height: 4,
      gradient: gradient([color.red, color.blue]),
      direction: 'clockwise',
    });

    expect(horizontal).not.toBe(vertical);
    expect(clockwise).not.toBe(horizontal);
    expect(clockwise).not.toBe(vertical);
  });
});
