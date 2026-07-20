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
  /** Optional capability requirements. If unmet, the plugin is skipped with a warning. */
  readonly requires?: readonly string[];
}

/**
 * Register a set of fence-renderer plugins into a language-tag map.
 *
 * Last-plugin-wins on tag collision. Returns a plain object suitable for
 * `RenderOptions.fenceRenderers`.
 */
export function registerFenceRenderers(...plugins: FencePlugin[]): Record<string, FenceRenderer> {
  const out: Record<string, FenceRenderer> = {};
  for (const plugin of plugins) {
    out[plugin.tag] = plugin.render;
  }
  return out;
}
