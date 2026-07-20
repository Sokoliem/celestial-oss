/**
 * Spinner engine for @celestial/corona.
 *
 * Two APIs:
 *
 * 1. Pure functions (framework authors):
 *    import { resolve, renderAt, spinners } from '@celestial/corona';
 *    const s = resolve(spinners.dots);
 *    console.log(renderAt(s, elapsed));
 *
 * 2. Convenience runner (CLI apps):
 *    import { createSpinner } from '@celestial/corona';
 *    const s = createSpinner('dots', { text: 'Loading...' });
 *    s.start();
 *    s.succeed('Done!');
 */

// ── Composition operators ────────────────────────────────────────────────
export {
  alternate,
  beside,
  bold,
  colorize,
  concat,
  dim,
  fillEmpty,
  gradient,
  mapFrames,
  mirror,
  pad,
  prefix,
  rainbow,
  reverse,
  sample,
  slide,
  speed,
  stretch,
  suffix,
} from './compose.js';
// ── Engine (pure functions) ──────────────────────────────────────────────
export { fromFrames, listNames, lookup, procedural, registerAll, renderAt, resolve } from './engine.js';
// ── Types ────────────────────────────────────────────────────────────────
export type { Frame, ResolvedSpinner, RunnerOptions, SpinnerDefinition, SpinnerTransform } from './types.js';
export { symbols } from './types.js';

// ── Built-in spinners ────────────────────────────────────────────────────
import * as spinners from './spinners.js';

export type { SpinnerInstance } from './runner.js';

// ── Runner (convenience wrapper) ─────────────────────────────────────────
export { createSpinner } from './runner.js';
export { spinners };

// ── Auto-register all built-in spinners ──────────────────────────────────
import { registerAll } from './engine.js';
import { all } from './spinners.js';

registerAll(all);
