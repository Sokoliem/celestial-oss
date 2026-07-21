/**
 * Corona — Domain Token Extensibility
 *
 * Pre-built token groups for common app domains (status indicators, git
 * operations, cost levels, syntax highlighting, diffs). Each group is a
 * `DomainTokenContract` — an object mapping token names to resolver
 * functions `(theme: SemanticTheme) => T`.
 *
 * Apps compose these with `resolveDomainTokens(contract, theme, overrides?)`
 * to get concrete values. Unlike constellation's `TokenContract` (which is
 * coupled to the component override system), domain tokens are standalone
 * and composable via spread:
 *
 * ```ts
 * const myTokens = defineDomainTokens({
 *   ...statusTokens,
 *   ...gitTokens,
 *   custom: (t) => t.colors.tones.accent,
 * });
 * ```
 *
 * This is intentionally a separate API from `ThemeInput`/`SemanticTheme` —
 * domain tokens live outside the theme definition, keeping `ThemeInput`
 * focused on visual tokens.
 */

import { type Color, color } from './color.js';
import type { StyleEffects } from './style.js';
import type { ElevationBorderStyle, SemanticTheme } from './theme.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * A domain token contract: maps token names to resolver functions.
 * Same shape as `TokenContract<T>` from ./tokens.ts, but conceptually
 * distinct — these are for app-level domain semantics, not component styling.
 */
export type DomainTokenContract<T> = {
  [K in keyof T]: (theme: SemanticTheme) => T[K];
};

/**
 * Resolved output of a `DomainTokenContract` — concrete values for each key.
 */
export type ResolvedDomainTokens<C extends DomainTokenContract<any>> = {
  [K in keyof C]: C[K] extends (theme: SemanticTheme) => infer R ? R : never;
};

// ─── Factory & Resolution ───────────────────────────────────────────────────

/**
 * A glyph triple for a domain token family value. `level1` is the ASCII /
 * "none" fallback, `level2` is the basic Unicode rendition, `level3` is the
 * wide/nerd-font rendition (matches the existing `GlyphLevel` fallback chain
 * used by `resolveGlyph`).
 */
export interface DomainTokenGlyph {
  readonly level1: string;
  readonly level2: string;
  readonly level3: string;
}

/**
 * A token family groups a finite enum of semantic values (e.g. "slash"/"skill"
 * in sourceTokens, "read"/"write" in permissionTokens) optionally paired with
 * a glyph triple per value.
 *
 * The family is an alternative shape to `DomainTokenContract` — the contract
 * version maps names to theme-resolver functions (colors, typography), while
 * a family expresses a closed vocabulary consumed by views that need badges
 * / glyphs / pattern matching over the value set.
 */
export interface DomainTokenFamilyInput<V extends string> {
  readonly name: string;
  readonly values: readonly V[];
  readonly glyphs?: Readonly<Record<V, DomainTokenGlyph>>;
}

export interface DomainTokenFamily<V extends string> {
  readonly name: string;
  readonly values: readonly V[];
  readonly glyphs: Readonly<Record<V, DomainTokenGlyph>> | null;
  /** Runtime-narrow: true if `candidate` is one of the family values. */
  readonly isValue: (candidate: unknown) => candidate is V;
}

/**
 * Identity function that provides type inference for domain token contracts,
 * or a helper that canonicalises a domain token family when called with the
 * `{ name, values, glyphs }` shape.
 *
 * ```ts
 * // Contract form (legacy, resolver-based):
 * const myTokens = defineDomainTokens({
 *   primary: (t) => t.colors.tones.accent,
 *   secondary: (t) => t.colors.muted,
 * });
 *
 * // Family form (value-enum with glyph triples):
 * const sourceTokens = defineDomainTokens({
 *   name: 'source',
 *   values: ['slash', 'skill'] as const,
 *   glyphs: { slash: { level1: '/', level2: '/', level3: '/' }, ... },
 * });
 * ```
 *
 * The two shapes are disambiguated at runtime by the presence of `name` +
 * `values` keys on the argument; the contract form cannot collide because
 * every contract entry is a function, not an array of strings.
 */
export function defineDomainTokens<T>(contract: DomainTokenContract<T>): DomainTokenContract<T>;
export function defineDomainTokens<V extends string>(family: DomainTokenFamilyInput<V>): DomainTokenFamily<V>;
export function defineDomainTokens(input: unknown): unknown {
  if (isTokenFamilyInput(input)) {
    const { name, values, glyphs } = input;
    const valueSet = new Set<string>(values);
    return {
      name,
      values: [...values] as readonly string[],
      glyphs: glyphs ?? null,
      isValue: (candidate: unknown): candidate is string => typeof candidate === 'string' && valueSet.has(candidate),
    } as DomainTokenFamily<string>;
  }
  return input as DomainTokenContract<unknown>;
}

function isTokenFamilyInput(value: unknown): value is DomainTokenFamilyInput<string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { name?: unknown }).name === 'string' &&
    Array.isArray((value as { values?: unknown }).values) &&
    (value as { values: unknown[] }).values.every((entry) => typeof entry === 'string')
  );
}

/**
 * Resolve one value of a token family to its best glyph for a renderer's
 * supported level. If the requested level is empty, falls back to the next
 * lower level (3 → 2 → 1) so callers always get a non-empty glyph when one
 * is available at any level — this matches the graceful-degrade philosophy
 * of `resolveGlyph` for the broader 4-level system. Returns an empty string
 * only when the family has no glyphs at all (e.g. `permissionTokens`, where
 * glyphs are intentionally omitted).
 */
export function resolveFamilyGlyph<V extends string>(family: DomainTokenFamily<V>, value: V, level: 1 | 2 | 3): string {
  if (family.glyphs === null) {
    return '';
  }
  const glyph = family.glyphs[value];
  if (level >= 3 && glyph.level3 !== '') return glyph.level3;
  if (level >= 2 && glyph.level2 !== '') return glyph.level2;
  return glyph.level1;
}

/**
 * Resolve a domain token contract against a theme, with optional overrides.
 *
 * ```ts
 * const resolved = resolveDomainTokens(statusTokens, theme, {
 *   danger: color.hex('#ff0000'),
 * });
 * ```
 */
export function resolveDomainTokens<T>(contract: DomainTokenContract<T>, theme: SemanticTheme, overrides?: Partial<T>): T {
  const result = {} as T;
  for (const key of Object.keys(contract) as (keyof T & string)[]) {
    if (overrides && key in overrides && overrides[key] !== undefined) {
      result[key] = overrides[key] as T[typeof key];
    } else {
      result[key] = contract[key](theme) as T[typeof key];
    }
  }
  return result;
}

// ─── Built-in Domain Token Groups ───────────────────────────────────────────

// --- Status indicators ---

export interface StatusTokenValues {
  success: Color;
  warning: Color;
  danger: Color;
  info: Color;
  /** Awaiting input or queued — pre-running. Resolves to muted by default. */
  pending: Color;
  /** Currently executing. Resolves to the accent tone (matches `lifecycleTokens.inflight`). */
  running: Color;
  /** User-rejected or policy-blocked. Sits between warning and danger. */
  denied: Color;
}

/**
 * Status indicator colors: success, warning, danger, info, plus the
 * Wave-0 additive triplet `pending` / `running` / `denied` consumed by
 * `toolCallCard`, `permissionPrompt`, and `activityTimeline`.
 *
 * The lifecycle vocabulary in `lifecycleTokens` covers the full execution
 * state machine (queued/inflight/suspended/.../retrying); `statusTokens`
 * stays focused on the severity surface a glance card needs.
 */
export const statusTokens: DomainTokenContract<StatusTokenValues> = defineDomainTokens({
  success: (t) => t.colors.tones.success,
  warning: (t) => t.colors.tones.warning,
  danger: (t) => t.colors.tones.danger,
  info: (t) => t.colors.tones.info,
  pending: (t) => t.colors.muted,
  running: (t) => t.colors.tones.accent,
  denied: (t) => color.mix(t.colors.tones.warning, t.colors.tones.danger, 0.4),
});

// --- Git operations ---

export interface GitTokenValues {
  added: Color;
  modified: Color;
  deleted: Color;
  renamed: Color;
  untracked: Color;
  branch: Color;
}

/**
 * Git status colors: added (green), modified (yellow), deleted (red),
 * renamed (blue/info), untracked (muted), branch (accent).
 */
export const gitTokens: DomainTokenContract<GitTokenValues> = defineDomainTokens({
  added: (t) => t.colors.tones.success,
  modified: (t) => t.colors.tones.warning,
  deleted: (t) => t.colors.tones.danger,
  renamed: (t) => t.colors.tones.info,
  untracked: (t) => t.colors.muted,
  branch: (t) => t.colors.tones.accent,
});

// --- Cost levels ---

export interface CostTokenValues {
  low: Color;
  mid: Color;
  high: Color;
}

/**
 * Cost/severity level colors: low (green), mid (yellow), high (red).
 */
export const costTokens: DomainTokenContract<CostTokenValues> = defineDomainTokens({
  low: (t) => t.colors.tones.success,
  mid: (t) => t.colors.tones.warning,
  high: (t) => t.colors.tones.danger,
});

// --- Safety / confirmation levels ---

export interface SafetyTokenValues {
  safe: Color;
  caution: Color;
  destructive: Color;
  irreversible: Color;
}

/**
 * Safety severity colors for user-facing confirmation ladders.
 *
 * `destructive` intentionally lands between warning and danger so it reads
 * as "confirm first" rather than "hard failure".
 */
export const safetyTokens: DomainTokenContract<SafetyTokenValues> = defineDomainTokens({
  safe: (t) => t.colors.tones.success,
  caution: (t) => t.colors.tones.warning,
  destructive: (t) => color.mix(t.colors.tones.warning, t.colors.tones.danger, 0.35),
  irreversible: (t) => t.colors.tones.danger,
});

/**
 * Literal union over the safety ladder in `safetyTokens`. Phase A/B/C library
 * entries carry a `safety` field of this type; Phase B's safety gate fans out
 * on it. Exposed as a named type so consumer TypeScript code (wrapper, tests)
 * stays in lockstep with the `SafetyTokenValues` contract keys.
 */
export type SafetyTokenValue = keyof SafetyTokenValues;

// --- Invocation lifecycle ---

export interface LifecycleTokenValues {
  pending: Color;
  inflight: Color;
  suspended: Color;
  succeeded: Color;
  failed: Color;
  cancelled: Color;
  retrying: Color;
}

/**
 * Canonical colors for invocation and execution lifecycle states.
 *
 * These are safe to use anywhere an execution's current state needs to be
 * surfaced, including manifest renderers, plugin UIs, and replay views.
 */
export const lifecycleTokens: DomainTokenContract<LifecycleTokenValues> = defineDomainTokens({
  pending: (t) => t.colors.muted,
  inflight: (t) => t.colors.tones.accent,
  suspended: (t) => t.colors.tones.warning,
  succeeded: (t) => t.colors.tones.success,
  failed: (t) => t.colors.tones.danger,
  cancelled: (t) => t.colors.textSoft,
  retrying: (t) => t.colors.tones.info,
});

// --- Syntax highlighting ---

export interface SyntaxTokenValues {
  keyword: Color;
  string: Color;
  number: Color;
  comment: Color;
  operator: Color;
  function: Color;
  type: Color;
}

/**
 * Syntax highlighting token colors. Uses the theme's tone palette to
 * provide reasonable defaults; apps should override for custom schemes.
 */
export const syntaxTokens: DomainTokenContract<SyntaxTokenValues> = defineDomainTokens({
  keyword: (t) => t.colors.tones.accent,
  string: (t) => t.colors.tones.success,
  number: (t) => t.colors.tones.warning,
  comment: (t) => t.colors.muted,
  operator: (t) => t.colors.text,
  function: (t) => t.colors.tones.info,
  type: (t) => t.colors.tones.accent,
});

// --- ANSI 16-color palette ---

export interface AnsiPaletteTokenValues {
  black: Color;
  red: Color;
  green: Color;
  yellow: Color;
  blue: Color;
  magenta: Color;
  cyan: Color;
  white: Color;
  /** Aliased as ANSI "bright black" (SGR 90); kept under the `gray` name to match corona's built-in palette. */
  gray: Color;
  brightRed: Color;
  brightGreen: Color;
  brightYellow: Color;
  brightBlue: Color;
  brightMagenta: Color;
  brightCyan: Color;
  brightWhite: Color;
}

/**
 * Canonical 16-color ANSI palette as a domain token. Consumers that render
 * raw ANSI output (terminal emulators, ANSI-styled code blocks, log viewers)
 * resolve these instead of importing `color.red`/`color.green`/... directly.
 *
 * Default resolvers ignore the theme and return corona's built-in ANSI colors
 * so out-of-the-box rendering matches what the producing program expects —
 * `printf '\\033[31mfoo'` still looks red. Apps with bespoke contrast needs
 * can override individual entries via `resolveDomainTokens`:
 *
 * ```ts
 * const palette = resolveDomainTokens(ansiPaletteTokens, theme, {
 *   red: theme.colors.tones.danger,
 * });
 * ```
 */
export const ansiPaletteTokens: DomainTokenContract<AnsiPaletteTokenValues> = defineDomainTokens({
  black: () => color.black,
  red: () => color.red,
  green: () => color.green,
  yellow: () => color.yellow,
  blue: () => color.blue,
  magenta: () => color.magenta,
  cyan: () => color.cyan,
  white: () => color.white,
  gray: () => color.gray,
  brightRed: () => color.brightRed,
  brightGreen: () => color.brightGreen,
  brightYellow: () => color.brightYellow,
  brightBlue: () => color.brightBlue,
  brightMagenta: () => color.brightMagenta,
  brightCyan: () => color.brightCyan,
  brightWhite: () => color.brightWhite,
});

// --- Diff view ---

export interface DiffTokenValues {
  added: Color;
  removed: Color;
  context: Color;
  header: Color;
}

/**
 * Diff view colors: added lines, removed lines, context (unchanged), header.
 */
export const diffTokens: DomainTokenContract<DiffTokenValues> = defineDomainTokens({
  added: (t) => t.colors.tones.success,
  removed: (t) => t.colors.tones.danger,
  context: (t) => t.colors.muted,
  header: (t) => t.colors.tones.accent,
});

// --- Elevation (surface depth) ---

/**
 * One resolved elevation step: surface bg, border tint, plus render hints
 * for shadow weight (0..4) and backdrop blur strength (0..1). Renderers
 * map these to box-shadow / cell-shading / CSS backdrop-filter; TUI
 * renderers ignore `backdropBlur`.
 */
export interface ElevationStepTokens {
  /** Background surface color at this elevation. */
  background: Color;
  /** Border color at this elevation. */
  border: Color;
  /** Border style (none/single/double/rounded/heavy). */
  borderStyle: ElevationBorderStyle;
  /** Render hint 0–4 (0 = no shadow, 4 = deepest). */
  shadowDepth: number;
  /** 0–1 backdrop blur strength; ignored by TUI renderers. */
  backdropBlur: number;
  /** Numeric depth (0..16) inherited from `theme.elevation[<level>].elevation`. */
  elevation: number;
  /** Optional style effects (glass, opacity) carried over from the theme. */
  effects?: StyleEffects;
}

/**
 * Five-level elevation scale, ordered from `level1` (flat) to `level5`
 * (modal). Numeric keys (`level1..level5`) and semantic keys
 * (`flat/raised/floating/overlay/modal`) are exposed in parallel via
 * `elevationTokens` and `elevationTokensByLevel` respectively, so callers
 * can pick whichever vocabulary fits.
 */
export interface ElevationTokenValues {
  level1: ElevationStepTokens;
  level2: ElevationStepTokens;
  level3: ElevationStepTokens;
  level4: ElevationStepTokens;
  level5: ElevationStepTokens;
}

/** Numeric → render-hint table. Higher level = deeper shadow + more blur. */
const ELEVATION_HINTS: Readonly<Record<keyof ElevationTokenValues, { shadowDepth: number; backdropBlur: number }>> = {
  level1: { shadowDepth: 0, backdropBlur: 0 },
  level2: { shadowDepth: 1, backdropBlur: 0 },
  level3: { shadowDepth: 2, backdropBlur: 0.1 },
  level4: { shadowDepth: 3, backdropBlur: 0.15 },
  level5: { shadowDepth: 4, backdropBlur: 0.2 },
};

function elevationStep(t: SemanticTheme, key: 'flat' | 'raised' | 'floating' | 'overlay' | 'modal', levelKey: keyof ElevationTokenValues): ElevationStepTokens {
  const layer = t.elevation[key];
  const hints = ELEVATION_HINTS[levelKey];
  return {
    background: layer.surface ?? t.colors.surface,
    border: layer.border ?? t.colors.border,
    borderStyle: layer.borderStyle ?? 'single',
    shadowDepth: hints.shadowDepth,
    backdropBlur: hints.backdropBlur,
    elevation: layer.elevation,
    effects: layer.effects,
  };
}

/**
 * Numeric-keyed elevation contract. Use this for primitive Configs that
 * accept a numeric depth (`elevation: 'level3'`).
 */
export const elevationTokens: DomainTokenContract<ElevationTokenValues> = defineDomainTokens({
  level1: (t) => elevationStep(t, 'flat', 'level1'),
  level2: (t) => elevationStep(t, 'raised', 'level2'),
  level3: (t) => elevationStep(t, 'floating', 'level3'),
  level4: (t) => elevationStep(t, 'overlay', 'level4'),
  level5: (t) => elevationStep(t, 'modal', 'level5'),
});

/**
 * Semantic-keyed elevation contract — same data, exposed under the
 * existing `flat/raised/floating/overlay/modal` vocabulary so primitives
 * that prefer named depth keep working. `elevationTokens` and
 * `elevationTokensBySemantic` are 1:1 by construction.
 */
export interface ElevationTokenValuesBySemantic {
  flat: ElevationStepTokens;
  raised: ElevationStepTokens;
  floating: ElevationStepTokens;
  overlay: ElevationStepTokens;
  modal: ElevationStepTokens;
}

export const elevationTokensBySemantic: DomainTokenContract<ElevationTokenValuesBySemantic> = defineDomainTokens({
  flat: (t) => elevationStep(t, 'flat', 'level1'),
  raised: (t) => elevationStep(t, 'raised', 'level2'),
  floating: (t) => elevationStep(t, 'floating', 'level3'),
  overlay: (t) => elevationStep(t, 'overlay', 'level4'),
  modal: (t) => elevationStep(t, 'modal', 'level5'),
});

/** Stable ordering, lowest depth first. */
export const ELEVATION_LEVEL_KEYS: readonly (keyof ElevationTokenValues)[] = ['level1', 'level2', 'level3', 'level4', 'level5'] as const;

// --- Cursor (streaming-text caret) ---

/**
 * Cursor color contract for streaming-text caret. `fill` is the cursor
 * color when "on" in its blink cycle; `off` is the surface color it
 * blends into when "off". `rule` is the underscore-style cursor color.
 */
export interface CursorTokenValues {
  fill: Color;
  rule: Color;
  off: Color;
}

export const cursorTokens: DomainTokenContract<CursorTokenValues> = defineDomainTokens({
  fill: (t) => t.colors.cursor,
  rule: (t) => t.colors.cursor,
  off: (t) => t.colors.surface,
});

/**
 * Cursor visual style: drives renderer geometry (block / underscore /
 * pulse / none). Shipped as a `DomainTokenFamily<V>` so renderers can
 * use `resolveFamilyGlyph(cursorStyleTokens, value, level)` to pick the
 * right glyph for the renderer's Unicode level.
 */
export type CursorStyleValue = 'block' | 'underscore' | 'pulse' | 'none';

export const cursorStyleTokens: DomainTokenFamily<CursorStyleValue> = defineDomainTokens({
  name: 'cursor-style',
  values: ['block', 'underscore', 'pulse', 'none'] as const,
  glyphs: {
    block: { level1: '#', level2: '█', level3: '█' },
    underscore: { level1: '_', level2: '▁', level3: '▁' },
    pulse: { level1: '*', level2: '■', level3: '●' },
    none: { level1: '', level2: '', level3: '' },
  },
});

// --- Source discriminator (origin of a library entry) ---

/**
 * Literal union of every provenance value surfaced by the library browser.
 *
 * The enum is intentionally closed: views render a source badge via
 * `sourceTokens.glyphs[value]` and rely on exhaustiveness to catch drift
 * when a new provenance kind lands.
 */
export type SourceTokenValue = 'slash' | 'skill' | 'mcp' | 'plugin' | 'builtin' | 'generated';

/**
 * Tuple form of the provenance values (Phase C additive). Useful for
 * renderers that iterate a stable ordering without reaching into
 * `sourceTokens.values`.
 */
export const SOURCE_TOKEN_VALUES: readonly SourceTokenValue[] = ['slash', 'skill', 'mcp', 'plugin', 'builtin', 'generated'] as const;

/**
 * Phase C colour record — per-source accent colour keyed by `SourceTokenValue`.
 * Exposed as a `DomainTokenContract<SourceTokenValues>` via
 * `sourceColorTokens` (see below); the legacy `sourceTokens` keeps its
 * `DomainTokenFamily<V>` shape so A/B callsites (`.isValue`, `.glyphs`,
 * `.values`) continue to work.
 */
export interface SourceTokenValues {
  slash: Color;
  skill: Color;
  mcp: Color;
  plugin: Color;
  builtin: Color;
  generated: Color;
}

/**
 * Per-source accent colour contract (Phase C additive). Phase A/B render
 * badges from the `sourceTokens` family; Phase F may migrate to consuming
 * this colour contract directly.
 */
export const sourceColorTokens: DomainTokenContract<SourceTokenValues> = defineDomainTokens({
  slash: (t) => t.colors.tones.accent,
  skill: (t) => t.colors.tones.info,
  mcp: (t) => t.colors.tones.success,
  plugin: (t) => t.colors.tones.warning,
  builtin: (t) => t.colors.text,
  generated: (t) => t.colors.tones.accent,
});

/**
 * Glyph map for source discriminators (Phase C additive). Mirrors the
 * glyph table inside `sourceTokens.glyphs` but exposed as a standalone
 * const so renderers can reference it without destructuring the family.
 */
export const SOURCE_GLYPHS: Readonly<Record<SourceTokenValue, { level1: string; level2: string; level3: string }>> = {
  slash: { level1: '/', level2: '/', level3: '/' },
  skill: { level1: 'S', level2: '▲', level3: '▲' },
  mcp: { level1: 'M', level2: '◇', level3: '◇' },
  plugin: { level1: 'P', level2: '◎', level3: '◎' },
  builtin: { level1: 'B', level2: '●', level3: '●' },
  generated: { level1: 'G', level2: '✦', level3: '✦' },
};

/**
 * Domain token family for the provenance of a library entry. Consumed by the
 * sidebar library tree (Phase A), preview panel (Phase B), recents/pins badge
 * rendering (Phase C), and the manifest catalog era (Phase F+).
 */
export const sourceTokens: DomainTokenFamily<SourceTokenValue> = defineDomainTokens({
  name: 'source',
  values: ['slash', 'skill', 'mcp', 'plugin', 'builtin', 'generated'] as const,
  glyphs: SOURCE_GLYPHS,
});

// --- Permission (reserved for Phase F permission preview) ---

/**
 * Literal union of permission roles a library entry can request. Phase A/B/C
 * only consume the role *names* (e.g. rendering a "requires: network" hint);
 * Phase F+ will extend this family with glyphs and per-theme colouring for
 * the permission preview surface.
 */
export type PermissionTokenValue = 'none' | 'read' | 'write' | 'invoke' | 'network' | 'destructive';

/** Tuple form of the permission values (Phase C additive). */
export const PERMISSION_TOKEN_VALUES: readonly PermissionTokenValue[] = ['none', 'read', 'write', 'invoke', 'network', 'destructive'] as const;

/**
 * Phase C colour record — per-permission accent colour keyed by
 * `PermissionTokenValue`. Exposed as a `DomainTokenContract<PermissionTokenValues>`
 * via `permissionColorTokens`; the legacy `permissionTokens` keeps its
 * `DomainTokenFamily<V>` shape.
 */
export interface PermissionTokenValues {
  none: Color;
  read: Color;
  write: Color;
  invoke: Color;
  network: Color;
  destructive: Color;
}

/**
 * Per-permission colour contract (Phase C additive). Colors are
 * placeholder-sensible; Phase F owns the final palette + glyphs.
 */
export const permissionColorTokens: DomainTokenContract<PermissionTokenValues> = defineDomainTokens({
  none: (t) => t.colors.muted,
  read: (t) => t.colors.tones.info,
  write: (t) => t.colors.tones.warning,
  invoke: (t) => t.colors.tones.accent,
  network: (t) => t.colors.tones.info,
  destructive: (t) => t.colors.tones.danger,
});

export const permissionTokens: DomainTokenFamily<PermissionTokenValue> = defineDomainTokens({
  name: 'permission',
  values: ['none', 'read', 'write', 'invoke', 'network', 'destructive'] as const,
  // Glyphs intentionally omitted — reserved for Phase F. resolveFamilyGlyph()
  // returns '' for a glyph-less family so consumers can safely call it without
  // a capability check.
});

// --- Shared chrome semantics ---

export interface ChromeTokenValues {
  overlaySurface: Color;
  overlayDetailSurface: Color;
  overlayBorder: Color;
  menuSurface: Color;
  menuText: Color;
  menuMuted: Color;
  rowHoverSurface: Color;
  rowHoverText: Color;
  rowSelectedSurface: Color;
  rowSelectedText: Color;
  pin: Color;
}

export interface AppChromeTokenValues {
  appBackground: Color;
  panelSurface: Color;
  panelSurfaceAlt: Color;
  panelBorder: Color;
  panelBorderFocused: Color;
  overlaySurface: Color;
  overlayDetailSurface: Color;
  overlayBorder: Color;
  overlayText: Color;
  menuSurface: Color;
  menuText: Color;
  menuMuted: Color;
  rowHoverSurface: Color;
  rowHoverText: Color;
  rowSelectedSurface: Color;
  rowSelectedText: Color;
  badgeSurface: Color;
  badgeText: Color;
  focusRing: Color;
  resizeHandle: Color;
}

/**
 * Glyph used by the sidebar library pin badge (chromeTokens `pin` role).
 * The ASCII level uses `P`; Unicode-capable tiers use the pin mark.
 */
export const CHROME_PIN_GLYPH: Readonly<{ level1: string; level2: string; level3: string }> = Object.freeze({
  level1: 'P',
  level2: '⚲',
  level3: '⚲',
});

function pickReadableForeground(background: Color, preferred: Color, fallback: Color): Color {
  return color.contrastRatio(preferred, background) >= 4.5 ? preferred : fallback;
}

/**
 * Shared wrapper/TUI chrome semantics for overlays, menus, and row states.
 * These stay semantic on purpose: apps can tint them with product accents
 * without re-owning the underlying surface vocabulary.
 */
export const chromeTokens: DomainTokenContract<ChromeTokenValues> = defineDomainTokens({
  overlaySurface: (t) => t.elevation.modal.surface ?? t.colors.surfaceRaised,
  overlayDetailSurface: (t) => t.elevation.floating.surface ?? t.colors.surfaceAlt,
  overlayBorder: (t) => t.elevation.modal.border ?? t.colors.borderActive,
  menuSurface: (t) => t.elevation.floating.surface ?? color.mix(t.colors.surfaceRaised, t.colors.backdrop, 0.18),
  menuText: (t) => t.colors.text,
  menuMuted: (t) => t.colors.muted,
  rowHoverSurface: (t) => t.states.hover.bg ?? color.mix(t.colors.surface, t.colors.surfaceRaised, 0.72),
  rowHoverText: (t) => t.states.hover.fg ?? t.colors.text,
  rowSelectedSurface: (t) => t.states.selected.bg ?? color.mix(t.colors.surface, t.colors.highlight, 0.18),
  rowSelectedText: (t) => {
    const background = t.states.selected.bg ?? color.mix(t.colors.surface, t.colors.highlight, 0.18);
    const preferred = t.states.selected.fg ?? t.colors.text;
    const fallback = pickReadableForeground(background, t.colors.inverse, t.colors.text);
    return pickReadableForeground(background, preferred, fallback);
  },
  pin: (t) => t.colors.tones.accent,
});

/**
 * Expanded flagship-app chrome vocabulary for wrappers, launchers, and dense
 * operational TUIs. This keeps app-level surfaces semantic while retaining the
 * smaller `chromeTokens` contract for existing consumers.
 */
export const appChromeTokens: DomainTokenContract<AppChromeTokenValues> = defineDomainTokens({
  appBackground: (t) => t.colors.bg,
  panelSurface: (t) => t.colors.surface,
  panelSurfaceAlt: (t) => t.colors.surfaceAlt,
  panelBorder: (t) => t.colors.border,
  panelBorderFocused: (t) => t.colors.borderActive,
  overlaySurface: (t) => t.elevation.modal.surface ?? t.colors.surfaceRaised,
  overlayDetailSurface: (t) => t.elevation.floating.surface ?? t.colors.surfaceAlt,
  overlayBorder: (t) => t.elevation.modal.border ?? t.colors.borderActive,
  overlayText: (t) => {
    const background = t.elevation.modal.surface ?? t.colors.surfaceRaised;
    return pickReadableForeground(background, t.colors.text, t.colors.inverse);
  },
  menuSurface: (t) => t.elevation.floating.surface ?? color.mix(t.colors.surfaceRaised, t.colors.backdrop, 0.18),
  menuText: (t) => {
    const background = t.elevation.floating.surface ?? color.mix(t.colors.surfaceRaised, t.colors.backdrop, 0.18);
    return pickReadableForeground(background, t.colors.text, t.colors.inverse);
  },
  menuMuted: (t) => {
    const background = t.elevation.floating.surface ?? color.mix(t.colors.surfaceRaised, t.colors.backdrop, 0.18);
    return pickReadableForeground(background, t.colors.muted, t.colors.text);
  },
  rowHoverSurface: (t) => t.states.hover.bg ?? color.mix(t.colors.surface, t.colors.surfaceRaised, 0.72),
  rowHoverText: (t) => t.states.hover.fg ?? t.colors.text,
  rowSelectedSurface: (t) => t.states.selected.bg ?? color.mix(t.colors.surface, t.colors.highlight, 0.18),
  rowSelectedText: (t) => {
    const background = t.states.selected.bg ?? color.mix(t.colors.surface, t.colors.highlight, 0.18);
    const preferred = t.states.selected.fg ?? t.colors.text;
    const fallback = pickReadableForeground(background, t.colors.inverse, t.colors.text);
    return pickReadableForeground(background, preferred, fallback);
  },
  badgeSurface: (t) => color.mix(t.colors.surfaceRaised, t.colors.tones.accent, 0.18),
  badgeText: (t) => {
    const background = color.mix(t.colors.surfaceRaised, t.colors.tones.accent, 0.18);
    return pickReadableForeground(background, t.colors.text, t.colors.inverse);
  },
  focusRing: (t) => t.colors.focusRing,
  resizeHandle: (t) => color.mix(t.colors.border, t.colors.tones.accent, 0.45),
});

// (Source + permission families consolidated above with Phase C additive
// consts — SOURCE_TOKEN_VALUES, SOURCE_GLYPHS, PERMISSION_TOKEN_VALUES,
// sourceColorTokens, permissionColorTokens.)

// --- Surface lifecycle state (minimize / dock / chip rail) ---

/**
 * Theme tokens for the four-affordance surface lifecycle (minimize, pin/dock,
 * refresh, state cache) added to portal's browser-mirrored surfaces. Beacon-
 * browser CSS reads these as `--celestial-surface-state-<key>` variables;
 * the unthemed fallback hex literals are kept inline in the CSS so renderers
 * stay readable even when the corona bridge is bypassed.
 */
export interface SurfaceStateTokenValues {
  /** Background fill of a minimized surface chip in the bottom rail. */
  minimizeChipBg: Color;
  /** Border around the minimized surface chip. */
  minimizeChipBorder: Color;
  /** Foreground text inside the minimized surface chip. */
  minimizeChipText: Color;
  /** Hovered chip background — the user is about to click to restore. */
  minimizeChipHoverBg: Color;
  /** Background of the bottom rail container (only painted when chips exist). */
  minimizeRailBg: Color;
  /** Top edge separator between the rail and the terminal pane above it. */
  minimizeRailBorder: Color;
  /** Tinted header strip of a docked (pinned) surface card. */
  dockHeaderBg: Color;
  /** Border colour of the docked surface card. */
  dockBorder: Color;
  /** Shadow / accent edge of the docked surface card. */
  dockShadow: Color;
}

export const surfaceStateTokens: DomainTokenContract<SurfaceStateTokenValues> = defineDomainTokens({
  // Chip — pull from the raised-elevation surface so it's distinctly lighter
  // than the rail, with an accent-mixed border that survives Tab-focus AND
  // unfocused states. Without this the chip's previous rgba(255,255,255,0.06)
  // background blended with the dark page until focus drew an outline.
  minimizeChipBg: (t) => t.elevation.raised.surface ?? t.colors.surfaceRaised,
  minimizeChipBorder: (t) => color.mix(t.colors.border, t.colors.tones.accent, 0.25),
  minimizeChipText: (t) => t.colors.text,
  minimizeChipHoverBg: (t) => color.mix(t.colors.surfaceRaised, t.colors.tones.accent, 0.22),
  // Rail — pull from the modal-elevation surface so it's clearly NOT the
  // terminal background. Previously resolved to t.colors.surface, which is
  // identical to --portal-mirror-bg, so the rail merged with the terminal
  // pane and was invisible without focus outline.
  minimizeRailBg: (t) => t.elevation.modal.surface ?? color.mix(t.colors.surface, t.colors.tones.accent, 0.06),
  minimizeRailBorder: (t) => color.mix(t.colors.border, t.colors.tones.accent, 0.5),
  // Dock chrome unchanged.
  dockHeaderBg: (t) => color.mix(t.colors.surfaceRaised, t.colors.tones.accent, 0.08),
  dockBorder: (t) => t.elevation.modal.border ?? t.colors.borderActive,
  dockShadow: (t) => color.mix(t.colors.bg, t.colors.tones.accent, 0.18),
});

// --- Phase tokens ---

import { reduceMotion as reduceMotionEnv } from './a11y.js';

export type SessionPhase = 'idle' | 'exploring' | 'planning' | 'implementing' | 'testing' | 'delegating';

export interface PhaseTokenValues {
  idle: Color;
  exploring: Color;
  planning: Color;
  implementing: Color;
  testing: Color;
  delegating: Color;
}

export const PHASE_TOKEN_VALUES: readonly SessionPhase[] = ['idle', 'exploring', 'planning', 'implementing', 'testing', 'delegating'] as const;

export const PHASE_GLYPHS: Readonly<Record<SessionPhase, DomainTokenGlyph>> = {
  idle: { level1: '.', level2: '○', level3: '' },
  exploring: { level1: '?', level2: '◇', level3: '' },
  planning: { level1: '*', level2: '◆', level3: '' },
  implementing: { level1: '+', level2: '▸', level3: '' },
  testing: { level1: 'T', level2: '✓', level3: '' },
  delegating: { level1: '>', level2: '▶', level3: '' },
};

export const phaseTokens: DomainTokenContract<PhaseTokenValues> = defineDomainTokens({
  idle: (t) => t.colors.muted,
  exploring: (t) => t.colors.tones.info,
  planning: (t) => t.colors.tones.accent,
  implementing: (t) => t.colors.tones.success,
  testing: (t) => t.colors.tones.warning,
  delegating: (t) => color.mix(t.colors.tones.accent, t.colors.tones.info, 0.4),
});

export const phaseFamily: DomainTokenFamily<SessionPhase> = defineDomainTokens({
  name: 'phase',
  values: PHASE_TOKEN_VALUES as readonly SessionPhase[],
  glyphs: PHASE_GLYPHS,
});

// --- Tool tokens ---

export type ClaudeTool = 'read' | 'write' | 'edit' | 'bash' | 'grep' | 'glob' | 'agent' | 'webFetch' | 'webSearch' | 'todo' | 'fallback';

export interface ToolTokenValues {
  read: Color;
  write: Color;
  edit: Color;
  bash: Color;
  grep: Color;
  glob: Color;
  agent: Color;
  webFetch: Color;
  webSearch: Color;
  todo: Color;
  fallback: Color;
}

export const TOOL_TOKEN_VALUES: readonly ClaudeTool[] = [
  'read',
  'write',
  'edit',
  'bash',
  'grep',
  'glob',
  'agent',
  'webFetch',
  'webSearch',
  'todo',
  'fallback',
] as const;

export const TOOL_GLYPHS: Readonly<Record<ClaudeTool, DomainTokenGlyph>> = {
  read: { level1: 'R', level2: '📖', level3: '' },
  write: { level1: 'W', level2: '✎', level3: '' },
  edit: { level1: 'E', level2: '✏', level3: '' },
  bash: { level1: '$', level2: '▶', level3: '' },
  grep: { level1: 'g', level2: '⌕', level3: '' },
  glob: { level1: '*', level2: '✦', level3: '' },
  agent: { level1: '@', level2: '☉', level3: '' },
  webFetch: { level1: 'F', level2: '⇣', level3: '' },
  webSearch: { level1: 'S', level2: '⌕', level3: '' },
  todo: { level1: '[]', level2: '☑', level3: '' },
  fallback: { level1: '?', level2: '◯', level3: '' },
};

export const toolTokens: DomainTokenContract<ToolTokenValues> = defineDomainTokens({
  read: (t) => t.colors.tones.info,
  write: (t) => t.colors.tones.success,
  edit: (t) => t.colors.tones.warning,
  bash: (t) => t.colors.tones.accent,
  grep: (t) => color.mix(t.colors.tones.info, t.colors.tones.accent, 0.45),
  glob: (t) => color.mix(t.colors.tones.info, t.colors.tones.success, 0.5),
  agent: (t) => color.mix(t.colors.tones.accent, t.colors.tones.success, 0.4),
  webFetch: (t) => color.mix(t.colors.tones.info, t.colors.tones.warning, 0.3),
  webSearch: (t) => color.mix(t.colors.tones.success, t.colors.tones.warning, 0.4),
  todo: (t) => t.colors.muted,
  fallback: (t) => t.colors.text,
});

export const toolFamily: DomainTokenFamily<ClaudeTool> = defineDomainTokens({
  name: 'tool',
  values: TOOL_TOKEN_VALUES as readonly ClaudeTool[],
  glyphs: TOOL_GLYPHS,
});

export function classifyToolName(raw: string): ClaudeTool {
  switch (raw) {
    case 'Read':
      return 'read';
    case 'Write':
      return 'write';
    case 'Edit':
    case 'MultiEdit':
      return 'edit';
    case 'Bash':
      return 'bash';
    case 'Grep':
      return 'grep';
    case 'Glob':
      return 'glob';
    case 'Agent':
    case 'Task':
      return 'agent';
    case 'WebFetch':
      return 'webFetch';
    case 'WebSearch':
      return 'webSearch';
    case 'TodoWrite':
      return 'todo';
    default:
      return 'fallback';
  }
}

// --- Model tokens ---

export type ClaudeModel = 'opus' | 'sonnet' | 'haiku' | 'unknown';

export interface ModelTokenValues {
  opus: Color;
  sonnet: Color;
  haiku: Color;
  unknown: Color;
}

export const MODEL_TOKEN_VALUES: readonly ClaudeModel[] = ['opus', 'sonnet', 'haiku', 'unknown'] as const;

export const MODEL_GLYPHS: Readonly<Record<ClaudeModel, DomainTokenGlyph>> = {
  opus: { level1: '***', level2: '●●●', level3: '' },
  sonnet: { level1: '**', level2: '●●', level3: '' },
  haiku: { level1: '*', level2: '●', level3: '' },
  unknown: { level1: '?', level2: '○', level3: '' },
};

export const modelTokens: DomainTokenContract<ModelTokenValues> = defineDomainTokens({
  opus: (t) => t.colors.tones.accent,
  sonnet: (t) => t.colors.tones.info,
  haiku: (t) => t.colors.tones.success,
  unknown: (t) => t.colors.muted,
});

export const modelFamily: DomainTokenFamily<ClaudeModel> = defineDomainTokens({
  name: 'model',
  values: MODEL_TOKEN_VALUES as readonly ClaudeModel[],
  glyphs: MODEL_GLYPHS,
});

export function classifyModelName(raw: string): ClaudeModel {
  const lower = raw.toLowerCase();
  if (lower.includes('opus')) return 'opus';
  if (lower.includes('sonnet')) return 'sonnet';
  if (lower.includes('haiku')) return 'haiku';
  return 'unknown';
}

// --- Cost tier ---

export interface CostThresholds {
  readonly mid: number;
  readonly high: number;
}

export const DEFAULT_COST_THRESHOLDS: CostThresholds = { mid: 1, high: 5 };

export function costTier(usd: number, thresholds: CostThresholds = DEFAULT_COST_THRESHOLDS): keyof CostTokenValues {
  // NaN is undefined ordering — treat as "no cost recorded yet" → low.
  // Negative/Infinity values fall through to the comparison ladder naturally
  // (negative < mid → low; +Infinity ≥ high → high).
  if (Number.isNaN(usd)) return 'low';
  if (usd < thresholds.mid) return 'low';
  if (usd < thresholds.high) return 'mid';
  return 'high';
}

export const COST_GLYPHS: Readonly<Record<keyof CostTokenValues, DomainTokenGlyph>> = {
  low: { level1: '$', level2: '$', level3: '' },
  mid: { level1: '$$', level2: '$$', level3: '' },
  high: { level1: '$$$', level2: '⚠$', level3: '' },
};

// --- Meter tokens ---

export type MeterLevel = 'cold' | 'cool' | 'warm' | 'hot' | 'critical';

export interface MeterTokenValues {
  cold: Color;
  cool: Color;
  warm: Color;
  hot: Color;
  critical: Color;
}

export const meterTokens: DomainTokenContract<MeterTokenValues> = defineDomainTokens({
  cold: (t) => t.colors.tones.info,
  cool: (t) => color.mix(t.colors.tones.info, t.colors.tones.success, 0.5),
  warm: (t) => t.colors.tones.warning,
  hot: (t) => color.mix(t.colors.tones.warning, t.colors.tones.danger, 0.5),
  critical: (t) => t.colors.tones.danger,
});

const METER_STOPS: readonly (keyof MeterTokenValues)[] = ['cold', 'cool', 'warm', 'hot', 'critical'] as const;

export function meterLevel(t: number): MeterLevel {
  if (!Number.isFinite(t)) return 'cold';
  const clamped = Math.max(0, Math.min(1, t));
  if (clamped < 0.2) return 'cold';
  if (clamped < 0.4) return 'cool';
  if (clamped < 0.6) return 'warm';
  if (clamped < 0.8) return 'hot';
  return 'critical';
}

export function interpolateMeter(t: number, theme: SemanticTheme, overrides?: Partial<MeterTokenValues>): Color {
  const resolved = resolveDomainTokens(meterTokens, theme, overrides);
  const clamped = Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 0;
  if (clamped <= 0) return resolved[METER_STOPS[0]!];
  if (clamped >= 1) return resolved[METER_STOPS[METER_STOPS.length - 1]!];
  const segment = clamped / 0.25;
  const index = Math.min(METER_STOPS.length - 2, Math.floor(segment));
  const localT = segment - index;
  const from = resolved[METER_STOPS[index]!];
  const to = resolved[METER_STOPS[index + 1]!];
  return color.lerpOklch(from, to, localT);
}

// --- Activity tokens ---

export type ActivityState = 'idle' | 'pending' | 'streaming' | 'working' | 'succeeded' | 'failed';

export type ActivityMotion = 'none' | 'pulse' | 'shimmer' | 'breathe';

export interface ActivityDescriptor {
  readonly color: Color;
  readonly motion: ActivityMotion;
  readonly intensity: number;
}

export interface ActivityTokenValues {
  idle: ActivityDescriptor;
  pending: ActivityDescriptor;
  streaming: ActivityDescriptor;
  working: ActivityDescriptor;
  succeeded: ActivityDescriptor;
  failed: ActivityDescriptor;
}

export const activityTokens: DomainTokenContract<ActivityTokenValues> = defineDomainTokens({
  idle: (t) => ({ color: t.colors.muted, motion: 'none', intensity: 0.0 }),
  pending: (t) => ({ color: t.colors.muted, motion: 'breathe', intensity: 0.4 }),
  streaming: (t) => ({ color: t.colors.tones.info, motion: 'shimmer', intensity: 0.7 }),
  working: (t) => ({ color: t.colors.tones.accent, motion: 'pulse', intensity: 0.6 }),
  succeeded: (t) => ({ color: t.colors.tones.success, motion: 'none', intensity: 1.0 }),
  failed: (t) => ({ color: t.colors.tones.danger, motion: 'none', intensity: 1.0 }),
});

export function resolveActivity(theme: SemanticTheme, opts?: { respectReduceMotion?: boolean }): ActivityTokenValues {
  const resolved = resolveDomainTokens(activityTokens, theme);
  if (opts?.respectReduceMotion && reduceMotionEnv()) {
    const flattened = {} as ActivityTokenValues;
    for (const key of Object.keys(resolved) as (keyof ActivityTokenValues)[]) {
      flattened[key] = { ...resolved[key], motion: 'none' };
    }
    return flattened;
  }
  return resolved;
}

export const ACTIVITY_TOKEN_VALUES: readonly ActivityState[] = ['idle', 'pending', 'streaming', 'working', 'succeeded', 'failed'] as const;

export const ACTIVITY_GLYPHS: Readonly<Record<ActivityState, DomainTokenGlyph>> = {
  idle: { level1: '-', level2: '○', level3: '' },
  pending: { level1: '.', level2: '◌', level3: '' },
  streaming: { level1: '~', level2: '⌁', level3: '' },
  working: { level1: '*', level2: '◐', level3: '' },
  succeeded: { level1: '+', level2: '✓', level3: '' },
  failed: { level1: '!', level2: '✗', level3: '' },
};

export const activityFamily: DomainTokenFamily<ActivityState> = defineDomainTokens({
  name: 'activity',
  values: ACTIVITY_TOKEN_VALUES as readonly ActivityState[],
  glyphs: ACTIVITY_GLYPHS,
});
