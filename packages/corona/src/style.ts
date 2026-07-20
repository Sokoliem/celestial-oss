/**
 * Corona Style System
 *
 * Immutable, composable style objects for terminal rendering.
 */

import type { Border } from './border.js';
import { border as borderNs } from './border.js';
import type { Color } from './color.js';
import { charWidth } from './unicode-width.js';
import { stripAnsi, visualWidth } from './utils.js';

export type BreakpointName = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface ResolvedStyleProps {
  color?: Color;
  background?: Color;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  dim?: boolean;
  blink?: boolean;
  reverse?: boolean;
  hidden?: boolean;
  padding?: number | [number, number] | [number, number, number, number];
  margin?: number | [number, number] | [number, number, number, number];
  width?: number;
  height?: number;
  align?: 'left' | 'center' | 'right';
  border?: Border;
  borderColor?: Color;
  effects?: StyleEffects;
  elevation?: number;
  icon?: string;
}

export type Responsive<T> =
  | T
  | {
      [key in BreakpointName]?: T;
    };

export interface StyleEffects {
  /** Apply a glass-like backdrop blur effect */
  glass?: boolean;
  /** Amount of blur to apply (0-10) */
  blur?: number;
  /** Opacity of the background (0-1) */
  opacity?: number;
  /** Tint color for glass/overlays */
  tint?: Color;
  /** Vignette strength (0-1) */
  vignette?: number;
  /** Scanline intensity (0-1) */
  scanline?: number;
  /** Film grain/noise intensity (0-1) */
  noise?: number;
}

export interface StyleProps {
  color?: Responsive<Color>;
  background?: Responsive<Color>;
  bold?: Responsive<boolean>;
  italic?: Responsive<boolean>;
  underline?: Responsive<boolean>;
  strikethrough?: Responsive<boolean>;
  dim?: Responsive<boolean>;
  blink?: Responsive<boolean>;
  reverse?: Responsive<boolean>;
  hidden?: Responsive<boolean>;
  padding?: Responsive<number | [number, number] | [number, number, number, number]>;
  /** Outer spacing around the element (does not affect internal layout) */
  margin?: Responsive<number | [number, number] | [number, number, number, number]>;
  width?: Responsive<number>;
  height?: Responsive<number>;
  align?: Responsive<'left' | 'center' | 'right'>;
  border?: Responsive<Border>;
  /** Color applied only to border characters — content is left unstyled */
  borderColor?: Responsive<Color>;
  /** Modern visual effects */
  effects?: Responsive<StyleEffects>;
  /** Z-axis elevation (0-24) for depth and shadows */
  elevation?: Responsive<number>;
  /** Nerd Font icon name or hex string */
  icon?: Responsive<string>;
}

const BP_ORDER: BreakpointName[] = ['xs', 'sm', 'md', 'lg', 'xl'];

/** Resolve a responsive value to a single value based on the current breakpoint */
function resolveResponsive<T>(value: Responsive<T> | undefined, currentBP: BreakpointName): T | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null) return value as T;

  // Arrays (e.g. padding tuples) are plain values, not breakpoint maps
  if (Array.isArray(value)) return value as unknown as T;

  // A responsive map must have at least one breakpoint key to be treated as one.
  // Non-breakpoint objects (e.g. Color instances, Border objects) pass through as-is.
  const obj = value as Record<string, unknown>;
  const isResponsiveMap = BP_ORDER.some((bp) => Object.hasOwn(obj, bp));
  if (!isResponsiveMap) return value as T;

  // It's a Responsive object — find the best matching breakpoint (current or smaller)
  const idx = BP_ORDER.indexOf(currentBP);
  for (let i = idx; i >= 0; i--) {
    const bp = BP_ORDER[i]!;
    if ((obj as Record<BreakpointName, T>)[bp] !== undefined) return (obj as Record<BreakpointName, T>)[bp];
  }
  return undefined;
}

export interface Style {
  /** Render text with this style applied */
  render(text: string, breakpoint?: BreakpointName): string;
  /** Create a new style by merging with overrides */
  merge(overrides: Partial<StyleProps>): Style;
  /** Create a new style with a property removed */
  unset<K extends keyof StyleProps>(key: K): Style;
  /** Measure the visual width of rendered text (ignoring ANSI codes) */
  measureWidth(text: string, breakpoint?: BreakpointName): number;
  /** Get the raw style props */
  readonly props: Readonly<StyleProps>;
  /** Get resolved style props for a specific breakpoint */
  resolve(breakpoint: BreakpointName): ResolvedStyleProps;
}

// --- ANSI helpers ---

const ANSI_CODES = {
  bold: { on: '\x1b[1m', off: '\x1b[22m' },
  dim: { on: '\x1b[2m', off: '\x1b[22m' },
  italic: { on: '\x1b[3m', off: '\x1b[23m' },
  underline: { on: '\x1b[4m', off: '\x1b[24m' },
  blink: { on: '\x1b[5m', off: '\x1b[25m' },
  reverse: { on: '\x1b[7m', off: '\x1b[27m' },
  hidden: { on: '\x1b[8m', off: '\x1b[28m' },
  strikethrough: { on: '\x1b[9m', off: '\x1b[29m' },
} as const;

type DecorationKey = keyof typeof ANSI_CODES;

const DECORATION_KEYS: DecorationKey[] = ['bold', 'dim', 'italic', 'underline', 'blink', 'reverse', 'hidden', 'strikethrough'];

// stripAnsi and visualWidth imported from './utils.js'

/** Normalize padding/margin to [top, right, bottom, left] */
function normalizeSides(value: number | [number, number] | [number, number, number, number]): [number, number, number, number] {
  if (typeof value === 'number') return [value, value, value, value];
  if (value.length === 2) return [value[0], value[1], value[0], value[1]];
  return value;
}

/** Pad text with spaces for alignment within a fixed width */
function alignText(text: string, width: number, align: 'left' | 'center' | 'right'): string {
  const w = visualWidth(text);
  if (w >= width) return text;
  const gap = width - w;

  switch (align) {
    case 'center': {
      const left = Math.floor(gap / 2);
      const right = gap - left;
      return ' '.repeat(left) + text + ' '.repeat(right);
    }
    case 'right':
      return ' '.repeat(gap) + text;
    case 'left':
    default:
      return text + ' '.repeat(gap);
  }
}

/** Truncate text to a visual width (preserving ANSI codes) */
export function truncate(text: string, maxWidth: number): string {
  const stripped = stripAnsi(text);
  if (visualWidth(stripped) <= maxWidth) return text;

  // ANSI-aware truncation using a state machine for correct escape handling.
  // States: 'text' | 'escape-start' | 'csi' | 'osc'
  let result = '';
  let visibleLen = 0;
  let state: 'text' | 'escape-start' | 'csi' | 'osc' = 'text';
  let hasSGR = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;

    if (state === 'text') {
      if (ch === '\x1b') {
        state = 'escape-start';
        result += ch;
        continue;
      }
      const cp = text.codePointAt(i)!;
      const w = charWidth(cp);
      if (visibleLen + w > maxWidth) break;
      if (cp > 0xffff) {
        result += text[i]! + text[i + 1]!;
        i++;
      } else {
        result += ch;
      }
      visibleLen += w;
    } else if (state === 'escape-start') {
      result += ch;
      if (ch === '[') {
        state = 'csi';
      } else if (ch === ']') {
        state = 'osc';
      } else {
        // SS2/SS3 or other single-char escape: consume this char and return to text
        state = 'text';
      }
    } else if (state === 'csi') {
      result += ch;
      // CSI sequences end on any letter [a-zA-Z]
      if (/[a-zA-Z]/.test(ch)) {
        if (ch === 'm') hasSGR = true;
        state = 'text';
      }
    } else if (state === 'osc') {
      result += ch;
      // OSC terminates on BEL (\x07) or ST (\x1b\\)
      if (ch === '\x07') {
        state = 'text';
      } else if (ch === '\\' && i > 0 && text[i - 1] === '\x1b') {
        state = 'text';
      }
    }
  }

  // If any SGR codes were opened, append a reset to leave terminal clean
  if (hasSGR) {
    result += '\x1b[0m';
  }

  return result;
}

// --- Style implementation ---

class StyleImpl implements Style {
  readonly props: Readonly<StyleProps>;

  constructor(props: StyleProps) {
    this.props = Object.freeze({ ...props });
  }

  resolve(breakpoint: BreakpointName): ResolvedStyleProps {
    const resolvedProps: any = {};
    for (const key of Object.keys(this.props)) {
      resolvedProps[key] = resolveResponsive(this.props[key as keyof StyleProps] as any, breakpoint);
    }
    return resolvedProps as ResolvedStyleProps;
  }

  render(text: string, breakpoint: BreakpointName = 'md'): string {
    let result = text;
    const resolved = this.resolve(breakpoint);

    // Apply width constraints first (before decoration)
    if (resolved.width !== undefined) {
      const stripped = stripAnsi(result);
      if (visualWidth(stripped) > (resolved.width as number)) {
        result = truncate(result, resolved.width as number);
      } else if (visualWidth(stripped) < (resolved.width as number)) {
        result = alignText(result, resolved.width as number, resolved.align ?? 'left');
      }
    } else if (resolved.align && resolved.align !== 'left') {
      // align without width is a no-op (nothing to align to)
    }

    // Apply height constraints
    if (resolved.height !== undefined) {
      const lines = result.split('\n');
      const targetHeight = resolved.height as number;
      if (lines.length > targetHeight) {
        result = lines.slice(0, targetHeight).join('\n');
      } else if (lines.length < targetHeight) {
        const gap = targetHeight - lines.length;
        const emptyLine = ' '.repeat(resolved.width ?? Math.max(...lines.map((l) => visualWidth(l))));
        result = result + '\n' + Array.from({ length: gap }, () => emptyLine).join('\n');
      }
    }

    // Apply padding
    if (resolved.padding !== undefined) {
      const [top, right, bottom, left] = normalizeSides(resolved.padding as number | [number, number] | [number, number, number, number]);
      const lines = result.split('\n');
      const paddedLines = lines.map((line) => ' '.repeat(left) + line + ' '.repeat(right));
      const maxLineWidth = (resolved.width as number) ?? Math.max(...lines.map((l) => visualWidth(l)));
      const emptyLine = ' '.repeat(left + maxLineWidth + right);
      const topLines = Array.from({ length: top }, () => emptyLine);
      const bottomLines = Array.from({ length: bottom }, () => emptyLine);
      result = [...topLines, ...paddedLines, ...bottomLines].join('\n');
    }

    // Apply border (with optional borderColor)
    if (resolved.border !== undefined) {
      result = borderNs.render(result, resolved.border, resolved.width, resolved.borderColor);
    }

    // Apply text decorations
    let prefix = '';
    let suffix = '';

    if (resolved.color) {
      prefix += resolved.color.fg();
      suffix = '\x1b[39m' + suffix;
    }

    if (resolved.background) {
      prefix += resolved.background.bg();
      suffix = '\x1b[49m' + suffix;
    }

    for (const key of DECORATION_KEYS) {
      if (resolved[key]) {
        const codes = ANSI_CODES[key as DecorationKey];
        prefix += codes.on;
        suffix = codes.off + suffix;
      }
    }

    if (prefix || suffix) {
      result = prefix + result + suffix;
    }

    // Apply margin (outer spacing — blank lines/spaces around the rendered block)
    if (resolved.margin !== undefined) {
      const [mTop, mRight, mBottom, mLeft] = normalizeSides(resolved.margin as number | [number, number] | [number, number, number, number]);
      const lines = result.split('\n');
      const innerWidth = Math.max(...lines.map((l) => visualWidth(stripAnsi(l))));
      const outerWidth = innerWidth + mLeft + mRight;
      const blankLine = ' '.repeat(outerWidth);
      const margined = lines.map((line) => ' '.repeat(mLeft) + line + ' '.repeat(mRight));
      const topLines = Array.from({ length: mTop }, () => blankLine);
      const bottomLines = Array.from({ length: mBottom }, () => blankLine);
      result = [...topLines, ...margined, ...bottomLines].join('\n');
    }

    return result;
  }

  merge(overrides: Partial<StyleProps>): Style {
    return new StyleImpl(mergeStyles(this.props, overrides as StyleProps));
  }

  unset<K extends keyof StyleProps>(key: K): Style {
    const newProps = { ...this.props };
    delete newProps[key];
    return new StyleImpl(newProps);
  }

  measureWidth(text: string, breakpoint: BreakpointName = 'md'): number {
    const resolved = this.resolve(breakpoint);
    if (resolved.width !== undefined) return resolved.width as number;
    return visualWidth(text);
  }
}

// --- Deep merge utility ---

function isResponsiveMapCheck(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return BP_ORDER.some((bp) => Object.hasOwn(value as Record<string, unknown>, bp));
}

function mergeEffects(base: StyleProps['effects'], override: StyleProps['effects']): StyleProps['effects'] {
  if (base === undefined) return override;
  if (override === undefined) return base;

  if (isResponsiveMapCheck(base) && isResponsiveMapCheck(override)) {
    const result: Record<string, unknown> = {};
    const baseMap = base as Record<string, StyleEffects>;
    const overMap = override as Record<string, StyleEffects>;
    const allKeys = new Set([...Object.keys(baseMap), ...Object.keys(overMap)]);
    for (const bp of allKeys) {
      if (baseMap[bp] && overMap[bp]) {
        result[bp] = { ...baseMap[bp], ...overMap[bp] };
      } else {
        result[bp] = overMap[bp] ?? baseMap[bp];
      }
    }
    return result as Responsive<StyleEffects>;
  }

  if (!isResponsiveMapCheck(base) && !isResponsiveMapCheck(override)) {
    return { ...(base as StyleEffects), ...(override as StyleEffects) };
  }

  return override;
}

function mergeTwo(base: StyleProps, override: StyleProps): StyleProps {
  const result: Record<string, unknown> = { ...base };

  for (const key of Object.keys(override) as (keyof StyleProps)[]) {
    const overVal = override[key];
    if (overVal === undefined) continue;

    const baseVal = base[key];

    if (key === 'effects') {
      result[key] = mergeEffects(baseVal as StyleProps['effects'], overVal as StyleProps['effects']);
      continue;
    }

    if (isResponsiveMapCheck(baseVal) && isResponsiveMapCheck(overVal)) {
      result[key] = { ...(baseVal as Record<string, unknown>), ...(overVal as Record<string, unknown>) };
      continue;
    }

    result[key] = overVal;
  }

  return result as StyleProps;
}

/**
 * Deep-merge multiple StyleProps objects with responsive-aware semantics.
 * Later values override earlier ones. Responsive breakpoint maps are
 * union-merged (individual breakpoint keys from both sides are kept,
 * with later values winning on key conflicts).
 */
export function mergeStyles(...styles: StyleProps[]): StyleProps {
  if (styles.length === 0) return {};
  if (styles.length === 1) return { ...styles[0] };
  return styles.reduce((acc, s) => mergeTwo(acc, s), {} as StyleProps);
}

/** Create a new style object */
export function style(props: StyleProps): Style {
  return new StyleImpl(props);
}
