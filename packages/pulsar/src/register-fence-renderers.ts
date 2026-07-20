/**
 * Fence-Renderer Plugin Convention (C9)
 *
 * Provides a typed registry for domain-specific fence renderers.
 *
 * Usage:
 *   const renderers = registerFenceRenderers(
 *     { tag: 'json', render: jsonFenceRenderer },
 *     { tag: 'chart', render: chartFenceRenderer, requires: ['stellar'] },
 *   );
 *   renderMarkdown(source, { fenceRenderers: renderers });
 */

import type { FenceRenderer } from './types.js';

export interface FencePlugin {
  /** Language tag that triggers this renderer (e.g. 'json', 'chart'). */
  readonly tag: string;
  /** The renderer function. */
  readonly render: FenceRenderer;
  /** Optional capability metadata for hosts that filter plugins before registration. */
  readonly requires?: readonly string[];
}

/**
 * Register a set of fence-renderer plugins into a language-tag map.
 *
 * Last-plugin-wins on tag collision. Returns a plain object suitable for
 * `RenderOptions.fenceRenderers`.
 */
export function registerFenceRenderers(...plugins: FencePlugin[]): Record<string, FenceRenderer> {
  if (plugins.length > 10_000) throw new RangeError('Fence renderer plugin count exceeds 10000');
  const out = Object.create(null) as Record<string, FenceRenderer>;
  for (const plugin of plugins) {
    const tag = typeof plugin?.tag === 'string' ? plugin.tag.trim().toLowerCase() : '';
    if (!/^[a-z0-9_+#.:-]{1,128}$/.test(tag)) throw new TypeError('Fence renderer tags must be 1 to 128 language-tag characters');
    if (typeof plugin.render !== 'function') throw new TypeError(`Fence renderer for ${tag} must be a function`);
    out[tag] = plugin.render;
  }
  return out;
}
