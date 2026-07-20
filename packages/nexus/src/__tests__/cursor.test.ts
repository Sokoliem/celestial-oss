import { describe, expect, it } from 'vitest';
import { cursorHide, cursorShow, setCursorShape } from '../cursor.js';

describe('setCursorShape', () => {
  it('returns blinking bar for bar+blinking (AC-7.1)', () => {
    expect(setCursorShape('bar', true)).toBe('\x1b[5 q');
  });

  it('returns steady bar', () => {
    expect(setCursorShape('bar', false)).toBe('\x1b[6 q');
  });

  it('returns blinking block by default', () => {
    expect(setCursorShape('block')).toBe('\x1b[1 q');
  });

  it('returns steady block', () => {
    expect(setCursorShape('block', false)).toBe('\x1b[2 q');
  });

  it('returns blinking underline', () => {
    expect(setCursorShape('underline', true)).toBe('\x1b[3 q');
  });

  it('returns steady underline', () => {
    expect(setCursorShape('underline', false)).toBe('\x1b[4 q');
  });
});

describe('cursorShow / cursorHide', () => {
  it('show emits ?25h', () => {
    expect(cursorShow).toBe('\x1b[?25h');
  });

  it('hide emits ?25l', () => {
    expect(cursorHide).toBe('\x1b[?25l');
  });
});
