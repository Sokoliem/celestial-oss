import { describe, expect, it } from 'vitest';
import {
  alternate,
  beside,
  bold,
  colorize,
  concat,
  dim,
  fillEmpty,
  gradient,
  mapFrames,
  mirror,
  pad,
  prefix,
  rainbow,
  reverse,
  sample,
  slide,
  speed,
  stretch,
  suffix,
} from '../../spinner/compose.js';
import { resolve } from '../../spinner/engine.js';
import type { SpinnerDefinition } from '../../spinner/types.js';

const abc: SpinnerDefinition = { name: 'abc', frames: ['a', 'b', 'c'], interval: 100 };
const xy: SpinnerDefinition = { name: 'xy', frames: ['x', 'y'], interval: 80 };

describe('reverse', () => {
  it('reverses frame order', () => {
    const reversed = reverse(abc);
    expect(reversed.frames).toEqual(['c', 'b', 'a']);
    expect(reversed.name).toBe('abc-reversed');
  });

  it('preserves interval', () => {
    expect(reverse(abc).interval).toBe(100);
  });

  it('throws for procedural spinners', () => {
    const proc: SpinnerDefinition = { name: 'p', render: () => 'x' };
    expect(() => reverse(proc)).toThrow('Cannot reverse procedural');
  });
});

describe('mirror', () => {
  it('creates ping-pong frames', () => {
    const mirrored = mirror(abc);
    // a, b, c, b (first + last are not duplicated in the reverse portion)
    expect(mirrored.frames).toEqual(['a', 'b', 'c', 'b']);
  });

  it('handles 2-frame spinner', () => {
    const mirrored = mirror(xy);
    // x, y (no middle frames to reverse)
    expect(mirrored.frames).toEqual(['x', 'y']);
  });
});

describe('concat', () => {
  it('concatenates frames from multiple spinners', () => {
    const joined = concat(abc, xy);
    expect(joined.frames).toEqual(['a', 'b', 'c', 'x', 'y']);
  });

  it('throws for procedural spinners', () => {
    const proc: SpinnerDefinition = { name: 'p', render: () => 'x' };
    expect(() => concat(abc, proc)).toThrow('Cannot concat procedural');
  });
});

describe('alternate', () => {
  it('interleaves frames', () => {
    const alt = alternate(abc, xy);
    // Takes frames round-robin: a, x, b, y, c
    expect(alt.frames).toEqual(['a', 'x', 'b', 'y', 'c']);
  });
});

describe('speed', () => {
  it('changes interval', () => {
    const fast = speed(abc, 30);
    expect(fast.interval).toBe(30);
    expect(fast.frames).toEqual(abc.frames);
  });
});

describe('mapFrames', () => {
  it('transforms each frame', () => {
    const upper = mapFrames(abc, (f) => f.toUpperCase());
    expect(upper.frames).toEqual(['A', 'B', 'C']);
  });

  it('provides index to transform function', () => {
    const indexed = mapFrames(abc, (f, i) => `${i}:${f}`);
    expect(indexed.frames).toEqual(['0:a', '1:b', '2:c']);
  });

  it('works with procedural spinners', () => {
    const proc: SpinnerDefinition = { name: 'p', render: (t) => `f${t}` };
    const mapped = mapFrames(proc, (f) => `[${f}]`);
    expect(mapped.render).toBeDefined();
    const resolved = resolve(mapped);
    expect(resolved.frame(0)).toBe('[f0]');
    expect(resolved.frame(5)).toBe('[f5]');
  });
});

describe('prefix', () => {
  it('adds prefix to each frame', () => {
    const prefixed = prefix(abc, '> ');
    expect(prefixed.frames).toEqual(['> a', '> b', '> c']);
  });
});

describe('suffix', () => {
  it('adds suffix to each frame', () => {
    const suffixed = suffix(abc, '!');
    expect(suffixed.frames).toEqual(['a!', 'b!', 'c!']);
  });
});

describe('pad', () => {
  it('pads frames to fixed width', () => {
    const padded = pad(abc, 3);
    expect(padded.frames).toEqual(['a  ', 'b  ', 'c  ']);
  });

  it('uses custom pad character', () => {
    const padded = pad(abc, 3, '.');
    expect(padded.frames).toEqual(['a..', 'b..', 'c..']);
  });
});

describe('colorize', () => {
  it('wraps frames in ANSI color codes', () => {
    const colored = colorize(abc, 31); // red
    expect(colored.frames![0]).toBe('\x1b[31ma\x1b[39m');
    expect(colored.frames![1]).toBe('\x1b[31mb\x1b[39m');
  });
});

describe('rainbow', () => {
  it('cycles through colors', () => {
    const rainbowed = rainbow(abc);
    // Each frame gets a different color
    expect(rainbowed.frames![0]).toContain('\x1b[31m'); // red
    expect(rainbowed.frames![1]).toContain('\x1b[33m'); // yellow
    expect(rainbowed.frames![2]).toContain('\x1b[32m'); // green
  });
});

describe('bold', () => {
  it('wraps frames in bold codes', () => {
    const bolded = bold(abc);
    expect(bolded.frames![0]).toBe('\x1b[1ma\x1b[22m');
  });
});

describe('dim', () => {
  it('wraps frames in dim codes', () => {
    const dimmed = dim(abc);
    expect(dimmed.frames![0]).toBe('\x1b[2ma\x1b[22m');
  });
});

describe('gradient', () => {
  it('applies RGB gradient across frames', () => {
    const graded = gradient(abc, [255, 0, 0], [0, 0, 255]);
    // First frame should be red-ish
    expect(graded.frames![0]).toContain('\x1b[38;2;255;0;0m');
    // Last frame should be blue-ish
    expect(graded.frames![2]).toContain('\x1b[38;2;0;0;255m');
  });

  it('handles single-frame spinner', () => {
    const single: SpinnerDefinition = { name: 's', frames: ['x'] };
    const graded = gradient(single, [255, 0, 0], [0, 0, 255]);
    expect(graded.frames![0]).toContain('\x1b[38;2;255;0;0m');
  });

  it('works with procedural spinners', () => {
    const proc: SpinnerDefinition = { name: 'p', render: (t) => `${t}` };
    const graded = gradient(proc, [255, 0, 0], [0, 0, 255]);
    expect(graded.render).toBeDefined();
    const resolved = resolve(graded);
    const frame = resolved.frame(0);
    expect(frame).toContain('\x1b[38;2;');
  });
});

describe('beside', () => {
  it('places two spinners side by side', () => {
    const combined = beside(abc, xy);
    // LCM(3, 2) = 6 frames
    expect(combined.frames!.length).toBe(6);
    expect(combined.frames![0]).toBe('a x');
    expect(combined.frames![1]).toBe('b y');
    expect(combined.frames![2]).toBe('c x');
    expect(combined.frames![3]).toBe('a y');
  });

  it('uses custom separator', () => {
    const combined = beside(abc, xy, '|');
    expect(combined.frames![0]).toBe('a|x');
  });

  it('works with procedural spinners', () => {
    const proc: SpinnerDefinition = { name: 'p', render: (t) => `${t}` };
    const combined = beside(abc, proc);
    expect(combined.render).toBeDefined();
    const resolved = resolve(combined);
    expect(resolved.frame(0)).toBe('a 0');
  });
});

describe('stretch', () => {
  it('repeats each frame N times', () => {
    const stretched = stretch(abc, 2);
    expect(stretched.frames).toEqual(['a', 'a', 'b', 'b', 'c', 'c']);
  });

  it('works with procedural spinners', () => {
    const proc: SpinnerDefinition = { name: 'p', render: (t) => `f${t}` };
    const stretched = stretch(proc, 3);
    const resolved = resolve(stretched);
    expect(resolved.frame(0)).toBe('f0');
    expect(resolved.frame(1)).toBe('f0');
    expect(resolved.frame(2)).toBe('f0');
    expect(resolved.frame(3)).toBe('f1');
  });
});

describe('sample', () => {
  it('takes every Nth frame', () => {
    const sixFrames: SpinnerDefinition = { name: 'six', frames: ['a', 'b', 'c', 'd', 'e', 'f'] };
    const sampled = sample(sixFrames, 2);
    expect(sampled.frames).toEqual(['a', 'c', 'e']);
  });
});

describe('slide', () => {
  it('creates sliding window frames', () => {
    const slider = slide('abcd', 2);
    expect(slider.frames).toEqual(['ab', 'bc', 'cd', 'da']);
  });

  it('wraps around the pattern', () => {
    const slider = slide('abc', 3);
    expect(slider.frames).toEqual(['abc', 'bca', 'cab']);
  });
});

describe('fillEmpty', () => {
  it('creates fill-then-empty animation', () => {
    const fe = fillEmpty('█', '░', 3);
    expect(fe.frames).toEqual([
      '░░░',
      '█░░',
      '██░',
      '███', // fill
      '██░',
      '█░░',
      '░░░', // empty
    ]);
  });
});
