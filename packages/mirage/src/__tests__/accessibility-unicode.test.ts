import { color } from '@celestial/corona';
import { describe, expect, it } from 'vitest';
import { shimmer } from '../effects.js';
import { gradient } from '../gradient.js';
import { underlineWave } from '../underline-wave.js';

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('Unicode-safe visual effects', () => {
  const source = 'A👨‍👩‍👧‍👦e\u0301';

  it('styles whole grapheme clusters without changing text', () => {
    const result = shimmer(source, { tick: 3, color: color.rgb(255, 255, 255), reduceMotion: false });
    expect(stripAnsi(result)).toBe(source);
    expect(result.match(/\x1b\[38;/g)).toHaveLength(3);
  });

  it('keeps grapheme clusters intact through gradients', () => {
    const result = gradient(source, { from: color.rgb(255, 0, 0), to: color.rgb(0, 0, 255) });
    expect(stripAnsi(result)).toBe(source);
    expect(result.match(/\x1b\[38;/g)).toHaveLength(3);
  });

  it('draws underlines using terminal-cell width', () => {
    const [, underline] = stripAnsi(underlineWave('界a', { tick: 2, reduceMotion: true })).split('\n');
    expect(underline).toHaveLength(3);
  });
});

describe('reduced motion', () => {
  it('freezes time-based effects at a stable frame', () => {
    const options = { color: color.rgb(255, 255, 255), reduceMotion: true } as const;
    expect(shimmer('stable', { ...options, tick: 1 })).toBe(shimmer('stable', { ...options, tick: 999 }));
  });
});
