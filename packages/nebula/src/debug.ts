/**
 * Nebula Debug Plugin
 *
 * A development-time plugin that logs runtime lifecycle events
 * (updates, renders, subscriptions) to help debug Nebula applications.
 *
 * Output goes to stderr by default so it doesn't interfere with
 * the terminal rendering on stdout.
 */

import { createPlugin, type Plugin } from './plugin.js';
import type { VNode } from './vdom.js';

// ─── Options ────────────────────────────────────────────────────────────────

export interface DebugOptions {
  /** Log every message and model change */
  logUpdates?: boolean;
  /** Log render timing */
  logRenders?: boolean;
  /** Log subscription reconciliation */
  logSubscriptions?: boolean;
  /** Custom output function (defaults to stderr) */
  output?: (line: string) => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function defaultOutput(line: string): void {
  if (typeof process !== 'undefined' && process.stderr) {
    process.stderr.write(line + '\n');
  }
}

/**
 * Try to extract a human-readable label from a message.
 * If it has a `type` string property, use that. Otherwise, fall back to typeof.
 */
function msgLabel(msg: unknown): string {
  if (msg !== null && typeof msg === 'object' && 'type' in msg) {
    return String((msg as { type: unknown }).type);
  }
  return typeof msg;
}

/**
 * Produce a compact summary of what changed between two models.
 * For objects, reports changed top-level keys with old→new values.
 * Keeps it short by limiting to a few keys.
 */
function modelDiff(prev: unknown, next: unknown): string {
  if (prev === next) return '';

  if (prev !== null && next !== null && typeof prev === 'object' && typeof next === 'object' && !Array.isArray(prev) && !Array.isArray(next)) {
    const p = prev as Record<string, unknown>;
    const n = next as Record<string, unknown>;
    const allKeys = new Set([...Object.keys(p), ...Object.keys(n)]);
    const diffs: string[] = [];

    for (const key of allKeys) {
      if (p[key] !== n[key]) {
        const pv = summarizeValue(p[key]);
        const nv = summarizeValue(n[key]);
        diffs.push(`model.${key}: ${pv}\u2192${nv}`);
      }
      // Limit output to avoid flooding stderr
      if (diffs.length >= 3) break;
    }

    return diffs.join(' ');
  }

  return `model: ${summarizeValue(prev)}\u2192${summarizeValue(next)}`;
}

function summarizeValue(v: unknown): string {
  if (v === null || v === undefined) return String(v);
  if (Array.isArray(v)) return `[${v.length}]`;
  if (typeof v === 'object') return '{...}';
  const s = String(v);
  return s.length > 20 ? s.slice(0, 20) + '...' : s;
}

// ─── Plugin ─────────────────────────────────────────────────────────────────

/**
 * Create a debug plugin that logs runtime lifecycle events.
 *
 * With no options (or all options false), the plugin is a no-op.
 *
 * ```ts
 * import { debugPlugin, withPlugins } from '@celestial/nebula';
 *
 * const config = withPlugins(myApp, [
 *   debugPlugin({ logUpdates: true, logRenders: true }),
 * ]);
 * ```
 */
export function debugPlugin<Model, M>(options?: DebugOptions): Plugin<Model, M> {
  const logUpdates = options?.logUpdates ?? false;
  const logRenders = options?.logRenders ?? false;
  const logSubscriptions = options?.logSubscriptions ?? false;
  const write = options?.output ?? defaultOutput;

  // If nothing is enabled, return a no-op plugin
  if (!logUpdates && !logRenders && !logSubscriptions) {
    return { name: 'debug' };
  }

  let pendingStartTime = 0;

  return createPlugin<Model, M>('debug', {
    beforeUpdate: logUpdates
      ? (_msg: M) => {
          pendingStartTime = performance.now();
        }
      : undefined,

    afterUpdate: logUpdates
      ? (msg: M, prevModel: Model, nextModel: Model) => {
          const elapsed = performance.now() - pendingStartTime;
          const label = msgLabel(msg);
          const diff = modelDiff(prevModel, nextModel);
          const diffStr = diff ? ` ${diff}` : '';
          write(`[nebula] update: ${label} (${elapsed.toFixed(2)}ms)${diffStr}`);
        }
      : undefined,

    wrapView: logRenders
      ? (originalView: (model: Model) => VNode) => {
          return (model: Model): VNode => {
            const start = performance.now();
            const result = originalView(model);
            const elapsed = performance.now() - start;
            write(`[nebula] view: rendered (${elapsed.toFixed(2)}ms)`);
            return result;
          };
        }
      : undefined,
  });
}
