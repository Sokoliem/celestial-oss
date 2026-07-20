import { describe, expect, it } from 'vitest';
import { measureTextWidth } from '../grapheme.js';
import { centerCellText, formatDisplayLabel, padCellText, truncateCellText, wrapCellText } from '../terminal-text.js';

describe('terminal text helpers', () => {
  it('truncates without splitting wide graphemes', () => {
    expect(truncateCellText('AB界CD', 5)).toBe('AB界…');
  });

  it('pads based on terminal cell width', () => {
    const padded = padCellText('界', 4);
    expect(measureTextWidth(padded)).toBe(4);
    expect(padded).toBe('界  ');
  });

  it('centers based on terminal cell width', () => {
    const centered = centerCellText('界', 4);
    expect(measureTextWidth(centered)).toBe(4);
    expect(centered).toBe(' 界 ');
  });

  it('wraps long labels to cell width', () => {
    expect(wrapCellText('alpha beta gamma', 10)).toEqual(['alpha beta', 'gamma']);
  });

  it('clips wrapped output to max lines with ellipsis', () => {
    expect(wrapCellText('alpha beta gamma', 8, { maxLines: 1 })).toEqual(['alpha…']);
  });

  it('formats bidi display labels within a width budget', () => {
    const label = formatDisplayLabel('Hello مرحبا World', { width: 10, baseDirection: 'ltr' });
    expect(measureTextWidth(label)).toBeLessThanOrEqual(10);
  });
});
