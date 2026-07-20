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

/**
 * Create a simple EffectContext backed by `performance.now` (or `Date.now`
 * in environments without `performance`). Suitable for tests and standalone
 * use; in a full app the host can provide its own via `createAppEffectContext`.
 */
export function createEffectContext(): EffectContext {
  const subscribers = new Set<EffectContextSubscriber>();
  let rafId: ReturnType<typeof setTimeout> | null = null;

  function tick(): void {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    for (const cb of subscribers) {
      cb(now);
    }
    if (subscribers.size > 0) {
      rafId = setTimeout(tick, 16);
    } else {
      rafId = null;
    }
  }

  return {
    getTime(): number {
      return typeof performance !== 'undefined' ? performance.now() : Date.now();
    },
    subscribe(cb: EffectContextSubscriber): () => void {
      subscribers.add(cb);
      if (rafId === null) {
        rafId = setTimeout(tick, 16);
      }
      return () => {
        subscribers.delete(cb);
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

    // Nodes without text content or whose rendering is opaque — pass through.
    case 'empty':
    case 'image':
    case 'component':
    case 'event':
    case 'hover':
    case 'memo':
    case 'localState':
    case 'lazy':
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
import { graphemes, RESET, stripAnsi } from './utils.js';

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
      const chars = graphemes(visible);
      if (chars.length === 0) return content;

      const speed = opts.speed ?? 1;
      const lineCount = opts.lines ?? 2;
      const dim = opts.dim ?? 0.35;
      const pos = (opts.tick * speed) % chars.length;

      let result = '';
      for (let i = 0; i < chars.length; i++) {
        // Distance to nearest scan band
        const dist = Math.abs(i - pos) % (chars.length / Math.max(1, lineCount));
        const halfBand = chars.length / (Math.max(1, lineCount) * 4);
        if (dist <= halfBand) {
          // In scan band — full brightness
          result += chars[i];
        } else {
          // Dimmed
          const dimL = Math.round(dim * SCAN_DIM_LIGHTNESS_CEILING);
          const c = coronaColor.hsl(0, 0, dimL);
          result += c.fg() + chars[i];
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
  const n = (seed * 9301 + index * 49297 + tick * 233) % 233280;
  return n / 233280;
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
      const chars = graphemes(visible);
      if (chars.length === 0) return content;

      const freq = opts.freq ?? 0.05;
      const intensity = opts.intensity ?? 60;
      const seed = opts.seed ?? 42;
      const tick = opts.tick;

      let result = '';
      for (let i = 0; i < chars.length; i++) {
        const r = deterministicRand(seed, i, tick);
        if (r < freq) {
          const shift = Math.floor(deterministicRand(seed + 1, i, tick) * intensity);
          const channel = Math.floor(deterministicRand(seed + 2, i, tick) * 3);
          const rgb: [number, number, number] = [128, 128, 128];
          rgb[channel] = Math.min(255, 128 + shift);
          const c = coronaColor.rgb(rgb[0], rgb[1], rgb[2]);
          result += c.fg() + chars[i];
        } else {
          result += chars[i];
        }
      }

      return result + RESET;
    });
  };
}

// Re-export for convenience
export { colorToHSL, interpolateColor };
