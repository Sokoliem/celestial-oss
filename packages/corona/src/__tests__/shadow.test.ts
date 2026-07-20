import { describe, expect, it } from 'vitest';
import { color } from '../color.js';
import { renderShadow } from '../shadow.js';
import { stripAnsi } from '../utils.js';

describe('renderShadow', () => {
  it('renders a solid right and bottom shadow with default offsets', () => {
    const output = renderShadow('AB\nCD');

    expect(output.split('\n').map(stripAnsi)).toEqual(['AB▒', 'CD▒', ' ▒▒']);
  });

  it('supports a fade style for larger offsets', () => {
    const faded = renderShadow('AB', { offsetX: 3, offsetY: 2, style: 'fade' });
    const solid = renderShadow('AB', { offsetX: 3, offsetY: 2, style: 'solid' });

    expect(stripAnsi(faded)).toContain('▓');
    expect(stripAnsi(faded)).toContain('░');
    expect(faded).not.toBe(solid);
  });

  it('returns the original content when both offsets are zero', () => {
    expect(renderShadow('AB', { offsetX: 0, offsetY: 0 })).toBe('AB');
  });

  it('accepts a custom shadow color while preserving visible content', () => {
    const output = renderShadow('AB', {
      color: color.rgb(80, 90, 100),
    });

    expect(stripAnsi(output)).toBe('AB▒\n ▒▒');
    expect(output).toContain('\x1b[');
  });
});
