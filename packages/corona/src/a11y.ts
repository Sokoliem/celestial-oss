import { detectReducedMotion } from '@celestial/atlas';
import { type Color, color, colorToHex, isColorLike } from './color.js';
import { type CVDType, simulateColorBlindness } from './cvd.js';
import { type DomainTokenContract, resolveDomainTokens } from './domain-tokens.js';
import { createPtyThemeTransform, type PtyThemeConfig } from './pty-transform.js';
import type { SemanticTheme } from './theme.js';
import { stripAnsi } from './utils.js';

/**
 * Strip all ANSI color codes and apply bold styling.
 * Preserves text content while converting to high-contrast output.
 */
export function highContrast(text: string): string {
  const plain = stripAnsi(text);
  return `\x1b[1m${plain}\x1b[22m`;
}

/**
 * Remove all ANSI escape sequences from text, returning plain content.
 */
export function stripAllStyles(text: string): string {
  return stripAnsi(text);
}

/**
 * Priority hint for screen reader announcements.
 * - `'polite'`    — announced at the next natural pause (default, least disruptive)
 * - `'assertive'` — announced immediately, interrupting the current speech
 */
export type AnnouncePriority = 'polite' | 'assertive';

/**
 * Prefix the message with an ANSI bell character (\x07) for screen reader
 * notification.  The `priority` argument is available for callers to record
 * intent (e.g. pass through to a `LiveRegion`), but the returned string is
 * identical for both values — terminal screen readers do not distinguish them
 * via the escape sequence itself.
 */
export function announceText(message: string, _priority: AnnouncePriority = 'polite'): string {
  return `\x07${message}`;
}

/**
 * Detect whether the user has requested reduced motion.
 *
 * Checks the `NO_MOTION` and `REDUCE_MOTION` environment variables (case-
 * insensitive), following the same convention as `NO_COLOR` for color.
 * Returns `true` when any of the following is set to a non-empty, non-`"0"`
 * value:
 *
 *   - `NO_MOTION=1`
 *   - `REDUCE_MOTION=1`
 *   - `REDUCE_MOTION=true`
 *
 * Spinner and animation consumers should check this before starting any
 * time-based animation.
 */
export function reduceMotion(): boolean {
  return detectReducedMotion();
}

// ─── Theme accessibility audit ──────────────────────────────────────────────

/** WCAG conformance level for contrast checks. */
export type A11yLevel = 'AA' | 'AAA';

/** A single contrast violation found during theme audit. */
export interface ContrastViolation {
  /** Human-readable pair name (e.g. "text on surface") */
  pair: string;
  /** The foreground color that was tested. */
  fg: Color;
  /** The background color that was tested. */
  bg: Color;
  /** The actual contrast ratio (1–21). */
  ratio: number;
  /** The minimum ratio required for the requested level. */
  required: number;
}

/** Result of a theme accessibility audit. */
export interface ThemeA11yReport {
  /** The WCAG level that was checked. */
  level: A11yLevel;
  /** Whether all pairs pass the requested level. */
  pass: boolean;
  /** All violations found (empty when pass is true). */
  violations: ContrastViolation[];
  /** Total number of pairs checked. */
  pairsChecked: number;
}

export interface EnsureReadableColorOptions {
  /** Minimum contrast ratio to satisfy. Defaults to WCAG AA normal text. */
  minimum?: number;
  /** Maximum number of interpolation samples tried before returning best effort. */
  steps?: number;
  /** Fixed interpolation increment for compatibility with older contrast sampling. */
  stepSize?: number;
  /** Explicit contrast target; defaults to whichever of black/white contrasts more. */
  target?: Color;
}

export interface NormalizeThemeContrastOptions extends EnsureReadableColorOptions {
  /** Number of repair passes. Two passes handles derived pairs without churn. */
  passes?: number;
  /** Minimum contrast for focus and interactive borders. Defaults to 3. */
  graphicalMinimum?: number;
  /** Minimum contrast between stacked or interactive surfaces. Defaults to 1.12. */
  surfaceMinimum?: number;
}

export interface ThemeAuditWarning {
  kind: 'contrast' | 'color-vision' | 'glyph' | 'motion' | 'pty';
  message: string;
  severity: 'info' | 'warning' | 'error';
}

export interface ThemeAuditReport {
  pass: boolean;
  contrast: ThemeA11yReport;
  warnings: ThemeAuditWarning[];
  motion: {
    reduceMotion: boolean;
  };
  glyphs: {
    checked: number;
    missing: string[];
  };
  pty?: {
    pass: boolean;
    warning?: string;
  };
}

export interface ThemeAuditOptions {
  level?: A11yLevel;
  pty?: PtyThemeConfig;
  colorVision?: readonly CVDType[];
}

/**
 * Critical text-on-surface pairs that must meet WCAG contrast.
 * Each entry is [label, fgKey, bgKey] where keys index into ThemeColors
 * or a resolver function.
 */
type PairResolver = (theme: SemanticTheme) => [Color, Color];

const CRITICAL_PAIRS: [string, PairResolver][] = [
  ['text on surface', (t) => [t.colors.text, t.colors.surface]],
  ['text on bg', (t) => [t.colors.text, t.colors.bg]],
  ['text on surfaceAlt', (t) => [t.colors.text, t.colors.surfaceAlt]],
  ['textSoft on surface', (t) => [t.colors.textSoft, t.colors.surface]],
  ['muted on surface', (t) => [t.colors.muted, t.colors.surface]],
  ['text on surfaceRaised', (t) => [t.colors.text, t.colors.surfaceRaised]],
  ['error on surface', (t) => [t.typography.error.color, t.colors.surface]],
  ['warning on surface', (t) => [t.typography.warning.color, t.colors.surface]],
  ['success on surface', (t) => [t.typography.success.color, t.colors.surface]],
  ['link on surface', (t) => [t.colors.linkColor, t.colors.surface]],
  // Text the runtime renders on surfaces *not* covered above. Added per the
  // 2026-05-01 wrapper audit, which found multiple themes pass the original
  // 12 pairs while the live a11y_audit catches violations on these. Each
  // entry is still a pure text-on-background combination so the same 4.5
  // (AA) / 7 (AAA) thresholds apply — borders and other non-text UI
  // components are a separate WCAG SC 1.4.11 category at 3:1 and live in a
  // future GRAPHICAL_PAIRS list.
  ['placeholder on surface', (t) => [t.colors.placeholder, t.colors.surface]],
  ['placeholder on surfaceRaised', (t) => [t.colors.placeholder, t.colors.surfaceRaised]],
  ['muted on surfaceRaised', (t) => [t.colors.muted, t.colors.surfaceRaised]],
  ['textSoft on surfaceRaised', (t) => [t.colors.textSoft, t.colors.surfaceRaised]],
  ['text on backdrop', (t) => [t.colors.text, t.colors.backdrop]],
  ['link on surfaceRaised', (t) => [t.colors.linkColor, t.colors.surfaceRaised]],
  ['text on floating surface', (t) => [t.colors.text, t.elevation.floating.surface ?? t.colors.surfaceRaised]],
  ['text on modal surface', (t) => [t.colors.text, t.elevation.modal.surface ?? t.colors.surfaceRaised]],
  ['textSoft on floating surface', (t) => [t.colors.textSoft, t.elevation.floating.surface ?? t.colors.surfaceRaised]],
  ['muted on modal surface', (t) => [t.colors.muted, t.elevation.modal.surface ?? t.colors.surfaceRaised]],
  ['caption on modal surface', (t) => [t.typography.caption.color, t.elevation.modal.surface ?? t.colors.surfaceRaised]],
  ['hover state foreground', (t) => [t.states.hover.fg, t.states.hover.bg ?? t.colors.surface]],
  ['active state foreground', (t) => [t.states.active.fg, t.states.active.bg ?? t.colors.surface]],
  ['selected state foreground', (t) => [t.states.selected.fg, t.states.selected.bg ?? t.colors.surface]],
];

/** Minimum contrast ratios per WCAG level for normal text. */
const MIN_RATIO: Record<A11yLevel, number> = {
  AA: 4.5,
  AAA: 7,
};

function getMaxContrastTarget(background: Color): Color {
  const black = color.rgb(0, 0, 0);
  const white = color.rgb(255, 255, 255);
  return color.contrastRatio(black, background) >= color.contrastRatio(white, background) ? black : white;
}

function isColorArray(value: Color | readonly Color[]): value is readonly Color[] {
  return Array.isArray(value);
}

function normalizeBackgrounds(backgrounds: Color | readonly Color[]): readonly Color[] {
  return isColorArray(backgrounds) ? backgrounds : [backgrounds];
}

/**
 * Return the nearest readable version of a foreground color for one or more
 * backgrounds. The original color is returned unchanged when it already meets
 * the requested contrast ratio for every background.
 */
export function ensureReadableColor(foreground: Color, backgrounds: Color | readonly Color[], options: EnsureReadableColorOptions = {}): Color {
  const minimum = options.minimum ?? 4.5;
  const steps = Math.max(1, Math.floor(options.steps ?? 16));
  const stepSize =
    typeof options.stepSize === 'number' && Number.isFinite(options.stepSize) && options.stepSize > 0 ? Math.min(options.stepSize, 1) : undefined;
  let candidate = foreground;

  for (const background of normalizeBackgrounds(backgrounds)) {
    if (color.contrastRatio(candidate, background) >= minimum) {
      continue;
    }

    const target = options.target ?? getMaxContrastTarget(background);
    let best = candidate;
    let bestRatio = color.contrastRatio(candidate, background);

    for (let index = 1; stepSize ? index * stepSize <= 1 : index <= steps; index++) {
      const next = color.lerpOklch(candidate, target, stepSize ? index * stepSize : index / steps);
      const ratio = color.contrastRatio(next, background);
      if (ratio >= minimum) {
        best = next;
        bestRatio = ratio;
        break;
      }
      if (ratio > bestRatio) {
        best = next;
        bestRatio = ratio;
      }
    }

    candidate = best;
  }

  return candidate;
}

/**
 * Nudge a surface until it is perceptibly distinct from every surface beneath
 * it. This is intentionally a subtle layer boundary, not a text-contrast
 * requirement; borders and focus rings retain their separate 3:1 contract.
 */
export function ensureDistinctColor(candidate: Color, backgrounds: Color | readonly Color[], options: EnsureReadableColorOptions = {}): Color {
  return ensureReadableColor(candidate, backgrounds, { ...options, minimum: options.minimum ?? 1.12 });
}

function normalizeForegrounds(foregrounds: Color | readonly Color[]): readonly Color[] {
  return isColorArray(foregrounds) ? foregrounds : [foregrounds];
}

function getMaxBackgroundContrastTarget(foregrounds: readonly Color[]): Color {
  const black = color.rgb(0, 0, 0);
  const white = color.rgb(255, 255, 255);
  const minimumRatio = (background: Color) => Math.min(...foregrounds.map((foreground) => color.contrastRatio(foreground, background)));
  return minimumRatio(black) >= minimumRatio(white) ? black : white;
}

/**
 * Return the nearest background that keeps all supplied foreground tokens
 * readable. Useful for elevation and state surfaces, where preserving the
 * semantic foreground hue is preferable to silently rewriting it.
 */
export function ensureReadableBackground(background: Color, foregrounds: Color | readonly Color[], options: EnsureReadableColorOptions = {}): Color {
  const minimum = options.minimum ?? 4.5;
  const values = normalizeForegrounds(foregrounds);
  if (values.every((foreground) => color.contrastRatio(foreground, background) >= minimum)) return background;

  const steps = Math.max(1, Math.floor(options.steps ?? 16));
  const target = options.target ?? getMaxBackgroundContrastTarget(values);
  let best = background;
  let bestRatio = Math.min(...values.map((foreground) => color.contrastRatio(foreground, background)));
  for (let index = 1; index <= steps; index++) {
    const candidate = color.lerpOklch(background, target, index / steps);
    const ratios = values.map((foreground) => color.contrastRatio(foreground, candidate));
    const ratio = Math.min(...ratios);
    if (ratios.every((value) => value >= minimum)) return candidate;
    if (ratio > bestRatio) {
      best = candidate;
      bestRatio = ratio;
    }
  }
  return best;
}

function cloneTokenRecord<T extends object>(record: T): T {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, { ...value }])) as T;
}

function surfaceColors(theme: SemanticTheme): Color[] {
  const elevated = Object.values(theme.elevation)
    .map((token) => token.surface)
    .filter((value): value is Color => value !== undefined);
  return [theme.colors.bg, theme.colors.surface, theme.colors.surfaceAlt, theme.colors.surfaceRaised, theme.colors.backdrop, ...elevated];
}

function repairCriticalPairs(theme: SemanticTheme, options: NormalizeThemeContrastOptions): SemanticTheme {
  const minimum = options.minimum ?? 4.5;
  const graphicalMinimum = options.graphicalMinimum ?? 3;
  const surfaceMinimum = options.surfaceMinimum ?? 1.12;
  const colors = { ...theme.colors, tones: { ...theme.colors.tones } };
  const typography = cloneTokenRecord(theme.typography);
  const states = cloneTokenRecord(theme.states);
  const elevation = cloneTokenRecord(theme.elevation);

  const baseBackgrounds = [colors.bg, colors.surface, colors.surfaceAlt, colors.surfaceRaised];
  const originalColors = theme.colors;
  colors.text = ensureReadableColor(colors.text, baseBackgrounds, { ...options, minimum });
  colors.textSoft = ensureReadableColor(colors.textSoft, baseBackgrounds, { ...options, minimum });
  colors.muted = ensureReadableColor(colors.muted, baseBackgrounds, { ...options, minimum });
  colors.placeholder = ensureReadableColor(colors.placeholder, baseBackgrounds, { ...options, minimum });
  colors.focusRing = ensureReadableColor(colors.focusRing, baseBackgrounds, { ...options, minimum: graphicalMinimum });
  colors.borderHover = ensureReadableColor(colors.borderHover, baseBackgrounds, { ...options, minimum: graphicalMinimum });
  colors.borderActive = ensureReadableColor(colors.borderActive, baseBackgrounds, { ...options, minimum: graphicalMinimum });

  const replacements: Array<[Color, Color]> = [
    [originalColors.text, colors.text],
    [originalColors.textSoft, colors.textSoft],
    [originalColors.muted, colors.muted],
    [originalColors.placeholder, colors.placeholder],
  ];
  const replaceDerived = (value: Color): Color => replacements.find(([original]) => value.equals(original))?.[1] ?? value;
  for (const key of Object.keys(typography) as Array<keyof typeof typography>) {
    typography[key].color = replaceDerived(typography[key].color);
  }
  for (const key of Object.keys(states) as Array<keyof typeof states>) {
    states[key].fg = replaceDerived(states[key].fg);
  }

  if (elevation.floating.border?.equals(originalColors.borderHover)) elevation.floating.border = colors.borderHover;
  if (elevation.overlay.border?.equals(originalColors.borderActive)) elevation.overlay.border = colors.borderActive;
  if (elevation.modal.border?.equals(originalColors.borderActive)) elevation.modal.border = colors.borderActive;

  const semanticForegrounds = [
    colors.text,
    colors.textSoft,
    colors.muted,
    colors.placeholder,
    typography.heading.color,
    typography.title.color,
    typography.subtitle.color,
    typography.body.color,
    typography.caption.color,
    typography.overline.color,
    typography.code.color,
    typography.label.color,
    states.hover.fg,
    states.focus.fg,
    states.active.fg,
    states.selected.fg,
    states.readonly.fg,
  ];
  const surfaceTarget = getMaxBackgroundContrastTarget(semanticForegrounds);
  const repairSurface = (candidate: Color, against: Color | readonly Color[]): Color => {
    const readable = ensureReadableBackground(candidate, semanticForegrounds, { ...options, minimum, target: surfaceTarget });
    const distinct = ensureDistinctColor(readable, against, { minimum: surfaceMinimum, target: surfaceTarget });
    return ensureReadableBackground(distinct, semanticForegrounds, { ...options, minimum, target: surfaceTarget });
  };

  elevation.raised.surface = repairSurface(elevation.raised.surface ?? colors.surfaceRaised, colors.surface);
  elevation.floating.surface = repairSurface(elevation.floating.surface ?? colors.surfaceRaised, [colors.bg, colors.surface]);
  elevation.overlay.surface = repairSurface(elevation.overlay.surface ?? colors.backdrop, colors.bg);
  elevation.modal.surface = repairSurface(elevation.modal.surface ?? colors.surfaceRaised, [colors.bg, elevation.floating.surface]);

  const backgrounds = surfaceColors({ ...theme, colors, elevation });
  colors.linkColor = ensureReadableColor(colors.linkColor, backgrounds, { ...options, minimum });
  if (typography.link.color.equals(originalColors.linkColor)) typography.link.color = colors.linkColor;

  for (const key of Object.keys(typography) as Array<keyof typeof typography>) {
    typography[key].color = ensureReadableColor(typography[key].color, backgrounds, { ...options, minimum });
  }

  for (const key of Object.keys(states) as Array<keyof typeof states>) {
    const token = states[key];
    const stateTarget = getMaxBackgroundContrastTarget([token.fg]);
    const readableStateBackground = token.bg
      ? ensureReadableBackground(token.bg, token.fg, { ...options, minimum, target: stateTarget })
      : undefined;
    const stateBackground = readableStateBackground
      ? ensureDistinctColor(readableStateBackground, colors.surface, { minimum: surfaceMinimum, target: stateTarget })
      : undefined;
    const foregroundBackgrounds = stateBackground ? [stateBackground] : backgrounds;
    states[key] = {
      ...token,
      fg: ensureReadableColor(token.fg, foregroundBackgrounds, { ...options, minimum }),
      ...(stateBackground ? { bg: stateBackground } : {}),
      ...(token.border
        ? { border: ensureReadableColor(token.border, stateBackground ?? backgrounds, { ...options, minimum: graphicalMinimum }) }
        : {}),
    };
  }

  return {
    ...theme,
    colors,
    typography,
    states,
    elevation,
  };
}

/**
 * Best-effort contrast repair for the semantic foreground tokens that
 * `validateThemeContrast()` audits. This is intentionally conservative:
 * base application surfaces are never changed. Derived elevation and state
 * surfaces may be nudged just enough to preserve deterministic layer cues.
 */
export function normalizeThemeContrast(theme: SemanticTheme, options: NormalizeThemeContrastOptions = {}): SemanticTheme {
  const passes = Math.max(1, Math.floor(options.passes ?? 2));
  let current = theme;
  for (let index = 0; index < passes; index++) {
    current = repairCriticalPairs(current, options);
  }
  return current;
}

/**
 * Audit a theme for WCAG contrast compliance.
 *
 * Checks all critical foreground-on-background pairs and returns a
 * report indicating which (if any) fail the requested conformance level.
 *
 * ```ts
 * const report = validateThemeContrast(myTheme, 'AA');
 * if (!report.pass) {
 *   for (const v of report.violations) {
 *     console.warn(`${v.pair}: ${v.ratio.toFixed(1)} < ${v.required}`);
 *   }
 * }
 * ```
 */
export function validateThemeContrast(theme: SemanticTheme, level: A11yLevel = 'AA'): ThemeA11yReport {
  const required = MIN_RATIO[level];
  const violations: ContrastViolation[] = [];

  for (const [pair, resolve] of CRITICAL_PAIRS) {
    const [fg, bg] = resolve(theme);
    const ratio = color.contrastRatio(fg, bg);
    if (ratio < required) {
      violations.push({ pair, fg, bg, ratio, required });
    }
  }

  return {
    level,
    pass: violations.length === 0,
    violations,
    pairsChecked: CRITICAL_PAIRS.length,
  };
}

function collectGlyphAudit(theme: SemanticTheme): ThemeAuditReport['glyphs'] {
  const missing: string[] = [];
  let checked = 0;

  for (const [key, value] of Object.entries(theme.glyphs)) {
    checked++;
    if (typeof value !== 'string' || value.length === 0) {
      missing.push(key);
    }
  }

  return { checked, missing };
}

function auditColorVision(theme: SemanticTheme, types: readonly CVDType[], minimum: number): ThemeAuditWarning[] {
  const warnings: ThemeAuditWarning[] = [];
  for (const type of types) {
    const fg = simulateColorBlindness(theme.colors.text, type);
    const bg = simulateColorBlindness(theme.colors.surface, type);
    const ratio = color.contrastRatio(fg, bg);
    if (ratio < minimum) {
      warnings.push({
        kind: 'color-vision',
        severity: 'warning',
        message: `text on surface is ${ratio.toFixed(2)} under ${type}, below ${minimum}`,
      });
    }
  }
  return warnings;
}

/**
 * Composite theme audit for flagship apps: contrast, glyph completeness,
 * reduced-motion state, optional PTY transform validity, and optional
 * color-vision contrast checks.
 */
export function auditTheme(theme: SemanticTheme, options: ThemeAuditOptions = {}): ThemeAuditReport {
  const level = options.level ?? 'AA';
  const contrast = validateThemeContrast(theme, level);
  const warnings: ThemeAuditWarning[] = contrast.violations.map((violation) => ({
    kind: 'contrast',
    severity: 'error',
    message: `${violation.pair}: ${violation.ratio.toFixed(2)} < ${violation.required}`,
  }));

  const glyphs = collectGlyphAudit(theme);
  for (const key of glyphs.missing) {
    warnings.push({
      kind: 'glyph',
      severity: 'warning',
      message: `theme glyph "${key}" is missing`,
    });
  }

  if (theme.motion.reduceMotion) {
    warnings.push({
      kind: 'motion',
      severity: 'info',
      message: 'theme is configured for reduced motion',
    });
  }

  warnings.push(...auditColorVision(theme, options.colorVision ?? [], MIN_RATIO[level]));

  let pty: ThemeAuditReport['pty'];
  if (options.pty) {
    try {
      createPtyThemeTransform(options.pty);
      pty = { pass: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      pty = { pass: false, warning: message };
      warnings.push({ kind: 'pty', severity: 'error', message });
    }
  }

  return {
    pass: contrast.pass && glyphs.missing.length === 0 && (pty?.pass ?? true) && !warnings.some((warning) => warning.severity === 'error'),
    contrast,
    warnings,
    motion: {
      reduceMotion: theme.motion.reduceMotion,
    },
    glyphs,
    ...(pty ? { pty } : {}),
  };
}

// --- Domain Token Coverage Audit ---

/**
 * A single violation from `auditDomainTokenCoverage`. Identifies the contract,
 * the token key inside it, the background that was tested against, the
 * measured WCAG contrast ratio, and the minimum required ratio for the
 * configured level/text-size.
 */
export interface DomainTokenAuditViolation {
  /** Contract identifier — taken from `options.contractNames` if provided, otherwise a synthetic `contract-<index>` label. */
  contract: string;
  /** Token key inside the contract (e.g. `'success'`, `'warning'`). */
  key: string;
  /** Hex string of the background color tested against (e.g. `'#1a2538'`). */
  background: string;
  /** Measured WCAG 2.1 contrast ratio (1–21). */
  ratio: number;
  /** Minimum required ratio for the configured level/text size. */
  required: number;
}

/** Aggregate result of a domain-token coverage audit. */
export interface DomainTokenAuditReport {
  /** All (token, background) pairs that fell below the required ratio. */
  violations: ReadonlyArray<DomainTokenAuditViolation>;
  /** Total (token, background) pairs that were tested. */
  total: number;
  /** `total - violations.length`. */
  passed: number;
}

/** Options for `auditDomainTokenCoverage`. */
export interface DomainTokenAuditOptions {
  /** Backgrounds to test against. Defaults to `[surface, surfaceAlt, surfaceRaised]`. */
  backgrounds?: ReadonlyArray<Color>;
  /** WCAG level. `'AA'` requires 4.5:1 (3:1 large text); `'AAA'` requires 7:1 (4.5:1 large text). Defaults to `'AA'`. */
  level?: A11yLevel;
  /** When `true`, applies the WCAG large-text relaxation. Defaults to `false`. */
  largeText?: boolean;
  /** Optional human-readable name per contract. Falls back to `contract-<index>` when not supplied. */
  contractNames?: ReadonlyMap<DomainTokenContract<unknown>, string>;
}

/** WCAG required-ratio table indexed by level then text size. */
const DOMAIN_AUDIT_THRESHOLDS: Record<A11yLevel, { normal: number; large: number }> = {
  AA: { normal: 4.5, large: 3 },
  AAA: { normal: 7, large: 4.5 },
};

/**
 * Audit a list of domain token contracts against a theme for WCAG contrast
 * compliance. Each contract is resolved via `resolveDomainTokens`, then every
 * `(key, value)` pair whose value is a `Color` is tested against every
 * background in `options.backgrounds`. Pairs falling below the required ratio
 * for the configured level (and large-text setting) are returned as
 * `DomainTokenAuditViolation`s.
 *
 * Contract identity is preserved by string label — supply
 * `options.contractNames` to map contract objects to readable names; otherwise
 * each contract is labelled `contract-<index>` based on its position in the
 * input array.
 *
 * ```ts
 * const report = auditDomainTokenCoverage(theme, [statusTokens, gitTokens], {
 *   contractNames: new Map([
 *     [statusTokens, 'status'],
 *     [gitTokens, 'git'],
 *   ]),
 * });
 * for (const v of report.violations) {
 *   console.warn(`${v.contract}.${v.key} on ${v.background}: ${v.ratio.toFixed(2)} < ${v.required}`);
 * }
 * ```
 */
export function auditDomainTokenCoverage(
  theme: SemanticTheme,
  contracts: ReadonlyArray<DomainTokenContract<unknown>>,
  options: DomainTokenAuditOptions = {},
): DomainTokenAuditReport {
  const level: A11yLevel = options.level ?? 'AA';
  const largeText = options.largeText === true;
  const required = largeText ? DOMAIN_AUDIT_THRESHOLDS[level].large : DOMAIN_AUDIT_THRESHOLDS[level].normal;
  const backgrounds: ReadonlyArray<Color> = options.backgrounds ?? [theme.colors.surface, theme.colors.surfaceAlt, theme.colors.surfaceRaised];

  const violations: DomainTokenAuditViolation[] = [];
  let total = 0;

  for (let index = 0; index < contracts.length; index++) {
    const contract = contracts[index];
    if (!contract) {
      continue;
    }
    const contractName = options.contractNames?.get(contract) ?? `contract-${index}`;
    const resolved = resolveDomainTokens(contract, theme) as Record<string, unknown>;

    for (const key of Object.keys(resolved)) {
      const value = resolved[key];
      // Only audit Color values — domain contracts may carry non-color payloads
      // (e.g. Activity descriptors). Non-color entries are skipped silently.
      if (!isColorLike(value)) {
        continue;
      }

      for (const bg of backgrounds) {
        total++;
        const ratio = color.contrastRatio(value, bg);
        if (ratio < required) {
          violations.push({
            contract: contractName,
            key,
            background: colorToHex(bg),
            ratio,
            required,
          });
        }
      }
    }
  }

  return {
    violations,
    total,
    passed: total - violations.length,
  };
}
