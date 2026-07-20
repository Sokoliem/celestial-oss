import { describe, expect, it, vi } from 'vitest';

function makeColor(r: number, g: number, b: number) {
  return {
    fg: () => `\x1b[38;2;${r};${g};${b}m`,
    bg: () => `\x1b[48;2;${r};${g};${b}m`,
    degrade() {
      return this;
    },
    equals(other: { rgb?: [number, number, number] | null }) {
      return other.rgb?.[0] === r && other.rgb?.[1] === g && other.rgb?.[2] === b;
    },
    rgb: [r, g, b] as [number, number, number],
    oklab: null,
    oklch: null,
    level: 'truecolor' as const,
  };
}

vi.mock('@celestial/corona', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@celestial/corona')>();
  const rgb = (r: number, g: number, b: number) => makeColor(r, g, b);
  return {
    ...actual,
    charWidth: () => 1,
    reduceMotion: () => false,
    color: {
      rgb,
      hsl: (_h: number, _s: number, l: number) => rgb(Math.round(l * 2.55), Math.round(l * 2.55), Math.round(l * 2.55)),
      lerp: (from: { rgb: [number, number, number] }, to: { rgb: [number, number, number] }, ratio: number) =>
        rgb(
          Math.round(from.rgb[0] + (to.rgb[0] - from.rgb[0]) * ratio),
          Math.round(from.rgb[1] + (to.rgb[1] - from.rgb[1]) * ratio),
          Math.round(from.rgb[2] + (to.rgb[2] - from.rgb[2]) * ratio),
        ),
      white: rgb(255, 255, 255),
    },
    gradient: (colors: ReturnType<typeof rgb>[]) => ({
      sample(t: number) {
        return t < 0.5 ? colors[0]! : colors[colors.length - 1]!;
      },
    }),
    // Tokens added in Phase 2 of the design-system review. Mocked here so
    // the test environment doesn't need the real corona built artifact.
    stencilGlyph: { full: '█', wide: '█', basic: '█', none: '#' },
    highlightColor: rgb(255, 255, 255),
    resolveGlyph: (token: { full: string; wide: string; basic: string; none: string }, level: 'full' | 'wide' | 'basic' | 'none') => token[level],
  };
});

const { spotlight } = await import('../spotlight.js');
const { stencil } = await import('../stencil.js');
const { underlineWave } = await import('../underline-wave.js');
const { color } = await import('@celestial/corona');

function stripAnsi(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('Mirage rich effects expansion', () => {
  it('spotlight preserves visible text and changes with tick', () => {
    const still = spotlight('Focus', { center: 2, radius: 2 });
    const pulsed = spotlight('Focus', { center: 2, radius: 2, tick: 8 });

    expect(stripAnsi(still)).toBe('Focus');
    expect(pulsed).not.toBe(still);
  });

  it('underlineWave appends an animated underline line per text line', () => {
    const output = underlineWave('Hi\nBy', { tick: 0, wavelength: 4 });
    const lines = stripAnsi(output).split('\n');

    expect(lines).toEqual(['Hi', expect.any(String), 'By', expect.any(String)]);
    expect(lines[1]).toHaveLength(2);
    expect(lines[3]).toHaveLength(2);
  });

  it('underlineWave changes underline shape across ticks', () => {
    const first = underlineWave('Wave', { tick: 0, wavelength: 4, speed: 1 });
    const second = underlineWave('Wave', { tick: 10, wavelength: 4, speed: 1 });

    expect(first).not.toBe(second);
  });

  it('stencil cuts text out of a filled bounding box', () => {
    const output = stencil('AB A', {
      fill: color.rgb(255, 0, 0),
      bgChar: '#',
    });

    expect(stripAnsi(output)).toBe('  # ');
  });

  it('stencil supports gradient fills', () => {
    const solid = stencil('A ', {
      fill: color.rgb(255, 0, 0),
      bgChar: '#',
    });
    const gradientFill = stencil('A ', {
      fill: [color.rgb(255, 0, 0), color.rgb(0, 0, 255)],
      bgChar: '#',
    });

    expect(stripAnsi(gradientFill)).toBe(' #');
    expect(gradientFill).not.toBe(solid);
  });
});
