import { describe, expect, it } from 'vitest';
import { bell } from '../bell.js';

describe('bell', () => {
  it('returns BEL by default (AC-11.1)', () => {
    expect(bell()).toBe('\x07');
  });

  it('returns BEL when visual hint is set', () => {
    expect(bell({ visual: true })).toBe('\x07');
  });
});
