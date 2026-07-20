import type { VNode } from '@celestial/nebula';
import { describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@celestial/corona', () => {
  function rgb(r: number, g: number, b: number) {
    return {
      fg: () => `\x1b[38;2;${r};${g};${b}m`,
      bg: () => `\x1b[48;2;${r};${g};${b}m`,
      rgb: [r, g, b] as [number, number, number],
      oklab: null,
      oklch: null,
      level: 'truecolor' as const,
      degrade() {
        return this;
      },
      equals(other: { rgb?: [number, number, number] | null }) {
        return other.rgb?.[0] === r && other.rgb?.[1] === g && other.rgb?.[2] === b;
      },
    };
  }

  return {
    charWidth: () => 1,
    reduceMotion: () => false,
    color: {
      rgb,
      hsl: (_h: number, _s: number, l: number) => rgb(Math.round((l / 100) * 255), Math.round((l / 100) * 255), Math.round((l / 100) * 255)),
      lerp: (from: { rgb: [number, number, number] }, to: { rgb: [number, number, number] }, ratio: number) =>
        rgb(
          Math.round(from.rgb[0] + (to.rgb[0] - from.rgb[0]) * ratio),
          Math.round(from.rgb[1] + (to.rgb[1] - from.rgb[1]) * ratio),
          Math.round(from.rgb[2] + (to.rgb[2] - from.rgb[2]) * ratio),
        ),
    },
    gradient: (colors: ReturnType<typeof rgb>[]) => ({
      sample(t: number) {
        const idx = Math.min(colors.length - 1, Math.floor(t * colors.length));
        return colors[idx]!;
      },
    }),
  };
});

vi.mock('@celestial/aurora', () => {
  return {
    easing: {
      linear: (t: number) => t,
      easeInOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
      easeIn: (t: number) => t * t * t,
      easeOut: (t: number) => 1 - (1 - t) ** 3,
      easeInOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
      bounce: (t: number) => t,
      elastic: (t: number) => t,
      easeInOutBack: (t: number) => t,
      easeInOutExpo: (t: number) => t,
      easeInOutCirc: (t: number) => t,
    },
  };
});

vi.mock('@celestial/nebula', () => ({}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

const { perGlyph, ease, cellProgress } = await import('../per-glyph.js');
const { color } = await import('@celestial/corona');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeText(content: string): VNode {
  return { kind: 'text', content } as VNode;
}

function makeColumn(...children: VNode[]): VNode {
  return { kind: 'column', children } as VNode;
}

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function getTextContent(node: VNode): string {
  if (node.kind === 'text') return node.content;
  return '';
}

const FROM = color.rgb(68, 68, 68);
const TO = color.rgb(255, 255, 255);

// ---------------------------------------------------------------------------
// cellProgress — stagger math
// ---------------------------------------------------------------------------

describe('cellProgress', () => {
  it('returns 0 when nowMs is before the cell start', () => {
    // cell 3, stagger 30ms => starts at 90ms
    const progress = cellProgress(3, 0, 30, 800, (t) => t);
    expect(progress).toBe(0);
  });

  it('returns 1 when animation is complete', () => {
    // cell 0, stagger 30ms => starts at 0ms, duration 800ms
    // nowMs = 1000ms => rawProgress = 1000/800 = 1.25 => clamped to 1
    const progress = cellProgress(0, 1000, 30, 800, (t) => t);
    expect(progress).toBe(1);
  });

  it('returns partial progress mid-animation', () => {
    // cell 0, starts at 0ms, duration 800ms
    // nowMs = 400ms => rawProgress = 0.5
    const progress = cellProgress(0, 400, 30, 800, (t) => t);
    expect(progress).toBeCloseTo(0.5, 5);
  });

  it('stagger delays each cell correctly', () => {
    // cell 0: starts at 0ms, cell 5: starts at 150ms (stagger=30)
    const p0 = cellProgress(0, 100, 30, 800, (t) => t);
    const p5 = cellProgress(5, 100, 30, 800, (t) => t);

    // cell 0 is further along than cell 5
    expect(p0).toBeGreaterThan(p5);
  });

  it('earlier cells have more progress than later cells at the same time', () => {
    const stagger = 40;
    const duration = 600;
    const nowMs = 200;

    const progresses = [0, 1, 2, 3, 4].map((i) => cellProgress(i, nowMs, stagger, duration, (t) => t));

    // Progress should be monotonically non-increasing as index grows
    for (let i = 1; i < progresses.length; i++) {
      expect(progresses[i]!).toBeLessThanOrEqual(progresses[i - 1]!);
    }
  });

  it('applies easing function to the raw progress', () => {
    const alwaysHalf = (_t: number) => 0.5;
    const progress = cellProgress(0, 400, 0, 800, alwaysHalf);
    expect(progress).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// perGlyph()
// ---------------------------------------------------------------------------

describe('perGlyph', () => {
  it('preserves visible text', () => {
    const wave = perGlyph({
      property: 'color',
      from: FROM,
      to: TO,
      stagger: 30,
      duration: 800,
      nowMs: 0,
    });
    const node = makeText('Hello');
    const result = wave(node);
    expect(stripAnsi(getTextContent(result))).toBe('Hello');
  });

  it('produces ANSI color codes', () => {
    const wave = perGlyph({
      from: FROM,
      to: TO,
      nowMs: 400,
    });
    const node = makeText('Wave');
    const result = wave(node);
    const content = getTextContent(result);
    expect(content).toMatch(/\x1b\[38;2;/);
  });

  it('earlier cells have different colors than later cells at the same nowMs', () => {
    // At nowMs=400ms: cell 0 starts at 0ms, cell 10 starts at 300ms (stagger=30)
    // Cell 0: rawProgress = 400/800 = 0.5, Cell 10: rawProgress = 100/800 = 0.125
    // So they should get different interpolated colors.
    const wave = perGlyph({
      property: 'color',
      from: color.rgb(0, 0, 0),
      to: color.rgb(200, 200, 200),
      stagger: 30,
      duration: 800,
      nowMs: 400,
      ease: ease.linear,
    });
    const text = 'AAAAAAAAAAA'; // 11 chars
    const node = makeText(text);
    const result = wave(node);
    const content = getTextContent(result);

    // Extract all RGB codes
    const codes = [...content.matchAll(/\x1b\[38;2;(\d+);(\d+);(\d+)m/g)];
    expect(codes.length).toBeGreaterThanOrEqual(2);

    // First char and last char should differ in brightness
    const firstR = Number(codes[0]![1]);
    const lastR = Number(codes[codes.length - 1]![1]);
    // First cell (index 0) should be further along in animation => brighter
    expect(firstR).toBeGreaterThan(lastR);
  });

  it('works with property: intensity', () => {
    const wave = perGlyph({
      property: 'intensity',
      from: FROM,
      to: TO,
      nowMs: 400,
    });
    const node = makeText('Intense');
    const result = wave(node);
    expect(stripAnsi(getTextContent(result))).toBe('Intense');
  });

  it('works with property: offset (falls back to color)', () => {
    const wave = perGlyph({
      property: 'offset',
      from: FROM,
      to: TO,
      nowMs: 400,
    });
    const node = makeText('Offset');
    const result = wave(node);
    expect(stripAnsi(getTextContent(result))).toBe('Offset');
  });

  it('is reusable — calling wave() again resets glyph index', () => {
    const wave = perGlyph({
      from: FROM,
      to: TO,
      stagger: 50,
      duration: 800,
      nowMs: 200,
    });
    const node = makeText('AB');
    const r1 = wave(node);
    const r2 = wave(node);
    // Two calls on the same node should produce the same output
    expect(getTextContent(r1)).toBe(getTextContent(r2));
  });

  it('works on column with multiple text children', () => {
    const wave = perGlyph({
      from: color.rgb(0, 0, 0),
      to: color.rgb(255, 255, 255),
      stagger: 10,
      duration: 400,
      nowMs: 100,
    });
    const node = makeColumn(makeText('AB'), makeText('CD'));
    const result = wave(node);
    expect(result.kind).toBe('column');
    if (result.kind === 'column') {
      expect(stripAnsi(getTextContent(result.children[0]!))).toBe('AB');
      expect(stripAnsi(getTextContent(result.children[1]!))).toBe('CD');
    }
  });

  it('at nowMs=0 all cells are at start (progress=0) with linear easing', () => {
    const wave = perGlyph({
      property: 'color',
      from: color.rgb(0, 0, 0),
      to: color.rgb(200, 200, 200),
      stagger: 30,
      duration: 800,
      nowMs: 0,
      ease: ease.linear,
    });
    const node = makeText('XYZ');
    const result = wave(node);
    const content = getTextContent(result);

    // All cells at 0% => all should have from color (rgb(0,0,0))
    const codes = [...content.matchAll(/\x1b\[38;2;(\d+);(\d+);(\d+)m/g)];
    for (const code of codes) {
      expect(Number(code[1])).toBe(0);
      expect(Number(code[2])).toBe(0);
      expect(Number(code[3])).toBe(0);
    }
  });

  it('at very large nowMs all cells are complete (progress=1) with linear easing', () => {
    const wave = perGlyph({
      property: 'color',
      from: color.rgb(0, 0, 0),
      to: color.rgb(200, 200, 200),
      stagger: 30,
      duration: 800,
      nowMs: 100_000, // way past any cell's completion
      ease: ease.linear,
    });
    const node = makeText('XYZ');
    const result = wave(node);
    const content = getTextContent(result);

    // All cells at 100% => all should have to color (rgb(200,200,200))
    const codes = [...content.matchAll(/\x1b\[38;2;(\d+);(\d+);(\d+)m/g)];
    for (const code of codes) {
      expect(Number(code[1])).toBe(200);
    }
  });
});

// ---------------------------------------------------------------------------
// ease re-exports
// ---------------------------------------------------------------------------

describe('ease', () => {
  it('exposes linear easing', () => {
    expect(ease.linear(0)).toBe(0);
    expect(ease.linear(1)).toBe(1);
    expect(ease.linear(0.5)).toBe(0.5);
  });

  it('exposes sine easing that is not linear', () => {
    // easeInOutSine at 0.5 should be 0.5 (symmetric), but elsewhere differs from linear
    // Use toBeCloseTo to avoid -0 vs +0 distinction in JS
    expect(ease.sine(0)).toBeCloseTo(0, 10);
    expect(ease.sine(1)).toBeCloseTo(1, 10);
    // At t=0.25, sine easing should differ from linear
    const sineAtQuarter = ease.sine(0.25);
    expect(sineAtQuarter).not.toBeCloseTo(0.25, 5); // not linear
  });
});
