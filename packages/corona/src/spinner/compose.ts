/**
 * Composition operators — the heart of what makes this an "engine".
 *
 * These operators transform and combine spinner definitions to create
 * new spinners programmatically. Every operator returns a new SpinnerDefinition,
 * so they can be chained freely.
 */

import { resolve } from './engine.js';
import type { Frame, SpinnerDefinition } from './types.js';

/**
 * Reverse the frame order of a spinner.
 */
export function reverse(spinner: SpinnerDefinition): SpinnerDefinition {
  if (spinner.render) {
    throw new Error(`Cannot reverse procedural spinner "${spinner.name}"`);
  }
  return {
    name: `${spinner.name}-reversed`,
    frames: [...spinner.frames!].reverse(),
    interval: spinner.interval,
  };
}

/**
 * Mirror frames: play forward then backward (ping-pong).
 */
export function mirror(spinner: SpinnerDefinition): SpinnerDefinition {
  if (spinner.render) {
    return spinner; // Can't mirror procedural spinners meaningfully
  }
  const frames = spinner.frames!;
  const mirrored = [...frames, ...frames.slice(1, -1).reverse()];
  return {
    name: `${spinner.name}-mirrored`,
    frames: mirrored,
    interval: spinner.interval,
  };
}

/**
 * Concatenate multiple spinners into a single frame sequence.
 */
export function concat(...spinners: SpinnerDefinition[]): SpinnerDefinition {
  const allFrames: Frame[] = [];
  for (const s of spinners) {
    if (s.render) {
      throw new Error(`Cannot concat procedural spinner "${s.name}"`);
    }
    allFrames.push(...s.frames!);
  }
  return {
    name: spinners.map((s) => s.name).join('+'),
    frames: allFrames,
    interval: Math.min(...spinners.map((s) => s.interval ?? 80)),
  };
}

/**
 * Alternate between spinners frame-by-frame (interleave).
 */
export function alternate(...spinners: SpinnerDefinition[]): SpinnerDefinition {
  const maxLen = Math.max(...spinners.map((s) => s.frames?.length ?? 0));
  const frames: Frame[] = [];
  for (let i = 0; i < maxLen; i++) {
    for (const s of spinners) {
      if (s.frames && i < s.frames.length) {
        frames.push(s.frames[i]!);
      }
    }
  }
  return {
    name: spinners.map((s) => s.name).join('~'),
    frames,
    interval: Math.min(...spinners.map((s) => s.interval ?? 80)),
  };
}

/**
 * Change the speed (interval) of a spinner.
 */
export function speed(spinner: SpinnerDefinition, intervalMs: number): SpinnerDefinition {
  return { ...spinner, interval: intervalMs };
}

/**
 * Map each frame through a transform function.
 */
export function mapFrames(spinner: SpinnerDefinition, fn: (frame: Frame, index: number) => Frame): SpinnerDefinition {
  if (spinner.render) {
    const original = spinner.render;
    return {
      name: spinner.name,
      render: (tick: number) => fn(original(tick), tick),
      interval: spinner.interval,
    };
  }
  return {
    name: spinner.name,
    frames: spinner.frames!.map((f, i) => fn(f, i)),
    interval: spinner.interval,
  };
}

/**
 * Add a prefix to every frame.
 */
export function prefix(spinner: SpinnerDefinition, pre: string): SpinnerDefinition {
  return mapFrames(spinner, (f) => pre + f);
}

/**
 * Add a suffix to every frame.
 */
export function suffix(spinner: SpinnerDefinition, suf: string): SpinnerDefinition {
  return mapFrames(spinner, (f) => f + suf);
}

/**
 * Pad each frame to a fixed width (useful for alignment).
 */
export function pad(spinner: SpinnerDefinition, width: number, char = ' '): SpinnerDefinition {
  return mapFrames(spinner, (f) => f.padEnd(width, char));
}

/**
 * Apply ANSI color codes to each frame.
 * Accepts standard ANSI SGR codes: 31=red, 32=green, 33=yellow, 34=blue,
 * 35=magenta, 36=cyan, 91-96=bright variants.
 */
export function colorize(spinner: SpinnerDefinition, ansiCode: number): SpinnerDefinition {
  return mapFrames(spinner, (f) => `\x1b[${ansiCode}m${f}\x1b[39m`);
}

/**
 * Cycle through multiple ANSI colors across frames (rainbow effect).
 */
export function rainbow(spinner: SpinnerDefinition, codes?: number[]): SpinnerDefinition {
  const colors = codes ?? [31, 33, 32, 36, 34, 35]; // R Y G C B M
  return mapFrames(spinner, (f, i) => {
    const code = colors[i % colors.length]!;
    return `\x1b[${code}m${f}\x1b[39m`;
  });
}

/**
 * Apply bold styling to all frames.
 */
export function bold(spinner: SpinnerDefinition): SpinnerDefinition {
  return mapFrames(spinner, (f) => `\x1b[1m${f}\x1b[22m`);
}

/**
 * Apply dim styling to all frames.
 */
export function dim(spinner: SpinnerDefinition): SpinnerDefinition {
  return mapFrames(spinner, (f) => `\x1b[2m${f}\x1b[22m`);
}

/**
 * Create a gradient effect by interpolating between two RGB colors across frames.
 */
export function gradient(spinner: SpinnerDefinition, fromRgb: [number, number, number], toRgb: [number, number, number]): SpinnerDefinition {
  if (spinner.render) {
    const original = spinner.render;
    return {
      name: spinner.name,
      render: (tick: number) => {
        const t = (Math.sin(tick * 0.1) + 1) / 2;
        return wrapRgb(original(tick), fromRgb, toRgb, t);
      },
      interval: spinner.interval,
    };
  }

  const len = spinner.frames!.length;
  return {
    name: spinner.name,
    frames: spinner.frames!.map((f, i) => {
      const t = len === 1 ? 0 : i / (len - 1);
      return wrapRgb(f, fromRgb, toRgb, t);
    }),
    interval: spinner.interval,
  };
}

/**
 * Place two spinners side by side (horizontal composition).
 */
export function beside(left: SpinnerDefinition, right: SpinnerDefinition, separator = ' '): SpinnerDefinition {
  if (left.render || right.render) {
    const leftResolved = resolve(left);
    const rightResolved = resolve(right);
    const leftFn = (tick: number) => leftResolved.frame(tick);
    const rightFn = (tick: number) => rightResolved.frame(tick);
    return {
      name: `${left.name}|${right.name}`,
      render: (tick: number) => leftFn(tick) + separator + rightFn(tick),
      interval: Math.min(left.interval ?? 80, right.interval ?? 80),
    };
  }

  const lcm = lcmOf(left.frames!.length, right.frames!.length);
  const frames: Frame[] = [];
  for (let i = 0; i < lcm; i++) {
    const l = left.frames![i % left.frames!.length]!;
    const r = right.frames![i % right.frames!.length]!;
    frames.push(l + separator + r);
  }
  return {
    name: `${left.name}|${right.name}`,
    frames,
    interval: Math.min(left.interval ?? 80, right.interval ?? 80),
  };
}

/**
 * Repeat each frame N times (slow down without changing interval).
 */
export function stretch(spinner: SpinnerDefinition, factor: number): SpinnerDefinition {
  if (spinner.render) {
    const original = spinner.render;
    return {
      name: spinner.name,
      render: (tick: number) => original(Math.floor(tick / factor)),
      interval: spinner.interval,
    };
  }
  const frames: Frame[] = [];
  for (const f of spinner.frames!) {
    for (let i = 0; i < factor; i++) {
      frames.push(f);
    }
  }
  return { name: spinner.name, frames, interval: spinner.interval };
}

/**
 * Take only every Nth frame (speed up without changing interval).
 */
export function sample(spinner: SpinnerDefinition, every: number): SpinnerDefinition {
  if (spinner.render) {
    const original = spinner.render;
    return {
      name: spinner.name,
      render: (tick: number) => original(tick * every),
      interval: spinner.interval,
    };
  }
  const frames = spinner.frames!.filter((_, i) => i % every === 0);
  return { name: spinner.name, frames, interval: spinner.interval };
}

/**
 * Create a multi-character spinner from a sliding window over a pattern.
 */
export function slide(pattern: string, windowSize: number, interval?: number): SpinnerDefinition {
  const chars = [...pattern];
  const frames: Frame[] = [];
  for (let i = 0; i < chars.length; i++) {
    let frame = '';
    for (let j = 0; j < windowSize; j++) {
      frame += chars[(i + j) % chars.length];
    }
    frames.push(frame);
  }
  return { name: `slide-${pattern.slice(0, 8)}`, frames, interval };
}

/**
 * Create a progress-dot spinner that fills then empties.
 */
export function fillEmpty(filled: string, empty: string, width: number, interval?: number): SpinnerDefinition {
  const frames: Frame[] = [];
  // Fill phase
  for (let i = 0; i <= width; i++) {
    frames.push(filled.repeat(i) + empty.repeat(width - i));
  }
  // Empty phase
  for (let i = width - 1; i >= 0; i--) {
    frames.push(filled.repeat(i) + empty.repeat(width - i));
  }
  return { name: `fill-${width}`, frames, interval };
}

// ── Helpers ──────────────────────────────────────────────────────────────

function wrapRgb(text: string, fromRgb: [number, number, number], toRgb: [number, number, number], t: number): string {
  const r = Math.round(fromRgb[0] + (toRgb[0] - fromRgb[0]) * t);
  const g = Math.round(fromRgb[1] + (toRgb[1] - fromRgb[1]) * t);
  const b = Math.round(fromRgb[2] + (toRgb[2] - fromRgb[2]) * t);
  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
}

function gcd(a: number, b: number): number {
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

function lcmOf(a: number, b: number): number {
  return (a * b) / gcd(a, b);
}
