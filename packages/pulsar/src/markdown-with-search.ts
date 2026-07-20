/**
 * Markdown with Search Highlights (B4)
 *
 * Parses markdown, runs a search query, and returns a VNode tree with
 * matching blocks highlighted. The current match gets a distinct marker.
 *
 * Usage:
 *   const { vnode, state } = markdownWithSearch(source, 'query', opts);
 */

import { parseMarkdown } from './parser/index.js';
import { initSearch } from './search.js';
import type { MarkdownSearchState, RenderOptions } from './types.js';
import { markdown } from './vnode.js';

interface MarkdownWithSearchResult {
  readonly vnode: ReturnType<typeof markdown>;
  readonly state: MarkdownSearchState;
}

/**
 * Render markdown as a VNode tree with matching blocks highlighted.
 *
 * Finds all matches of `query` in the document, injects
 * `searchHighlights` into the render options, and returns both the VNode
 * tree and the search state (including current match index).
 */
export function markdownWithSearch(input: string, query: string, options?: RenderOptions): MarkdownWithSearchResult {
  const tokens = parseMarkdown(input);
  const state = initSearch(query, tokens);
  const vnode = markdown(input, {
    ...options,
    searchHighlights: state.matches,
    currentMatchIndex: state.currentMatchIndex,
  });
  return { vnode, state };
}
