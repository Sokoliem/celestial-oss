// @ts-nocheck
import { style } from '@celestial/corona';
import { describe, expect, it } from 'vitest';
import { spinnerEl } from '../../elements.js';

// ─── spinnerEl() ───────────────────────────────────────────────────────────

describe('spinnerEl() builder', () => {
  it('should create a TextNode from a spinner frame', () => {
    const frame = { text: '⠋ Loading...' };
    const node = spinnerEl(frame);
    expect(node.kind).toBe('text');
    expect(node.content).toBe('⠋ Loading...');
  });

  it('should accept an optional style', () => {
    const s = style({ bold: true });
    const node = spinnerEl({ text: '⠙' }, s);
    expect(node.style?.bold).toBe(true);
  });
});
