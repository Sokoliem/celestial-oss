/**
 * Effect composition primitives for mirage.
 *
 * `compose()` stacks multiple VNode-level effects, applying them left-to-right
 * (last effect applied = outermost wrapper). Each effect is a pure function
 * `(node: VNode, ctx: EffectContext) => VNode` that may walk or wrap the tree.
 *
 * The EffectContext provides a shared timeline driver sourced from aurora's
 * timeline abstraction, giving effects access to a monotonic clock and the
 * ability to register frame callbacks.
 */

import type { VNode } from '@celestial/nebula';

// ---------------------------------------------------------------------------
// EffectContext
// ---------------------------------------------------------------------------

export type EffectContextSubscriber = (nowMs: number) => void;

/**
 * Context passed to every effect function at call time.
 *
 * `getTime()` returns the current monotonic timestamp in milliseconds.
 * `subscribe(cb)` registers a callback invoked on each animation frame — the
 * callback receives the current timestamp and is automatically deregistered
 * when the returned disposer is called.
 */
export interface EffectContext {
  /** Returns current monotonic time in ms. */
  getTime(): number;
  /** Subscribe to animation-frame ticks. Returns a disposer. */
  subscribe(cb: EffectContextSubscriber): () => void;
}

export interface EffectContextOptions {
  /** Injectable monotonic clock, primarily for hosts and deterministic tests. */
  now?: () => number;
  /** Delay between standalone context frames. Default: 16ms. */
  frameMs?: number;
  /** Reports an individual subscriber failure without stopping sibling effects. */
  onSubscriberError?: (error: unknown) => void;
}

/**
 * Create a simple EffectContext backed by `performance.now` (or `Date.now`
 * in environments without `performance`). Suitable for tests and standalone
 * use; in a full app the host can provide its own via `createAppEffectContext`.
 */
export function createEffectContext(options: EffectContextOptions = {}): EffectContext {
  const subscribers = new Set<{ callback: EffectContextSubscriber }>();
  let rafId: ReturnType<typeof setTimeout> | null = null;
  let lastTime = 0;
  const frameMs = Number.isFinite(options.frameMs) && options.frameMs! > 0 ? Math.floor(options.frameMs!) : 16;

  function readTime(): number {
    const candidate = options.now?.() ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (Number.isFinite(candidate)) lastTime = Math.max(lastTime, candidate);
    return lastTime;
  }

  function schedule(): void {
    if (rafId === null && subscribers.size > 0) rafId = setTimeout(tick, frameMs);
  }

  function tick(): void {
    rafId = null;
    const now = readTime();
    for (const subscription of [...subscribers]) {
      if (!subscribers.has(subscription)) continue;
      try {
        subscription.callback(now);
      } catch (error) {
        try {
          options.onSubscriberError?.(error);
        } catch {
          // Error reporting is isolated too: a host hook cannot stop the clock.
        }
      }
    }
    schedule();
  }

  return {
    getTime(): number {
      return readTime();
    },
    subscribe(cb: EffectContextSubscriber): () => void {
      if (typeof cb !== 'function') throw new TypeError('effect subscriber must be a function');
      const subscription = { callback: cb };
      subscribers.add(subscription);
      schedule();
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        subscribers.delete(subscription);
        if (subscribers.size === 0 && rafId !== null) {
          clearTimeout(rafId);
          rafId = null;
        }
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Effect type
// ---------------------------------------------------------------------------

/**
 * A single composable effect.
 *
 * Takes a VNode and a shared context and returns a transformed VNode.
 * Effects must be pure with respect to the VNode they receive — they should
 * not mutate nodes but may return entirely new trees.
 */
export type Effect = (node: VNode, ctx: EffectContext) => VNode;

// ---------------------------------------------------------------------------
// compose()
// ---------------------------------------------------------------------------

/**
 * Compose multiple effects into a single effect function that applies them
 * left-to-right over a VNode.
 *
 * The last effect in the list is the outermost wrapper. Calling the returned
 * function with a VNode applies all effects in sequence:
 *
 *   compose(a, b, c)(node) === c(b(a(node, ctx), ctx), ctx)
 *
 * Example:
 *   const fancy = compose(
 *     gradientEffect({ from: '#ff0080', to: '#00ffff', direction: 'horizontal' }),
 *     scanEffect({ speed: 60, lines: 3 }),
 *     glitchEffect({ intensity: 0.2, freq: 0.05 }),
 *   );
 *   const node = fancy(textNode);
 */
export function compose(...effects: Effect[]): (node: VNode, ctx?: EffectContext) => VNode {
  const ctx = createEffectContext();

  return (node: VNode, overrideCtx?: EffectContext): VNode => {
    const resolvedCtx = overrideCtx ?? ctx;
    let current = node;
    for (const effect of effects) {
      current = effect(current, resolvedCtx);
    }
    return current;
  };
}

// ---------------------------------------------------------------------------
// VNode text-transform helper
// ---------------------------------------------------------------------------

/**
 * Walk a VNode tree, applying `transform` to the `content` of every TextNode.
 * All other node kinds are recursed into by rebuilding children arrays.
 * Returns a structurally new tree (original nodes are not mutated).
 */
export function mapTextContent(node: VNode, transform: (content: string) => string): VNode {
  switch (node.kind) {
    case 'text':
      return { ...node, content: transform(node.content) };

    case 'box':
      return { ...node, children: node.children.map((c) => mapTextContent(c, transform)) };

    case 'row':
      return { ...node, children: node.children.map((c) => mapTextContent(c, transform)) };

    case 'column':
      return { ...node, children: node.children.map((c) => mapTextContent(c, transform)) };

    case 'scroll':
      return { ...node, child: mapTextContent(node.child, transform) };

    case 'focus':
      return { ...node, child: mapTextContent(node.child, transform) };

    case 'overlay':
      return { ...node, child: mapTextContent(node.child, transform) };

    case 'flex':
      return { ...node, child: mapTextContent(node.child, transform) };

    case 'suspense':
      return {
        ...node,
        child: mapTextContent(node.child, transform),
        fallback: mapTextContent(node.fallback, transform),
      };

    case 'portal':
      return { ...node, child: mapTextContent(node.child, transform) };

    case 'tabGroup':
      return { ...node, children: node.children.map((c) => mapTextContent(c, transform)) };

    case 'event':
    case 'hover':
      return { ...node, child: mapTextContent(node.child, transform) };

    case 'memo':
      return { ...node, render: () => mapTextContent(node.render(), transform) };

    case 'localState':
      return { ...node, view: (state, dispatch) => mapTextContent(node.view(state, dispatch), transform) };

    case 'lazy':
      return {
        ...node,
        placeholder: mapTextContent(node.placeholder, transform),
        loader: async () => {
          const render = await node.loader();
          return () => mapTextContent(render(), transform);
        },
      };

    // Nodes without text content or whose rendering is opaque — pass through.
    case 'empty':
    case 'image':
    case 'component':
      return node;
  }
}

// ---------------------------------------------------------------------------
// Built-in VNode-level effects (wrapping the string-level functions)
// ---------------------------------------------------------------------------

import { color as coronaColor } from '@celestial/corona';
import type { GradientOpts } from './gradient.js';
import { gradient as gradientFn } from './gradient.js';
import { colorToHSL, interpolateColor } from './interpolate.js';
import { type MotionEffectOpts, shouldReduceMotion } from './motion.js';
import { positionedGraphemes, RESET, stripAnsi, visualWidth } from './utils.js';
import { clamp, finiteNumber, positiveInteger, wrap } from './validation.js';

/**
 * Maximum HSL lightness (0–100) used when projecting the scan-line `dim`
 * coefficient (0–1) into a corona-HSL lightness value. The 80 ceiling keeps
 * dimmed bands well below pure white so the scan stays visible against the
 * highlight bands. Named per design-system review (finding B5).
 */
const SCAN_DIM_LIGHTNESS_CEILING = 80;

/** Config for the built-in gradient effect. */
export type GradientEffectOpts = GradientOpts;

/**
 * VNode-level gradient effect. Applies a text gradient to every TextNode in
 * the tree. Use with `compose()`.
 */
export function gradientEffect(opts: GradientEffectOpts): Effect {
  return (node: VNode, _ctx: EffectContext): VNode => {
    return mapTextContent(node, (content) => {
      if (content === '') return content;
      return gradientFn(content, opts);
    });
  };
}

// ---------------------------------------------------------------------------
// Scan-line effect
// ---------------------------------------------------------------------------

export interface ScanEffectOpts extends MotionEffectOpts {
  /** Tick / frame counter driving animation (required). */
  tick: number;
  /** Scroll speed in characters per tick. Default: 1. */
  speed?: number;
  /** Number of simultaneously visible scan-lines. Default: 2. */
  lines?: number;
  /** Dim factor applied to non-scan characters (0–1). Default: 0.35. */
  dim?: number;
}

/**
 * Scan-line effect: sweeping horizontal bands of brightness that scroll
 * across the text, creating a CRT or vinyl record visual.
 */
export function scan(opts: ScanEffectOpts): Effect {
  return (node: VNode, _ctx: EffectContext): VNode => {
    if (shouldReduceMotion(opts)) return node;
    return mapTextContent(node, (content) => {
      const visible = stripAnsi(content);
      const glyphs = positionedGraphemes(visible);
      const width = visualWidth(visible);
      if (width === 0) return content;

      const speed = finiteNumber(opts.speed, 1);
      const lineCount = positiveInteger(opts.lines, 2);
      const dim = clamp(opts.dim, 0, 1, 0.35);
      const pos = wrap(finiteNumber(opts.tick, 0) * speed, width);
      const spacing = width / lineCount;
      const halfBand = spacing / 4;

      let result = '';
      for (const glyph of glyphs) {
        if (glyph.value === '\n') {
          result += '\n';
          continue;
        }
        const center = glyph.column + (glyph.width - 1) / 2;
        const phase = wrap(center - pos, spacing);
        const dist = Math.min(phase, spacing - phase);
        if (dist <= halfBand) {
          // In scan band — full brightness
          result += glyph.value;
        } else {
          // Dimmed
          const dimL = Math.round(dim * SCAN_DIM_LIGHTNESS_CEILING);
          const c = coronaColor.hsl(0, 0, dimL);
          result += c.fg() + glyph.value;
        }
      }

      return result + RESET;
    });
  };
}

// ---------------------------------------------------------------------------
// Glitch effect
// ---------------------------------------------------------------------------

export interface GlitchEffectOpts extends MotionEffectOpts {
  /** Tick / frame counter driving animation (required). */
  tick: number;
  /** Glitch probability per character per frame (0–1). Default: 0.05. */
  freq?: number;
  /** Maximum RGB channel displacement (0–255). Default: 60. */
  intensity?: number;
  /** Optional deterministic seed for reproducible glitch patterns. */
  seed?: number;
}

/** Simple deterministic pseudo-random number based on seed + index + tick. */
function deterministicRand(seed: number, index: number, tick: number): number {
  return wrap(seed * 9301 + index * 49297 + tick * 233, 233280) / 233280;
}

/**
 * Glitch effect: randomly displaces individual character foreground colors to
 * simulate digital corruption. Integrates with `compose()`.
 */
export function glitch(opts: GlitchEffectOpts): Effect {
  return (node: VNode, _ctx: EffectContext): VNode => {
    if (shouldReduceMotion(opts)) return node;
    return mapTextContent(node, (content) => {
      const visible = stripAnsi(content);
      const glyphs = positionedGraphemes(visible);
      if (glyphs.length === 0) return content;

      const freq = clamp(opts.freq, 0, 1, 0.05);
      const intensity = clamp(opts.intensity, 0, 255, 60);
      const seed = finiteNumber(opts.seed, 42);
      const tick = finiteNumber(opts.tick, 0);

      let result = '';
      for (const glyph of glyphs) {
        if (glyph.value === '\n') {
          result += '\n';
          continue;
        }
        const r = deterministicRand(seed, glyph.column, tick);
        if (r < freq) {
          const shift = Math.floor(deterministicRand(seed + 1, glyph.column, tick) * intensity);
          const channel = Math.floor(deterministicRand(seed + 2, glyph.column, tick) * 3);
          const rgb: [number, number, number] = [128, 128, 128];
          rgb[channel] = Math.min(255, 128 + shift);
          const c = coronaColor.rgb(rgb[0], rgb[1], rgb[2]);
          result += c.fg() + glyph.value;
        } else {
          result += glyph.value;
        }
      }

      return result + RESET;
    });
  };
}

// Re-export for convenience
export { colorToHSL, interpolateColor };
