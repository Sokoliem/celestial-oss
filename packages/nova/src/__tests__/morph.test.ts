import { describe, expect, it } from 'vitest';
import { parseStyledChars } from '../fade.js';
import { computeMorphOps, type MorphOp, morph } from '../morph.js';

/** Strip ANSI escape sequences for clean text comparison */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/** Helper to create StyledChar arrays from plain strings */
function chars(str: string) {
  return parseStyledChars(str);
}

describe('computeMorphOps', () => {
  it('"abc" -> "abc" = all keep', () => {
    const ops = computeMorphOps(chars('abc'), chars('abc'));
    expect(ops).toEqual([
      { type: 'keep', oldIdx: 0, newIdx: 0 },
      { type: 'keep', oldIdx: 1, newIdx: 1 },
      { type: 'keep', oldIdx: 2, newIdx: 2 },
    ] satisfies MorphOp[]);
  });

  it('"abc" -> "adc" = keep a, remove b, add d, keep c', () => {
    const ops = computeMorphOps(chars('abc'), chars('adc'));
    expect(ops).toEqual([
      { type: 'keep', oldIdx: 0, newIdx: 0 },
      { type: 'remove', oldIdx: 1 },
      { type: 'add', newIdx: 1 },
      { type: 'keep', oldIdx: 2, newIdx: 2 },
    ] satisfies MorphOp[]);
  });

  it('"" -> "abc" = all add', () => {
    const ops = computeMorphOps([], chars('abc'));
    expect(ops).toEqual([
      { type: 'add', newIdx: 0 },
      { type: 'add', newIdx: 1 },
      { type: 'add', newIdx: 2 },
    ] satisfies MorphOp[]);
  });

  it('"abc" -> "" = all remove', () => {
    const ops = computeMorphOps(chars('abc'), []);
    expect(ops).toEqual([
      { type: 'remove', oldIdx: 0 },
      { type: 'remove', oldIdx: 1 },
      { type: 'remove', oldIdx: 2 },
    ] satisfies MorphOp[]);
  });

  it('works with ANSI-styled input, matching on plain character', () => {
    const styled = parseStyledChars('\x1b[31ma\x1b[32mb\x1b[33mc\x1b[0m');
    const plain = chars('adc');
    const ops = computeMorphOps(styled, plain);
    expect(ops).toEqual([
      { type: 'keep', oldIdx: 0, newIdx: 0 },
      { type: 'remove', oldIdx: 1 },
      { type: 'add', newIdx: 1 },
      { type: 'keep', oldIdx: 2, newIdx: 2 },
    ] satisfies MorphOp[]);
  });
});

describe('morph', () => {
  it('at progress 0 returns old text', () => {
    const result = morph('hello', 'world', { tick: 0, duration: 10 });
    expect(stripAnsi(result)).toBe('hello');
  });

  it('at progress 1 returns new text', () => {
    const result = morph('hello', 'world', { tick: 10, duration: 10 });
    expect(stripAnsi(result)).toBe('world');
  });

  it('identical strings returns unchanged at any progress', () => {
    const text = 'same';
    expect(morph(text, text, { tick: 0, duration: 10 })).toBe(text);
    expect(morph(text, text, { tick: 5, duration: 10 })).toBe(text);
    expect(morph(text, text, { tick: 10, duration: 10 })).toBe(text);
  });

  it('empty -> text shows text appearing', () => {
    // At progress 1, we should see the full new text
    const result = morph('', 'abc', { tick: 10, duration: 10 });
    expect(stripAnsi(result)).toBe('abc');

    // At progress 0, result should be empty (old text)
    const atStart = morph('', 'abc', { tick: 0, duration: 10 });
    expect(stripAnsi(atStart)).toBe('');
  });

  it('text -> empty shows text disappearing', () => {
    // At progress 0, we should see old text
    const atStart = morph('abc', '', { tick: 0, duration: 10 });
    expect(stripAnsi(atStart)).toBe('abc');

    // At progress 1, result should be empty
    const atEnd = morph('abc', '', { tick: 10, duration: 10 });
    expect(stripAnsi(atEnd)).toBe('');
  });

  it('respects easing function', () => {
    // Easing that always returns 0 should keep showing old text
    const alwaysZero = morph('old', 'new', {
      tick: 5,
      duration: 10,
      easing: () => 0,
    });
    expect(stripAnsi(alwaysZero)).toBe('old');

    // Easing that always returns 1 should show new text
    const alwaysOne = morph('old', 'new', {
      tick: 5,
      duration: 10,
      easing: () => 1,
    });
    expect(stripAnsi(alwaysOne)).toBe('new');
  });

  it('respects startTick option', () => {
    // tick=5, startTick=5, duration=10 => progress=0 => old text
    const result = morph('old', 'new', {
      tick: 5,
      duration: 10,
      startTick: 5,
    });
    expect(stripAnsi(result)).toBe('old');

    // tick=15, startTick=5, duration=10 => progress=1 => new text
    const atEnd = morph('old', 'new', {
      tick: 15,
      duration: 10,
      startTick: 5,
    });
    expect(stripAnsi(atEnd)).toBe('new');
  });

  it('mid-transition contains true color codes for fading characters', () => {
    // At progress 0.2, removed chars should be fading with true color
    const result = morph('abc', 'axc', { tick: 2, duration: 10 });
    expect(result).toContain('\x1b[38;2;');
  });

  it('clamps progress below 0 to 0', () => {
    // tick before startTick should still return old text
    const result = morph('old', 'new', {
      tick: 0,
      duration: 10,
      startTick: 5,
    });
    expect(stripAnsi(result)).toBe('old');
  });

  it('clamps progress above 1 to 1', () => {
    // tick way past duration should return new text
    const result = morph('old', 'new', { tick: 100, duration: 10 });
    expect(stripAnsi(result)).toBe('new');
  });

  it('should produce consistent results when called repeatedly with same inputs (memoization)', () => {
    // Performance regression: LCS is recomputed every frame. Verify that
    // repeated calls with the same old/new text produce identical results.
    const results: string[] = [];
    for (let tick = 1; tick <= 5; tick++) {
      results.push(morph('hello world', 'hello there', { tick, duration: 10 }));
    }
    // Each tick should produce a unique frame (different progress)
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).not.toBe(results[i - 1]);
    }
    // Calling again with the same tick should produce identical output
    const repeated = morph('hello world', 'hello there', { tick: 3, duration: 10 });
    expect(repeated).toBe(results[2]);
  });
});

describe('morph color preservation', () => {
  it('preserves true color ANSI codes for kept characters at full opacity', () => {
    // Red "a", transform to red "a" + plain "b"
    const redA = '\x1b[38;2;255;0;0ma\x1b[0m';
    const redAB = '\x1b[38;2;255;0;0ma\x1b[38;2;0;255;0mb\x1b[0m';

    // At progress 0, return old text unchanged
    const atStart = morph(redA, redAB, { tick: 0, duration: 10 });
    expect(atStart).toBe(redA);

    // At progress 1, return new text unchanged
    const atEnd = morph(redA, redAB, { tick: 10, duration: 10 });
    expect(atEnd).toBe(redAB);

    // Mid-transition: the kept "a" should retain its red color, not become gray
    const mid = morph(redA, redAB, { tick: 7, duration: 10 });
    // The kept "a" at full opacity should have the red true color code from new text
    expect(mid).toContain('\x1b[38;2;255;0;0ma');
  });

  it('modulates original color during fade-out of removed chars', () => {
    // Red "a" + blue "b" morphing to red "a" only
    const oldText = '\x1b[38;2;255;0;0ma\x1b[38;2;0;0;255mb\x1b[0m';
    const newText = '\x1b[38;2;255;0;0ma\x1b[0m';

    // At progress 0.2, the "b" should still be visible but with reduced blue (not gray)
    const result = morph(oldText, newText, { tick: 2, duration: 10 });
    // "b" should be fading — its blue channel should be reduced, not converted to grayscale
    // New overlapping timing: removeOpacity = 1 - (0.2 / 0.6) ≈ 0.667
    // Blue channel: round(255 * 0.667) = 170, red/green: 0
    expect(result).toContain('\x1b[38;2;0;0;170mb');
  });

  it('modulates original color during fade-in of added chars', () => {
    // Plain "a" morphing to "a" + green "b"
    const oldText = 'a';
    const newText = 'a\x1b[38;2;0;200;0mb\x1b[0m';

    // At progress 0.7, "b" should be fading in with reduced green (not gray)
    const result = morph(oldText, newText, { tick: 7, duration: 10 });
    // New overlapping timing: addOpacity = (0.7 - 0.4) / (1 - 0.4) = 0.5
    // Green channel: round(200 * 0.5) = 100
    expect(result).toContain('\x1b[38;2;0;100;0mb');
  });

  it('falls back to grayscale for unstyled text', () => {
    // Plain text with no ANSI codes should still work with grayscale
    const result = morph('abc', 'axc', { tick: 2, duration: 10 });
    const stripped = stripAnsi(result);
    // Should contain visible characters
    expect(stripped).toContain('a');
    expect(stripped).toContain('c');
    // Should have ANSI color codes (grayscale fallback)
    expect(result).toContain('\x1b[38;2;');
  });

  it('identical styled strings return unchanged', () => {
    const styled = '\x1b[38;2;255;0;0mhello\x1b[0m';
    expect(morph(styled, styled, { tick: 5, duration: 10 })).toBe(styled);
  });
});

describe('morph spatial interpolation', () => {
  it('kept characters anchor while removed chars shrink away', () => {
    // "abc" → "ac": the "b" should shrink and the "c" should slide left
    // At progress 0, output width = 3 (a,b,c); at progress 1, width = 2 (a,c)
    const atStart = morph('abc', 'ac', { tick: 0, duration: 10 });
    expect(stripAnsi(atStart)).toBe('abc');

    const atEnd = morph('abc', 'ac', { tick: 10, duration: 10 });
    expect(stripAnsi(atEnd)).toBe('ac');

    // Mid-transition: output should be between 2 and 3 chars wide
    const mid = morph('abc', 'ac', { tick: 5, duration: 10 });
    const midPlain = stripAnsi(mid).trimEnd();
    // At progress 0.5, removed 'b' is past REMOVE_END(0.6)? No, 0.5 < 0.6 so still visible
    // Width should be ~2.5, so we should see something between 2 and 3 chars
    expect(midPlain.length).toBeGreaterThanOrEqual(2);
    expect(midPlain.length).toBeLessThanOrEqual(3);
  });

  it('added characters grow in while kept chars slide to accommodate', () => {
    // "ac" → "abc": the "b" should grow in and "c" should slide right
    const atStart = morph('ac', 'abc', { tick: 0, duration: 10 });
    expect(stripAnsi(atStart)).toBe('ac');

    const atEnd = morph('ac', 'abc', { tick: 10, duration: 10 });
    expect(stripAnsi(atEnd)).toBe('abc');
  });

  it('output width interpolates between old length and new length', () => {
    // "hi" (2 chars) → "hello" (5 chars)
    // At progress 0.5, expected width ≈ round(2 + (5-2)*0.5) = round(3.5) = 4
    const mid = morph('hi', 'hello', { tick: 5, duration: 10 });
    const midPlain = stripAnsi(mid).trimEnd();
    // Width should be between 2 and 5 (inclusive)
    expect(midPlain.length).toBeGreaterThanOrEqual(2);
    expect(midPlain.length).toBeLessThanOrEqual(5);
  });

  it('multi-line text morphs each line independently', () => {
    const old = 'hello\nworld';
    const newer = 'hello\nearth';

    // At progress 0, return old
    expect(morph(old, newer, { tick: 0, duration: 10 })).toBe(old);

    // At progress 1, return new
    expect(morph(old, newer, { tick: 10, duration: 10 })).toBe(newer);

    // Mid-transition: first line unchanged (identical), second line morphing
    const mid = morph(old, newer, { tick: 5, duration: 10 });
    const lines = mid.split('\n');
    expect(lines.length).toBe(2);
    // First line should be 'hello' (identical in both)
    expect(lines[0]).toBe('hello');
    // Second line should contain ANSI codes (it's morphing)
    expect(lines[1]).toContain('\x1b[38;2;');
  });

  it('overlapping timing: removed chars still visible while added chars begin appearing', () => {
    // With REMOVE_END=0.6 and ADD_START=0.4, at progress 0.5 BOTH should be visible
    // "axb" → "ayb" : 'x' removed, 'y' added, 'a' and 'b' kept
    const result = morph('axb', 'ayb', { tick: 5, duration: 10 });
    const plain = stripAnsi(result);
    // At progress 0.5: 'x' is still fading out (0.5 < 0.6), 'y' is fading in (0.5 > 0.4)
    // Both should be present in the output
    expect(plain).toContain('a');
    expect(plain).toContain('b');
    // The output should have characters between positions — at least the two anchors
    // plus at least one of the transitioning chars
    expect(plain.trim().length).toBeGreaterThanOrEqual(3);
  });

  it('each frame is unique (spatial positions change every tick)', () => {
    const frames: string[] = [];
    for (let tick = 1; tick <= 9; tick++) {
      frames.push(morph('hello world', 'hello there', { tick, duration: 10 }));
    }
    // Each frame should be different from its neighbors
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i]).not.toBe(frames[i - 1]);
    }
  });
});
