/**
 * Spinner engine — resolves definitions into renderable spinners and manages
 * the frame-cycling logic. This is the pure-function core of the library.
 */

import type { Frame, ResolvedSpinner, SpinnerDefinition } from './types.js';

/**
 * Resolve a spinner definition into a renderable spinner.
 * Validates the definition and normalizes it into a uniform interface.
 */
export function resolve(def: SpinnerDefinition): ResolvedSpinner {
  const interval = def.interval ?? 80;

  if (def.render) {
    return {
      name: def.name,
      interval,
      frame: def.render,
      length: Infinity,
    };
  }

  if (!def.frames || def.frames.length === 0) {
    throw new Error(`Spinner "${def.name}" must have frames or a render function`);
  }

  const frames = def.frames;
  return {
    name: def.name,
    interval,
    frame(tick: number): Frame {
      return frames[((tick % frames.length) + frames.length) % frames.length]!;
    },
    length: frames.length,
  };
}

/**
 * Get the rendered frame for a spinner at a given elapsed time.
 * Pure function — no side effects.
 */
export function renderAt(spinner: ResolvedSpinner, elapsedMs: number): Frame {
  const tick = Math.floor(elapsedMs / spinner.interval);
  return spinner.frame(tick);
}

/**
 * Create a spinner definition from a simple frames array.
 */
export function fromFrames(name: string, frames: readonly string[], interval?: number): SpinnerDefinition {
  return { name, frames, interval };
}

/**
 * Create a procedural spinner from a render function.
 */
export function procedural(name: string, render: (tick: number) => string, interval?: number): SpinnerDefinition {
  return { name, render, interval };
}

/**
 * Lookup a spinner by name from the built-in registry.
 * Returns undefined if not found — callers should fall back or throw.
 */
const _registry = new Map<string, SpinnerDefinition>();

export function registerAll(spinners: Record<string, SpinnerDefinition>): void {
  for (const [key, def] of Object.entries(spinners)) {
    _registry.set(key, def);
  }
}

export function lookup(name: string): SpinnerDefinition | undefined {
  return _registry.get(name);
}

export function listNames(): string[] {
  return Array.from(_registry.keys());
}
