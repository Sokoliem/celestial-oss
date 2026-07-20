import { describe, expect, it } from 'vitest';
import { color } from '../color.js';
import { generatePalette, type PaletteMode } from '../palette.js';

/** Helper: extract hue from a Color's oklch, or null */
function hueOf(c: ReturnType<typeof color.rgb>): number | null {
  const lch = c.oklch;
  return lch ? lch[2] : null;
}

/** Normalise a hue difference to [0, 360) */
function hueDiff(a: number, b: number): number {
  const d = (((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

const seed = color.rgb(200, 80, 40); // a warm orange

describe('generatePalette', () => {
  // ── analogous ──────────────────────────────────────────────────────────────

  describe('analogous mode', () => {
    it('produces 3 raw colors', () => {
      const p = generatePalette(seed, 'analogous');
      expect(p.colors).toHaveLength(3);
    });

    it('returns valid ColorScales for primary/secondary/tertiary', () => {
      const p = generatePalette(seed, 'analogous');
      for (const scale of [p.primary, p.secondary, p.tertiary]) {
        const mid = scale.sample(0.5);
        expect(mid.rgb).not.toBeNull();
      }
    });
  });

  // ── complementary ──────────────────────────────────────────────────────────

  describe('complementary mode', () => {
    it('produces 2 raw colors', () => {
      const p = generatePalette(seed, 'complementary');
      expect(p.colors).toHaveLength(2);
    });

    it('hues differ by ~180°', () => {
      const p = generatePalette(seed, 'complementary');
      const h0 = hueOf(p.colors[0]!);
      const h1 = hueOf(p.colors[1]!);
      expect(h0).not.toBeNull();
      expect(h1).not.toBeNull();
      expect(hueDiff(h0!, h1!)).toBeGreaterThan(160);
      expect(hueDiff(h0!, h1!)).toBeLessThanOrEqual(180);
    });
  });

  // ── triadic ────────────────────────────────────────────────────────────────

  describe('triadic mode', () => {
    it('produces 3 raw colors', () => {
      const p = generatePalette(seed, 'triadic');
      expect(p.colors).toHaveLength(3);
    });

    it('hues are ~120° apart', () => {
      const p = generatePalette(seed, 'triadic');
      const hues = p.colors.map((c) => hueOf(c)!);
      expect(hues.every((h) => h != null)).toBe(true);
      expect(hueDiff(hues[0]!, hues[1]!)).toBeCloseTo(120, -1);
      expect(hueDiff(hues[1]!, hues[2]!)).toBeCloseTo(120, -1);
    });
  });

  // ── split-complementary ────────────────────────────────────────────────────

  describe('split-complementary mode', () => {
    it('produces 3 raw colors', () => {
      const p = generatePalette(seed, 'split-complementary');
      expect(p.colors).toHaveLength(3);
    });
  });

  // ── monochromatic ──────────────────────────────────────────────────────────

  describe('monochromatic mode', () => {
    it('produces 3 colors with same hue but different lightness', () => {
      const p = generatePalette(seed, 'monochromatic');
      expect(p.colors).toHaveLength(3);

      const hues = p.colors.map((c) => hueOf(c)!);
      expect(hues.every((h) => h != null)).toBe(true);
      // All hues should be approximately the same (OKLCH hue can drift slightly with lightness)
      expect(hueDiff(hues[0]!, hues[1]!)).toBeLessThan(10);
      expect(hueDiff(hues[0]!, hues[2]!)).toBeLessThan(10);

      // Lightness values should differ
      const ls = p.colors.map((c) => c.oklch![0]);
      const uniqueL = new Set(ls.map((l) => Math.round(l * 100)));
      expect(uniqueL.size).toBeGreaterThan(1);
    });
  });

  // ── ColorScale validity ────────────────────────────────────────────────────

  it('each scale has a valid .sample(0.5) returning a Color with .rgb', () => {
    const modes: PaletteMode[] = ['analogous', 'complementary', 'triadic', 'split-complementary', 'monochromatic'];
    for (const mode of modes) {
      const p = generatePalette(seed, mode);
      for (const scale of [p.primary, p.secondary, p.tertiary]) {
        const sampled = scale.sample(0.5);
        expect(sampled.rgb).not.toBeNull();
      }
    }
  });

  // ── Null-RGB seed (graceful) ───────────────────────────────────────────────

  it('does not crash with color.reset as seed', () => {
    expect(() => generatePalette(color.reset, 'analogous')).not.toThrow();
    expect(() => generatePalette(color.reset, 'monochromatic')).not.toThrow();

    const p = generatePalette(color.reset, 'analogous');
    expect(p.colors.length).toBeGreaterThan(0);
  });

  // ── Frozen colors array ────────────────────────────────────────────────────

  it('colors array is frozen', () => {
    const p = generatePalette(seed, 'triadic');
    expect(Object.isFrozen(p.colors)).toBe(true);
  });
});
