// ── Core ────────────────────────────────────────────────────────────────

export type { TokenizerState } from '@celestial/spectrum';
// ── AI Admonition Themes (C8) ───────────────────────────────────────────
export { aiAdmonitionTheme } from './ai-admonition.js';
// ── Anchors / spring scroll ─────────────────────────────────────────────
export {
  ANCHOR_SCROLL_SPRING,
  type AnchorEntry,
  type AnchorIndex,
  type AnchorScrollAnimation,
  buildAnchorIndex,
  resolveAnchor,
  startAnchorScroll,
  tickAnchorScroll,
} from './anchors.js';
export type { AuditFinding, AuditReport } from './audit.js';
// ── Audit (B12) ─────────────────────────────────────────────────────────
export { auditMarkdown } from './audit.js';
// ── Fence Renderers (A2 / A5 / B9) ──────────────────────────────────────
export {
  chartFenceRenderer,
  csvFenceRenderer,
  diffSplitFenceRenderer,
  httpFenceRenderer,
  jsonFenceRenderer,
  mermaidFenceRenderer,
  sqlFenceRenderer,
} from './fence-renderers/index.js';
// ── Frontmatter (A4) ────────────────────────────────────────────────────
export { extractFrontmatter } from './frontmatter.js';
// Highlight types re-exported from @celestial/spectrum via highlight.ts
export type {
  HighlightTheme,
  HighlightThemeName,
  LanguageGrammar,
} from './highlight.js';
// ── Syntax Highlighting ─────────────────────────────────────────────────
export {
  createHighlightTheme,
  getHighlightTheme,
  getLanguageGrammar,
  highlight,
  highlightCode,
  highlightPartial,
  initialState,
  listLanguages,
  registerLanguage,
} from './highlight.js';
// ── Image Rendering (A1) ────────────────────────────────────────────────
export { bestImageProtocol, renderImage, renderImageAsync } from './image-render.js';
export type { MarkdownInteractionHooks } from './interactions.js';
// ── Interaction Wiring (A6) ─────────────────────────────────────────────
export { dispatchMarkdownInteraction, findInteractiveNodes, wireMarkdownInteractions } from './interactions.js';
// ── Internal Peer Loader ────────────────────────────────────────────────
export { getPeerSync, hasPeer, loadPeer, type PeerRegistry } from './internal/peers.js';
// ── Search Highlights (B4) ────────────────────────────────────────────
export { markdownWithSearch } from './markdown-with-search.js';
// ── Markdown glyph tokens ──────────────────────────────────────────────
export { markdownGlyph, markdownGlyphTokens, type MarkdownGlyphName } from './markdown-glyphs.js';
// ── Math Unicode (A3) ───────────────────────────────────────────────────
export { mathToUnicode } from './math-unicode.js';
export { getEmoji, parseInline, parseMarkdown, registerEmoji } from './parser.js';
export type { FencePlugin } from './register-fence-renderers.js';
// ── Fence Plugin Convention (C9) ────────────────────────────────────────
export { registerFenceRenderers } from './register-fence-renderers.js';
export { renderMarkdown } from './renderer.js';
// ── Block Snap Scroll (B6) ──────────────────────────────────────────────
export {
  type BlockBoundary,
  type BlockSnapAnimation,
  type BlockSnapController,
  type BlockSnapOverlay,
  type BlockSnapScrollOptions,
  createBlockSnapScroll,
} from './scroll-snap.js';
// ── Search ──────────────────────────────────────────────────────────────
export {
  clearSearch,
  type FindMatchesOptions,
  findMatches,
  flattenSearchableText,
  initSearch,
  nextMatch,
  prevMatch,
} from './search.js';
export { createMarkdownStream } from './stream.js';
// ── Stream Shimmer (C2) ─────────────────────────────────────────────────
export { markdownStreamShimmer, type StreamShimmerOptions } from './stream-shimmer.js';
// ── Themes ──────────────────────────────────────────────────────────────
export {
  createMarkdownTheme,
  createTheme,
  defaultTheme,
  fromSemanticTheme,
  lightTheme,
} from './theme.js';
export type { TocEntry, TocOptions } from './toc.js';
// ── Table of Contents ───────────────────────────────────────────────────
export { extractToc, slugify, toc } from './toc.js';
// ── Types ───────────────────────────────────────────────────────────────
export type {
  AdmonitionKind,
  AdmonitionThemeOverride,
  FenceRenderContext,
  FenceRenderer,
  InlineToken,
  ListItem,
  LiveExecHostHooks,
  LiveExecMeta,
  MarkdownSearchMatch,
  MarkdownSearchState,
  MarkdownStream,
  MarkdownStreamSnapshot,
  MarkdownTheme,
  RenderOptions,
  TelemetrySink,
  TerminalCapabilities,
  Token,
} from './types.js';
export type { ViewMode } from './view-mode.js';
// ── Semantic Zoom (B3) ──────────────────────────────────────────────────
export { markdownView } from './view-mode.js';
export type { PulsarNodeData, VNode } from './vnode.js';
// ── VNode Component ─────────────────────────────────────────────────────
export { markdown } from './vnode.js';
