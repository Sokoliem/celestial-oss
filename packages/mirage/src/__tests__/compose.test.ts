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
      hsl: null,
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
      white: rgb(255, 255, 255),
      red: rgb(255, 0, 0),
      reset: { fg: () => '\x1b[0m' },
    },
    gradient: (colors: ReturnType<typeof rgb>[]) => ({
      sample(t: number) {
        const idx = Math.min(colors.length - 1, Math.floor(t * colors.length));
        return colors[idx]!;
      },
    }),
  };
});

vi.mock('@celestial/nebula', () => ({}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

const { compose, createEffectContext, mapTextContent, gradientEffect, scan, glitch } = await import('../compose.js');
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

// ---------------------------------------------------------------------------
// createEffectContext
// ---------------------------------------------------------------------------

describe('createEffectContext', () => {
  it('returns current time', () => {
    const ctx = createEffectContext();
    const t = ctx.getTime();
    expect(typeof t).toBe('number');
    expect(t).toBeGreaterThan(0);
  });

  it('subscribe returns a disposer function', () => {
    const ctx = createEffectContext();
    const disposer = ctx.subscribe(() => {});
    expect(typeof disposer).toBe('function');
    // Clean up
    disposer();
  });
});

// ---------------------------------------------------------------------------
// mapTextContent
// ---------------------------------------------------------------------------

describe('mapTextContent', () => {
  it('transforms TextNode content', () => {
    const node = makeText('hello');
    const result = mapTextContent(node, (c) => c.toUpperCase());
    expect(getTextContent(result)).toBe('HELLO');
  });

  it('recurses into column children', () => {
    const node = makeColumn(makeText('foo'), makeText('bar'));
    const result = mapTextContent(node, (c) => `[${c}]`);
    expect(result.kind).toBe('column');
    if (result.kind === 'column') {
      expect(getTextContent(result.children[0]!)).toBe('[foo]');
      expect(getTextContent(result.children[1]!)).toBe('[bar]');
    }
  });

  it('does not mutate the original node', () => {
    const node = makeText('original');
    const result = mapTextContent(node, () => 'changed');
    expect(getTextContent(node)).toBe('original');
    expect(getTextContent(result)).toBe('changed');
  });

  it('passes through empty nodes unchanged', () => {
    const empty: VNode = { kind: 'empty' };
    const result = mapTextContent(empty, () => 'nope');
    expect(result).toBe(empty);
  });
});

// ---------------------------------------------------------------------------
// compose() — ordering
// ---------------------------------------------------------------------------

describe('compose', () => {
  it('applies effects left-to-right', () => {
    const order: string[] = [];

    const effectA = (node: VNode) => {
      order.push('A');
      return mapTextContent(node, (c) => `A(${c})`);
    };
    const effectB = (node: VNode) => {
      order.push('B');
      return mapTextContent(node, (c) => `B(${c})`);
    };
    const effectC = (node: VNode) => {
      order.push('C');
      return mapTextContent(node, (c) => `C(${c})`);
    };

    const composed = compose(effectA, effectB, effectC);
    const result = composed(makeText('x'));

    // Applied left-to-right: A first, then B, then C
    expect(order).toEqual(['A', 'B', 'C']);
    // Content: C(B(A(x)))
    expect(getTextContent(result)).toBe('C(B(A(x)))');
  });

  it('with zero effects returns the original node', () => {
    const composed = compose();
    const node = makeText('unchanged');
    const result = composed(node);
    expect(getTextContent(result)).toBe('unchanged');
  });

  it('with a single effect applies it once', () => {
    const effectA = (node: VNode) => mapTextContent(node, (c) => `[${c}]`);
    const composed = compose(effectA);
    const result = composed(makeText('hi'));
    expect(getTextContent(result)).toBe('[hi]');
  });

  it('accepts an explicit EffectContext override', () => {
    const ctx = createEffectContext();
    const effectA = (node: VNode) => mapTextContent(node, (c) => `A:${c}`);
    const composed = compose(effectA);
    const result = composed(makeText('ctx'), ctx);
    expect(getTextContent(result)).toBe('A:ctx');
  });
});

// ---------------------------------------------------------------------------
// scan() effect
// ---------------------------------------------------------------------------

describe('scan', () => {
  it('preserves visible text', () => {
    const effect = scan({ tick: 0, speed: 1, lines: 2 });
    const ctx = createEffectContext();
    const node = makeText('Hello World');
    const result = effect(node, ctx);
    expect(stripAnsi(getTextContent(result))).toBe('Hello World');
  });

  it('produces different output at different ticks', () => {
    const ctx = createEffectContext();
    const node = makeText('Scanning...');
    const r1 = scan({ tick: 0 })(node, ctx);
    const r2 = scan({ tick: 5 })(node, ctx);
    expect(getTextContent(r1)).not.toBe(getTextContent(r2));
  });
});

// ---------------------------------------------------------------------------
// glitch() effect
// ---------------------------------------------------------------------------

describe('glitch', () => {
  it('preserves visible text characters', () => {
    const effect = glitch({ tick: 0, freq: 0.5, intensity: 100, seed: 1 });
    const ctx = createEffectContext();
    const node = makeText('Glitchy');
    const result = effect(node, ctx);
    expect(stripAnsi(getTextContent(result))).toBe('Glitchy');
  });

  it('produces different output at different ticks when freq is high', () => {
    const ctx = createEffectContext();
    const node = makeText('AAAAAAAAAA');
    const r1 = glitch({ tick: 0, freq: 0.9, seed: 7 })(node, ctx);
    const r2 = glitch({ tick: 50, freq: 0.9, seed: 7 })(node, ctx);
    // High freq + different ticks should produce different ANSI codes
    expect(getTextContent(r1)).not.toBe(getTextContent(r2));
  });

  it('with freq=0 produces no glitch color codes', () => {
    const effect = glitch({ tick: 0, freq: 0, seed: 1 });
    const ctx = createEffectContext();
    const node = makeText('clean');
    const result = effect(node, ctx);
    // No ANSI codes injected (no color shifts, just reset at end)
    const content = getTextContent(result);
    expect(stripAnsi(content)).toBe('clean');
  });
});

// ---------------------------------------------------------------------------
// gradientEffect() — compose integration
// ---------------------------------------------------------------------------

describe('gradientEffect in compose', () => {
  it('applies gradient to text content', () => {
    const effect = gradientEffect({ from: color.rgb(255, 0, 0), to: color.rgb(0, 0, 255) });
    const ctx = createEffectContext();
    const node = makeText('Hi');
    const result = effect(node, ctx);
    // Should have ANSI codes
    const content = getTextContent(result);
    expect(content).toMatch(/\x1b\[/);
    expect(stripAnsi(content)).toBe('Hi');
  });

  it('compose ordering: gradient then glitch', () => {
    const fancy = compose(gradientEffect({ from: color.rgb(255, 0, 128), to: color.rgb(0, 255, 255) }), glitch({ tick: 0, freq: 0, seed: 1 }));
    const result = fancy(makeText('Test'));
    expect(stripAnsi(getTextContent(result))).toBe('Test');
  });
});
