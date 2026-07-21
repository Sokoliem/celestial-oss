/**
 * Diagnostic markers + inlay chips — host-supplied overlays that
 * spectrum can render on top of tokenized output.
 *
 * Provider interfaces mirror parallax's `BlameProvider` pattern:
 * async, returning a flat array. Hosts implement the providers
 * (LSP bridges, custom linters, AI assistants); spectrum stays
 * decoupled from any particular protocol.
 *
 * v1 rendering rules:
 *   - Diagnostics append a compact, curly-underlined companion span for
 *     `[col, col+len)`, followed by severity and message text.
 *   - Inlay chips append as dim italic ghost text in source-column order.
 *
 * Both renderers fall through to plain text on terminals that don't
 * support styled underlines or italic.
 */

import { color, style } from '@celestial/corona';

// ── Severity / kind ─────────────────────────────────────────────────────

export type DiagnosticSeverity = 'error' | 'warn' | 'info';

export type InlayKind = 'type' | 'param' | 'value';

// ── Marker / chip types ─────────────────────────────────────────────────

export interface DiagnosticMarker {
  /** 0-based source line. */
  readonly line: number;
  /** 0-based starting column. */
  readonly col: number;
  /** Length in characters of the underlined range. Minimum 1. */
  readonly len: number;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  /** Optional source identifier (e.g. 'tsserver', 'eslint'). */
  readonly source?: string;
  /** Optional machine-readable code (e.g. 'TS2304'). */
  readonly code?: string;
}

export interface InlayChip {
  /** 0-based source line. */
  readonly line: number;
  /** 0-based column where the chip is anchored. */
  readonly col: number;
  readonly text: string;
  readonly kind: InlayKind;
}

// ── Provider interfaces ─────────────────────────────────────────────────

/**
 * Diagnostics provider. Receives an opaque `uri` (a path, document id,
 * or any token the caller and provider agreed on) and returns the
 * current diagnostic markers for it. Async by design — most real
 * providers (LSP, network linters) are async.
 */
export type DiagnosticProvider = (uri: string) => Promise<readonly DiagnosticMarker[]>;

export type InlayProvider = (uri: string) => Promise<readonly InlayChip[]>;

// ── Severity priority ───────────────────────────────────────────────────

const SEVERITY_PRIORITY: Record<DiagnosticSeverity, number> = {
  error: 0,
  warn: 1,
  info: 2,
};
const MAX_OVERLAYS_PER_LINE = 10_000;

function isSeverity(value: unknown): value is DiagnosticSeverity {
  return value === 'error' || value === 'warn' || value === 'info';
}

function isSafeLine(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Of the diagnostics on a line, pick the highest-severity one. Used
 * by gutter renderers that show a single sigil per line.
 */
export function pickHighestSeverity(markers: readonly DiagnosticMarker[]): DiagnosticMarker | undefined {
  let best: DiagnosticMarker | undefined;
  for (const marker of markers.slice(0, MAX_OVERLAYS_PER_LINE)) {
    if (!isSeverity(marker.severity)) continue;
    if (!best || SEVERITY_PRIORITY[marker.severity] < SEVERITY_PRIORITY[best.severity]) best = marker;
  }
  return best;
}

// ── Grouping helpers ────────────────────────────────────────────────────

export function groupDiagnosticsByLine(markers: readonly DiagnosticMarker[]): ReadonlyMap<number, DiagnosticMarker[]> {
  const map = new Map<number, DiagnosticMarker[]>();
  for (const m of markers.slice(0, MAX_OVERLAYS_PER_LINE)) {
    if (!isSafeLine(m.line) || !isSeverity(m.severity)) continue;
    const list = map.get(m.line);
    if (list) list.push(m);
    else map.set(m.line, [m]);
  }
  return map;
}

export function groupInlaysByLine(chips: readonly InlayChip[]): ReadonlyMap<number, InlayChip[]> {
  const map = new Map<number, InlayChip[]>();
  for (const c of chips.slice(0, MAX_OVERLAYS_PER_LINE)) {
    if (!isSafeLine(c.line)) continue;
    const list = map.get(c.line);
    if (list) list.push(c);
    else map.set(c.line, [c]);
  }
  return map;
}

// ── Default styling ─────────────────────────────────────────────────────

/**
 * Default per-severity color for the curly underline. Using ANSI 16
 * names so this works on any terminal with truecolor or 256-color.
 */
export const DEFAULT_SEVERITY_COLORS: Record<DiagnosticSeverity, (t: string) => string> = {
  error: (t) => style({ color: color.brightRed }).render(t),
  warn: (t) => style({ color: color.brightYellow }).render(t),
  info: (t) => style({ color: color.brightCyan }).render(t),
};

/** Default styling applied to inlay-chip text. Dim italic. */
export const DEFAULT_INLAY_STYLE = (t: string): string => style({ dim: true, italic: true }).render(t);

// ── Per-line rendering helper ───────────────────────────────────────────

export interface OverlayRenderOptions {
  /** Custom severity → render function. Falls back to defaults. */
  readonly severityColors?: Partial<Record<DiagnosticSeverity, (t: string) => string>>;
  /** Custom inlay-text styling. Defaults to dim italic. */
  readonly inlayStyle?: (text: string) => string;
  /**
   * Whether to emit the curly-underline ANSI sequence (CSI 4:3 m) for
   * diagnostics. Default `true`. Set `false` for terminals that render
   * the sequence as garbled bytes.
   */
  readonly curlyUnderline?: boolean;
  /** Bracketing characters around inlay chips. Default `['', '']` (no brackets). */
  readonly inlayBracket?: readonly [string, string];
}

const CURLY_UNDERLINE_ON = '\x1b[4:3m';
const UNDERLINE_OFF = '\x1b[24m';

/**
 * Render an already-styled line with diagnostic underlines and inlay
 * chips overlaid. Operates on the *visible* text of the line — callers
 * typically pass the line's source text, but a pre-styled string also
 * works as long as `lineText` is provided so column math stays right.
 *
 * Algorithm:
 *   1. Split the visible text at every "interesting" column (any inlay
 *      anchor; any diagnostic start/end).
 *   2. Walk segments, applying diagnostic curly-underline to segments
 *      that fall inside a marker's range, and emitting inlay chips
 *      after the segments they anchor to.
 *
 * Returns a fresh styled string with overlays applied.
 */
export function applyOverlaysToLine(
  styledText: string,
  lineText: string,
  diagnostics: readonly DiagnosticMarker[],
  inlays: readonly InlayChip[],
  opts?: OverlayRenderOptions,
): string {
  if (diagnostics.length === 0 && inlays.length === 0) return styledText;

  const useCurly = opts?.curlyUnderline ?? true;
  const sevColors = { ...DEFAULT_SEVERITY_COLORS, ...opts?.severityColors };
  const inlayStyle = opts?.inlayStyle ?? DEFAULT_INLAY_STYLE;
  const [openBrk, closeBrk] = opts?.inlayBracket ?? ['', ''];

  // The styled text contains ANSI escapes; column math must be done on
  // visible characters. We preserve the original styled prefix, then
  // append our overlays at the *end* of the line — diagnostics still
  // apply visually because curly-underline is rendered on top of
  // existing color, and inlays are appended.
  //
  // For v1 we keep the implementation straightforward: pass `styledText`
  // through unchanged and append per-line overlay output. Mid-line
  // underline application requires splitting `styledText` at visible
  // columns, which is tractable but heavier; flag for a future
  // iteration.

  let out = styledText;

  // Diagnostics: emit a single segment showing each marker's underlined
  // range as a separate styled span appended in inlay style after the
  // line. This preserves the original line and surfaces the marker text
  // without column splicing.
  const diagSegments: string[] = [];
  for (const d of diagnostics.slice(0, MAX_OVERLAYS_PER_LINE)) {
    if (!isSeverity(d.severity) || !Number.isFinite(d.col) || !Number.isFinite(d.len)) continue;
    const col = Math.floor(d.col);
    const len = Math.max(1, Math.floor(d.len));
    const start = Math.max(0, Math.min(lineText.length, col));
    const end = Math.max(start, Math.min(lineText.length, col + len));
    const span = lineText.slice(start, end);
    const colorise = sevColors[d.severity] ?? DEFAULT_SEVERITY_COLORS[d.severity];
    const underlined = useCurly ? `${CURLY_UNDERLINE_ON}${colorise(span)}${UNDERLINE_OFF}` : colorise(span);
    diagSegments.push(`${underlined} ${inlayStyle(`(${d.severity}: ${d.message})`)}`);
  }

  if (diagSegments.length > 0) {
    out += '  ' + diagSegments.join('  ');
  }

  // Inlays: append at end of line (sorted by column for stable order).
  const sortedInlays = inlays
    .slice(0, MAX_OVERLAYS_PER_LINE)
    .filter((chip) => Number.isFinite(chip.col) && typeof chip.text === 'string')
    .sort((a, b) => a.col - b.col);
  for (const chip of sortedInlays) {
    out += '  ' + inlayStyle(`${openBrk}${chip.text}${closeBrk}`);
  }

  return out;
}
