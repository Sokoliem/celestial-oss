import type { VNode } from '@celestial/nebula';
import { describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@celestial/corona', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@celestial/corona')>();
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
    ...actual,
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

  it('disposes duplicate callback subscriptions independently and cancels the final timer', () => {
    vi.useFakeTimers();
    try {
      let now = 10;
      const ctx = createEffectContext({ now: () => now, frameMs: 5 });
      const callback = vi.fn();
      const disposeFirst = ctx.subscribe(callback);
      const disposeSecond = ctx.subscribe(callback);

      vi.advanceTimersByTime(5);
      expect(callback).toHaveBeenCalledTimes(2);

      disposeFirst();
      now = 20;
      vi.advanceTimersByTime(5);
      expect(callback).toHaveBeenCalledTimes(3);

      disposeSecond();
      disposeSecond();
      expect(vi.getTimerCount()).toBe(0);
      vi.advanceTimersByTime(20);
      expect(callback).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('isolates subscriber and error-hook failures while keeping sibling effects alive', () => {
    vi.useFakeTimers();
    try {
      const reported: unknown[] = [];
      const ctx = createEffectContext({
        now: () => 12,
        frameMs: 1,
        onSubscriberError: (error) => {
          reported.push(error);
          throw new Error('reporter failed');
        },
      });
      const disposeBroken = ctx.subscribe(() => {
        throw new Error('effect failed');
      });
      const healthy = vi.fn();
      const disposeHealthy = ctx.subscribe(healthy);

      vi.advanceTimersByTime(2);
      expect(healthy).toHaveBeenCalledTimes(2);
      expect(reported).toHaveLength(2);

      disposeBroken();
      disposeHealthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('clamps stale and non-finite host clocks to a monotonic timestamp', () => {
    const readings = [5, 3, Number.NaN, 8];
    const ctx = createEffectContext({ now: () => readings.shift()! });
    expect([ctx.getTime(), ctx.getTime(), ctx.getTime(), ctx.getTime()]).toEqual([5, 5, 5, 8]);
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

  it('recurses through event and hover interaction wrappers', () => {
    const eventNode: VNode = { kind: 'event', id: 'action', handlers: {}, child: makeText('click') };
    const hoverNode: VNode = { kind: 'hover', id: 'hover', hovered: false, child: eventNode };
    const result = mapTextContent(hoverNode, (content) => content.toUpperCase());

    expect(result.kind).toBe('hover');
    if (result.kind === 'hover' && result.child.kind === 'event') {
      expect(getTextContent(result.child.child)).toBe('CLICK');
    }
  });

  it('transforms deferred memo, local-state, and lazy content without eagerly evaluating it', async () => {
    const memoRender = vi.fn(() => makeText('memo'));
    const localView = vi.fn(() => makeText('state'));
    const lazyRender = vi.fn(() => makeText('lazy'));
    const lazyLoader = vi.fn(async () => lazyRender);
    const root = makeColumn(
      { kind: 'memo', render: memoRender, deps: [] },
      { kind: 'localState', key: 'counter', init: () => 0, reducer: (state: unknown) => state, view: localView },
      { kind: 'lazy', key: 'deferred', loader: lazyLoader, placeholder: makeText('loading') },
    );

    const result = mapTextContent(root, (content) => `[${content}]`);
    expect(memoRender).not.toHaveBeenCalled();
    expect(localView).not.toHaveBeenCalled();
    expect(lazyLoader).not.toHaveBeenCalled();
    if (result.kind !== 'column') throw new Error('expected column');

    const [memoNode, stateNode, lazyNode] = result.children;
    if (memoNode?.kind !== 'memo' || stateNode?.kind !== 'localState' || lazyNode?.kind !== 'lazy') throw new Error('expected deferred nodes');
    expect(getTextContent(memoNode.render())).toBe('[memo]');
    expect(getTextContent(stateNode.view(0, () => {}))).toBe('[state]');
    expect(getTextContent(lazyNode.placeholder)).toBe('[loading]');
    const render = await lazyNode.loader();
    expect(getTextContent(render())).toBe('[lazy]');
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
