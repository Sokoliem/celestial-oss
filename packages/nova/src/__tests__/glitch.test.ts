import { describe, expect, it } from 'vitest';
import { glitch } from '../strategies/glitch.js';

const OLD = 'one\ntwo\nthree';
const NEW = 'four\nfive\nsix';

describe('glitch strategy', () => {
  it('returns oldContent unchanged at progress 0', () => {
    expect(glitch(OLD, NEW, 0)).toBe(OLD);
  });

  it('returns newContent unchanged at progress 1', () => {
    expect(glitch(OLD, NEW, 1)).toBe(NEW);
  });

  it('clamps out-of-range progress', () => {
    expect(glitch(OLD, NEW, -0.5)).toBe(OLD);
    expect(glitch(OLD, NEW, 1.5)).toBe(NEW);
  });

  it('produces non-trivial output at mid-progress', () => {
    const mid = glitch(OLD, NEW, 0.5);
    expect(mid).not.toBe(OLD);
    expect(mid).not.toBe(NEW);
    // Same row count as the inputs.
    expect(mid.split('\n').length).toBe(3);
  });

  it('is deterministic for the same seed', () => {
    const a = glitch(OLD, NEW, 0.4, { seed: 7 });
    const b = glitch(OLD, NEW, 0.4, { seed: 7 });
    expect(a).toBe(b);
  });

  it('produces different output for different seeds', () => {
    const a = glitch(OLD, NEW, 0.5, { seed: 1 });
    const b = glitch(OLD, NEW, 0.5, { seed: 999 });
    expect(a).not.toBe(b);
  });

  it('intensity 0 still returns valid (settled-ish) frames', () => {
    // intensity 0 → chaos always 0 → no jitter, no scanlines, no tint;
    // just per-row swap based on seeded threshold + ANSI reset on each line.
    const out = glitch(OLD, NEW, 0.5, { intensity: 0 });
    expect(out).not.toBe(OLD);
    expect(out).not.toBe(NEW);
    // Same row count.
    expect(out.split('\n').length).toBe(3);
  });

  it('emits the ANSI RESET on each rendered row', () => {
    const out = glitch(OLD, NEW, 0.5);
    for (const row of out.split('\n')) {
      expect(row).toContain('\x1b[0m');
    }
  });

  it('handles single-line input', () => {
    expect(glitch('hello', 'world', 0)).toBe('hello');
    expect(glitch('hello', 'world', 1)).toBe('world');
    const mid = glitch('hello', 'world', 0.5);
    expect(mid.split('\n').length).toBe(1);
  });

  it('handles empty content (one row of nothing)', () => {
    expect(glitch('', '', 0)).toBe('');
    expect(glitch('', '', 1)).toBe('');
    // Mid-progress on empty content shouldn't throw — result is one empty row + reset.
    const mid = glitch('', '', 0.5);
    expect(mid).toBeDefined();
  });
});
