/**
 * Extracted from ../vdom.ts. Behavior-preserving split.
 */

import type { Responsive, StyleEffects } from '@celestial/corona';

/** StyleEffects with tint resolved to an ANSI escape string (not a Color object). */
export type ResolvedStyleEffects = Omit<StyleEffects, 'tint'> & { tint?: string };

export interface StyleAttrs {
  fg?: Responsive<string>; // foreground ANSI escape
  bg?: Responsive<string>; // background ANSI escape
  /** RGB tuple for foreground color — used by screenshot/PNG renderers */
  fgRgb?: Responsive<[number, number, number] | null>;
  /** RGB tuple for background color — used by screenshot/PNG renderers */
  bgRgb?: Responsive<[number, number, number] | null>;
  /** Foreground applied only to box border characters */
  borderFg?: Responsive<string>;
  /** RGB tuple applied only to box border characters */
  borderFgRgb?: Responsive<[number, number, number] | null>;
  bold?: Responsive<boolean>;
  dim?: Responsive<boolean>;
  italic?: Responsive<boolean>;
  underline?: Responsive<boolean>;
  strikethrough?: Responsive<boolean>;
  blink?: Responsive<boolean>;
  reverse?: Responsive<boolean>;
  hidden?: Responsive<boolean>;
  /** Modern visual effects passed to the shader pipeline */
  effects?: Responsive<ResolvedStyleEffects>;
  /** Z-axis elevation (0-24) for shadow generation */
  elevation?: Responsive<number>;
  /** Nerd Font icon name or hex string to render as prefix */
  icon?: Responsive<string>;
  /** Responsive padding */
  padding?: Responsive<number | [number, number] | [number, number, number, number]>;
  /** Per-character foreground ANSI escape strings for gradient text */
  gradientFg?: string[];
}

export interface ResolvedStyleAttrs {
  fg?: string;
  bg?: string;
  /** RGB tuple for foreground color — used by screenshot/PNG renderers */
  fgRgb?: [number, number, number] | null;
  /** RGB tuple for background color — used by screenshot/PNG renderers */
  bgRgb?: [number, number, number] | null;
  /** Foreground applied only to box border characters */
  borderFg?: string;
  /** RGB tuple applied only to box border characters */
  borderFgRgb?: [number, number, number] | null;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  blink?: boolean;
  reverse?: boolean;
  hidden?: boolean;
  effects?: ResolvedStyleEffects;
  elevation?: number;
  icon?: string;
  padding?: number | [number, number] | [number, number, number, number];
  /** Per-character foreground ANSI escape strings for gradient text */
  gradientFg?: string[];
}

export interface EchoHint {
  readonly kind: 'text-input';
  readonly value: string;
  readonly cursor: number;
  readonly mask?: string;
}

export interface LayoutSpace {
  readonly cols: number;
  readonly rows: number;
}

export interface ComponentRenderContext {
  readonly terminal: LayoutSpace;
  readonly available: LayoutSpace;
  readonly container: LayoutSpace;
}
