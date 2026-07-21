/**
 * Pulsar Token Types
 *
 * Token types representing parsed markdown elements for terminal rendering.
 * Covers CommonMark, GitHub Flavored Markdown (GFM), and custom extensions.
 */

// ── Block Tokens ────────────────────────────────────────────────────────

export type Token =
  | {
      type: 'heading';
      level: 1 | 2 | 3 | 4 | 5 | 6;
      content: InlineToken[];
      /**
       * GitHub-style slug derived from the heading's plain text. Always
       * populated by `parseMarkdown`; collisions are disambiguated with
       * `-2`, `-3`, … suffixes. Consumers can use it as an anchor target
       * for table-of-contents navigation.
       */
      id?: string;
    }
  | { type: 'paragraph'; content: InlineToken[] }
  | { type: 'code-block'; language: string; content: string; meta?: CodeBlockMeta }
  | { type: 'blockquote'; content: Token[] }
  | { type: 'list'; ordered: boolean; items: ListItem[] }
  | { type: 'hr' }
  | {
      type: 'table';
      headers: InlineToken[][];
      rows: InlineToken[][][];
      /**
       * Per-column alignment derived from the GFM separator row
       * (`:---`, `---:`, `:---:`, `---`). Length matches the header
       * column count. Always present after `parseMarkdown`.
       */
      align?: TableAlign[];
    }
  | {
      type: 'admonition';
      kind: AdmonitionKind;
      title: string;
      content: Token[];
      /** True when source used `[!kind]+` or `[!kind]-` syntax. */
      collapsed?: boolean;
      /** True for `+`/`-` forms (collapsible); false for plain `[!kind]`. */
      collapsible?: boolean;
    }
  | { type: 'footnote-def'; label: string; content: Token[] }
  | { type: 'image'; alt: string; url: string; title?: string }
  | {
      type: 'frontmatter';
      format: 'yaml' | 'toml' | 'json';
      raw: string;
      data: Record<string, unknown>;
    }
  | { type: 'wiki-link-block'; target: string; alias?: string }
  | { type: 'live-exec'; language: string; source: string; meta?: LiveExecMeta }
  /**
   * Definition list (`Term : Definition`). The terms array carries the dt
   * lines; the descriptions array carries the dd content for each term, in
   * declaration order.
   */
  | { type: 'definition-list'; items: { term: InlineToken[]; descriptions: InlineToken[][] }[] }
  /**
   * Block-level math (`$$ ... $$`). Pulsar does not render LaTeX — `mathBlock`
   * theme functions wrap the source in a `[math]` frame so the user can read
   * the expression verbatim. A future iteration could substitute a
   * latex-to-unicode subset.
   */
  | { type: 'math-block'; content: string }
  /**
   * Collapsible `<details>` element. The summary line is the always-visible
   * caption; the body renders when expanded. Block-level by spec, even though
   * the source uses HTML tag syntax.
   */
  | { type: 'details'; summary: InlineToken[]; content: Token[] };

export type AdmonitionKind = 'note' | 'tip' | 'important' | 'warning' | 'caution' | 'ai-thinking' | 'tool-call' | 'citation' | `${string}:${string}`;

/**
 * Per-column alignment for GFM tables. `'default'` means no explicit
 * alignment was given in the separator row; renderers may render this
 * the same as `'left'` or apply a header/body distinction.
 */
export type TableAlign = 'left' | 'center' | 'right' | 'default';

/**
 * Optional metadata attached to a fenced code block via the info string.
 * See {@link parseCodeBlockInfoString} for the source-level syntax.
 */
export interface CodeBlockMeta {
  /** 1-based line numbers that should render as highlighted. */
  readonly highlightLines?: number[];
  /** Render a left-side gutter with line numbers. */
  readonly showLineNumbers?: boolean;
  /** First line number (only used when `showLineNumbers` is true). Default 1. */
  readonly startLine?: number;
  /** Render a `[copy]` affordance after the code. */
  readonly copy?: boolean;
  /**
   * Soft-wrap long lines instead of letting them overflow the frame.
   * `true` and `'soft'` both enable wrapping.
   */
  readonly wrap?: boolean | 'soft';
  /** Apply `+`/`-`/space diff colouring even when language ≠ `diff`. */
  readonly diff?: boolean;
  /** Diff view mode: unified (default) or split side-by-side. */
  readonly view?: 'unified' | 'split';
  /** Auto-fold blocks taller than N lines (default 25). `false` disables. */
  readonly fold?: boolean | number;
  /** Overflow / wrapping mode. Renames `wrap` for clarity; alias kept. */
  readonly wraps?: 'none' | 'soft' | 'wrap';
}

// ── Inline Tokens ───────────────────────────────────────────────────────

export type InlineToken =
  | { type: 'text'; content: string }
  | { type: 'bold'; content: InlineToken[] }
  | { type: 'italic'; content: InlineToken[] }
  | { type: 'code'; content: string }
  | { type: 'link'; text: string; url: string }
  | { type: 'strikethrough'; content: InlineToken[] }
  | { type: 'footnote-ref'; label: string }
  | { type: 'emoji'; name: string; unicode: string }
  /** ==text== highlight (mark) — rendered with a high-contrast background. */
  | { type: 'mark'; content: InlineToken[] }
  /** Inline superscript via `<sup>...</sup>` HTML tags. */
  | { type: 'sup'; content: InlineToken[] }
  /** Inline subscript via `<sub>...</sub>` HTML tags. */
  | { type: 'sub'; content: InlineToken[] }
  /** Inline math `$expression$`. Rendered as a styled monospace span. */
  | { type: 'math-inline'; content: string }
  /** Wiki-link `[[Page]]` or `[[Page|alias]]`. */
  | { type: 'wiki-link'; target: string; alias?: string }
  /** Inline image inside a paragraph (`![alt](url)`). */
  | { type: 'image-inline'; alt: string; url: string; title?: string }
  /**
   * A hard line break (GFM): two or more trailing spaces before a newline.
   * Rendered as a line break inside a paragraph.
   */
  | { type: 'hard-break' };

// ── List Items ──────────────────────────────────────────────────────────

export interface ListItem {
  content: InlineToken[];
  children?: Token[];
  /** GFM task list: undefined means not a task, true/false for checked state */
  checked?: boolean;
}

// ── Theme ───────────────────────────────────────────────────────────────

export interface MarkdownTheme {
  heading1: (text: string) => string;
  heading2: (text: string) => string;
  heading3: (text: string) => string;
  heading4: (text: string) => string;
  heading5: (text: string) => string;
  heading6: (text: string) => string;
  bold: (text: string) => string;
  italic: (text: string) => string;
  code: (text: string) => string;
  codeBlock: (text: string) => string;
  link: (text: string, url: string) => string;
  /**
   * Style just the visible link text (no URL suffix) for composing with OSC 8
   * hyperlinks. When `options.hyperlinks` is true the renderer wraps the
   * result of this call in OSC 8 codes so terminals that support it both
   * render the styling and expose the clickable URL. Optional for
   * backward-compatible theme objects; falls back to plain text.
   */
  linkText?: (text: string) => string;
  blockquote: (text: string) => string;
  listBullet: string;
  listNumber: (n: number) => string;
  hr: (width: number) => string;
  strikethrough: (text: string) => string;
  /** ==highlight== / mark rendering — high-contrast background. */
  mark?: (text: string) => string;
  /** Inline superscript rendering. */
  sup?: (text: string) => string;
  /** Inline subscript rendering. */
  sub?: (text: string) => string;
  /** Inline math (`$...$`) — rendered as styled monospace text. */
  mathInline?: (source: string) => string;
  /** Block math (`$$...$$`) — rendered as a framed surface with a [math] label. */
  mathBlock?: (source: string, width?: number) => string;
  /** Definition list rendering — bold term, indented definitions. */
  definitionTerm?: (text: string) => string;
  definitionDescription?: (text: string) => string;
  /** Collapsible <details> rendering — chevron + bold summary. */
  detailsSummary?: (summary: string, open: boolean) => string;
  tableHeader: (text: string) => string;
  tableCell: (text: string) => string;
  tableBorder: string;
  /** Semantic diff styling sourced from corona domain tokens. */
  diffAdded?: (text: string) => string;
  diffRemoved?: (text: string) => string;
  diffContext?: (text: string) => string;
  diffHeader?: (text: string) => string;
  /** Marker for the active search-result block. */
  searchCurrentMarker?: string;
  /** Marker for a highlighted source line inside a code block. */
  codeHighlightMarker?: string;
  /** GFM task list checkboxes */
  taskChecked: string;
  taskUnchecked: string;
  /** Admonition rendering */
  admonitionTitle: (kind: AdmonitionKind, title: string) => string;
  admonitionBorder: (kind: AdmonitionKind) => string;
  /** Footnote rendering */
  footnoteRef: (label: string) => string;
  footnoteDef: (label: string) => string;
  /** Image placeholder (for string-mode rendering) */
  imagePlaceholder: (alt: string, url: string) => string;
  /** Emoji rendering */
  emoji: (name: string, unicode: string) => string;
  /** Code block border / frame — wraps the entire code block */
  codeBlockFrame: (content: string, language: string, width?: number) => string;
}

// ── Search ──────────────────────────────────────────────────────────────

export interface MarkdownSearchMatch {
  /** 0-based index into the document's top-level token array. */
  readonly blockIndex: number;
  /** 0-based char offset within the block's flattened visible text. */
  readonly column: number;
  /** Length of the match in characters. */
  readonly length: number;
  /** Context snippet (~80 chars centred on the match) for preview UI. */
  readonly snippet: string;
}

export interface MarkdownSearchState {
  readonly query: string;
  readonly regex: RegExp | null;
  readonly matches: readonly MarkdownSearchMatch[];
  readonly currentMatchIndex: number;
  readonly inputActive: boolean;
}

// ── Fence Renderers ─────────────────────────────────────────────────────

/**
 * Read-only slice of the renderer's internal context exposed to custom
 * fence renderers. Mirrors the public-facing parts of the internal
 * `RenderContext` so consumers can render in the same style as the host
 * without depending on internal modules.
 */
export interface FenceRenderContext {
  readonly theme: MarkdownTheme;
  readonly options: RenderOptions;
  readonly width: number;
  readonly indent: number;
}

/**
 * Custom renderer for a fenced code block, keyed by language tag (the
 * fence info string's first token). Receives the parsed token plus the
 * surrounding context, and returns either a fully styled string (which
 * the host inserts in place of the default code-block output) or `null`
 * to fall through to the default `spectrum`-highlighted rendering.
 *
 * Used by hosts to inject domain renderers — e.g. ```diff fences that
 * render through `parallax`, ```chart fences that render through
 * `stellar`, or `live` fences that stream output. Keep the implementation
 * pure and synchronous; async output should be wired through an
 * orchestrator outside the markdown render call.
 */
// ── Render Options ──────────────────────────────────────────────────────

export interface RenderOptions {
  width?: number;
  theme?: MarkdownTheme;
  indent?: number;
  /**
   * Custom renderers per fenced code block language. The key matches the
   * info-string language tag (e.g. `'diff'`, `'chart'`, `'mermaid'`). When
   * a key matches and the renderer returns a non-`null` string, that
   * string replaces the default code-block output; returning `null` falls
   * through to spectrum-highlighted rendering. When the map is undefined
   * or no key matches, today's behaviour is preserved byte-for-byte.
   */
  fenceRenderers?: Record<string, FenceRenderer>;
  /** Use OSC 8 hyperlinks when the terminal supports them */
  hyperlinks?: boolean;
  /**
   * Optional callback fired when a link's data payload is dispatched by a
   * consumer. `markdown()` itself never invokes this — pulsar emits the
   * `href` on link VNodes and tags them with `data.kind === 'link'`; the
   * consuming nebula app wires `Sub.mouse` to a matching cell region and
   * calls this callback. Kept for symmetry with `onFootnote` /
   * `onTaskToggle` so apps can route all three through one options bag.
   */
  onLink?: (url: string) => void;
  /**
   * Optional callback for footnote-reference clicks. Like `onLink`, the
   * consumer is responsible for hit-testing the tagged VNode and
   * dispatching this callback with the footnote label.
   */
  onFootnote?: (label: string) => void;
  /**
   * Optional callback for task-list checkbox toggles. The consumer routes
   * mouse/keyboard events on tagged checkbox VNodes here.
   */
  onTaskToggle?: (info: { itemIndex: number; checked: boolean }) => void;
  /**
   * Optional callback fired by consumers when the user activates a code
   * block's `[copy]` affordance. Pulsar emits a copy-tagged VNode but
   * does NOT touch the clipboard itself — the consuming app calls into
   * its own clipboard helper here.
   */
  onCopy?: (info: { code: string; language: string }) => void;
  /**
   * Highlight theme name (e.g. `'monokai'`, `'github'`) or full theme
   * object forwarded to `@celestial/spectrum`. Defaults to spectrum's
   * built-in default when unset.
   *
   * Typed as `unknown` here so this types module stays free of a
   * spectrum import; the renderer narrows it via spectrum's signature.
   */
  highlightTheme?: unknown;
  /** Enable bidi/RTL reordering via @celestial/rosetta */
  bidi?: boolean;
  /** Search matches whose containing blocks should receive the mark style. */
  searchHighlights?: readonly MarkdownSearchMatch[];
  /** 0-based index into `searchHighlights` indicating the current match for border styling. */
  currentMatchIndex?: number;
}

// ── Streaming ───────────────────────────────────────────────────────────

export interface MarkdownStreamSnapshot {
  source: string;
  committedSource: string;
  pendingSource: string;
  tokens: Token[];
  rendered: string;
}

export interface MarkdownStream {
  append(chunk: string): MarkdownStreamSnapshot;
  reset(): MarkdownStreamSnapshot;
  snapshot(options?: { finalize?: boolean }): MarkdownStreamSnapshot;
}

// ── Live Exec ─────────────────────────────────────────────────────────────

export interface LiveExecMeta {
  readonly timeout?: number;
  readonly approvalKey?: string;
  readonly env?: Record<string, string>;
}

export interface LiveExecHostHooks {
  requestApproval(approvalKey: string): boolean | Promise<boolean>;
  spawn(
    language: string,
    source: string,
    options: { timeout: number; env?: Record<string, string>; capDeath?: number },
  ): {
    stdout: AsyncIterable<string>;
    exitCode: Promise<number>;
  };
}

// ── Capabilities ────────────────────────────────────────────────────────

export interface TerminalCapabilities {
  readonly imageProtocol: 'kitty' | 'sixel' | 'iterm' | 'blocks' | 'braille' | 'none';
  readonly hyperlinks: boolean;
  readonly trueColor: boolean;
  readonly reducedMotion: boolean;
  readonly screenReader: boolean;
}

// ── Telemetry ───────────────────────────────────────────────────────────

export interface TelemetrySink {
  emit(event: string, payload: Record<string, unknown>): void;
}

// ── Admonition Theme Override ───────────────────────────────────────────

export type AdmonitionThemeOverride = Partial<Pick<MarkdownTheme, 'admonitionTitle' | 'admonitionBorder'>>;

// ── Fence Renderer Streaming Mode ───────────────────────────────────────

export interface FenceRenderer {
  readonly mode?: 'block-only' | 'streaming';
  (token: Extract<Token, { type: 'code-block' }>, ctx: FenceRenderContext): string | null;
}

// ── Extended Render Options (Phase 1–4) ─────────────────────────────────

export interface RenderOptions {
  width?: number;
  theme?: MarkdownTheme;
  indent?: number;
  fenceRenderers?: Record<string, FenceRenderer>;
  hyperlinks?: boolean;
  onLink?: (url: string) => void;
  onFootnote?: (label: string) => void;
  onTaskToggle?: (info: { itemIndex: number; checked: boolean }) => void;
  onCopy?: (info: { code: string; language: string }) => void;
  highlightTheme?: unknown;
  bidi?: boolean;
  /** Image display mode. Default 'placeholder' until consumer adds atlas. */
  imageDisplay?: 'auto' | 'inline' | 'placeholder';
  /** Max image height in terminal rows. */
  imageMaxHeight?: number;
  /** Enable diagram rendering (mermaid, graphviz). Default false. */
  diagrams?: boolean | { mermaid?: boolean; graphviz?: boolean };
  /** Math rendering mode. Default 'placeholder'. */
  mathRendering?: 'unicode' | 'image' | 'placeholder';
  /** Injected terminal capabilities snapshot from atlas. */
  capabilities?: TerminalCapabilities;
  /** Streaming behaviour flags. */
  streaming?: { shimmer?: boolean; partialHighlight?: boolean };
  /** View mode for semantic zoom. Default 'full'. */
  viewMode?: 'outline' | 'summary' | 'full';
  /** Respect reduced-motion preference. Default from capabilities. */
  reduceMotion?: boolean;
  /** Emit screen-reader-friendly ANSI sequences. Default from capabilities. */
  screenReaderHints?: boolean;
  /** Per-kind admonition theme overrides (AI-native kinds). */
  aiAdmonitionThemes?: Partial<Record<AdmonitionKind, AdmonitionThemeOverride>>;
  /** Live-exec host hooks (disabled when undefined). */
  liveExec?: LiveExecHostHooks;
  /** Telemetry sink (zero-overhead when undefined). */
  telemetry?: TelemetrySink;
}
