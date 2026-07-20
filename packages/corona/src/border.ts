/**
 * Corona Border System
 *
 * Pre-defined border character sets and rendering.
 */

import type { Color } from './color.js';
import type { Gradient } from './gradient.js';
import { truncate } from './style.js';
import { visualWidth } from './utils.js';

export interface BorderChars {
  topLeft: string;
  top: string;
  topRight: string;
  left: string;
  right: string;
  bottomLeft: string;
  bottom: string;
  bottomRight: string;
}

export interface Border {
  readonly chars: BorderChars;
}

export type TitleAlign = 'left' | 'center' | 'right';

export interface FocusBorderOptions {
  /** When true, use focusColor instead of the default borderColor */
  focused?: boolean;
  /** Color to use for border characters when focused is true */
  focusColor?: Color;
}

export interface GradientBorderOpts {
  border: Border;
  width: number;
  height: number;
  gradient: Gradient;
  direction?: 'clockwise' | 'horizontal' | 'vertical';
  title?: string;
  titleAlign?: TitleAlign;
}

function createBorder(chars: BorderChars): Border {
  return { chars };
}

/**
 * Wrap a string in the ANSI sequences for a Color's foreground, then reset.
 * When no color is provided the string is returned unchanged.
 */
function applyColor(s: string, c: Color | undefined): string {
  if (!c) return s;
  return `${c.fg()}${s}\x1b[39m`;
}

function clampDimension(value: number): number {
  return Math.max(2, Math.floor(value));
}

function gradientRatioForCell(row: number, col: number, width: number, height: number, direction: NonNullable<GradientBorderOpts['direction']>): number {
  if (direction === 'horizontal') {
    return width <= 1 ? 0 : col / (width - 1);
  }

  if (direction === 'vertical') {
    return height <= 1 ? 0 : row / (height - 1);
  }

  const top = width;
  const right = Math.max(0, height - 2);
  const bottom = width;
  const left = Math.max(0, height - 2);
  const perimeter = Math.max(1, top + right + bottom + left);

  let index = 0;
  if (row === 0) {
    index = col;
  } else if (col === width - 1) {
    index = top + (row - 1);
  } else if (row === height - 1) {
    index = top + right + (width - 1 - col);
  } else {
    index = top + right + bottom + (height - 2 - row);
  }

  return perimeter <= 1 ? 0 : index / (perimeter - 1);
}

function applyGradientChar(
  char: string,
  row: number,
  col: number,
  width: number,
  height: number,
  gradient: Gradient,
  direction: NonNullable<GradientBorderOpts['direction']>,
): string {
  return applyColor(char, gradient.sample(gradientRatioForCell(row, col, width, height, direction)));
}

function colorizeGradientRow(
  template: string,
  row: number,
  width: number,
  height: number,
  gradient: Gradient,
  direction: NonNullable<GradientBorderOpts['direction']>,
): string {
  return Array.from(template)
    .map((char, col) => applyGradientChar(char, row, col, width, height, gradient, direction))
    .join('');
}

export const border = {
  rounded: createBorder({
    topLeft: '╭',
    top: '─',
    topRight: '╮',
    left: '│',
    right: '│',
    bottomLeft: '╰',
    bottom: '─',
    bottomRight: '╯',
  }),

  square: createBorder({
    topLeft: '┌',
    top: '─',
    topRight: '┐',
    left: '│',
    right: '│',
    bottomLeft: '└',
    bottom: '─',
    bottomRight: '┘',
  }),

  double: createBorder({
    topLeft: '╔',
    top: '═',
    topRight: '╗',
    left: '║',
    right: '║',
    bottomLeft: '╚',
    bottom: '═',
    bottomRight: '╝',
  }),

  thick: createBorder({
    topLeft: '┏',
    top: '━',
    topRight: '┓',
    left: '┃',
    right: '┃',
    bottomLeft: '┗',
    bottom: '━',
    bottomRight: '┛',
  }),

  hidden: createBorder({
    topLeft: ' ',
    top: ' ',
    topRight: ' ',
    left: ' ',
    right: ' ',
    bottomLeft: ' ',
    bottom: ' ',
    bottomRight: ' ',
  }),

  custom(chars: BorderChars): Border {
    return createBorder(chars);
  },

  /**
   * Render content inside a border box.
   *
   * @param content      Text content (may be multi-line)
   * @param b            Border style
   * @param width        Optional fixed inner width (content is truncated/padded)
   * @param borderColor  Optional Color applied only to border characters — content
   *                     is left unstyled, solving the pattern where wrapping the
   *                     whole box in a style incorrectly colors the content too.
   * @param focusOptions Optional focus-aware border color options
   */
  render(content: string, b: Border, width?: number, borderColor?: Color, focusOptions?: FocusBorderOptions): string {
    const effectiveColor = focusOptions?.focused && focusOptions?.focusColor ? focusOptions.focusColor : borderColor;
    let lines = content.split('\n');
    const contentWidth = width ?? Math.max(...lines.map((l) => visualWidth(l)));

    // Truncate lines that exceed the specified width
    if (width !== undefined) {
      lines = lines.map((l) => (visualWidth(l) > width ? truncate(l, width) : l));
    }

    const c = effectiveColor;
    const topRow = applyColor(b.chars.topLeft, c) + applyColor(b.chars.top.repeat(contentWidth), c) + applyColor(b.chars.topRight, c);

    const bottomRow = applyColor(b.chars.bottomLeft, c) + applyColor(b.chars.bottom.repeat(contentWidth), c) + applyColor(b.chars.bottomRight, c);

    const middle = lines.map((line) => {
      const pad = contentWidth - visualWidth(line);
      return applyColor(b.chars.left, c) + line + ' '.repeat(Math.max(0, pad)) + applyColor(b.chars.right, c);
    });

    return [topRow, ...middle, bottomRow].join('\n');
  },

  /**
   * Render a border box with a title embedded in the top edge and an optional
   * subtitle in the bottom edge.
   *
   * ```
   * ╭─ My Panel ──────────────╮
   * │  content here           │
   * ╰──────────────── footer ─╯
   * ```
   *
   * @param content       Text content (may be multi-line)
   * @param b             Border style
   * @param width         Inner width of the box (content is truncated/padded)
   * @param title         Title string to embed in the top edge
   * @param options.titleAlign    Horizontal alignment of the title ('left' | 'center' | 'right', default 'left')
   * @param options.subtitle      Optional string to embed in the bottom edge
   * @param options.subtitleAlign Horizontal alignment of the subtitle (default 'right')
   * @param options.borderColor   Optional Color for border characters only
   * @param options.titleColor    Optional Color for the title text
   * @param options.subtitleColor Optional Color for the subtitle text
   */
  titled(
    content: string,
    b: Border,
    width: number,
    title: string,
    options: {
      titleAlign?: TitleAlign;
      subtitle?: string;
      subtitleAlign?: TitleAlign;
      borderColor?: Color;
      titleColor?: Color;
      subtitleColor?: Color;
      focused?: boolean;
      focusColor?: Color;
    } = {},
  ): string {
    const { titleAlign = 'left', subtitle, subtitleAlign = 'right', borderColor, titleColor: tc, subtitleColor: sc, focused, focusColor } = options;

    const bc = focused && focusColor ? focusColor : borderColor;

    // Sanitize title to fit within available space
    // Available dash space = width - 2 (one space padding each side of title)
    const maxTitleLen = Math.max(0, width - 2);
    const safeTitle = visualWidth(title) > maxTitleLen ? truncate(title, maxTitleLen) : title;
    const titleLen = visualWidth(safeTitle);

    // Build top edge with embedded title
    const topEdge = buildTitledEdge(b.chars.topLeft, b.chars.top, b.chars.topRight, width, safeTitle, titleLen, titleAlign, bc, tc);

    // Build bottom edge with optional subtitle
    let bottomEdge: string;
    if (subtitle !== undefined) {
      const maxSubLen = Math.max(0, width - 2);
      const safeSub = visualWidth(subtitle) > maxSubLen ? truncate(subtitle, maxSubLen) : subtitle;
      const subLen = visualWidth(safeSub);
      bottomEdge = buildTitledEdge(b.chars.bottomLeft, b.chars.bottom, b.chars.bottomRight, width, safeSub, subLen, subtitleAlign, bc, sc);
    } else {
      bottomEdge = applyColor(b.chars.bottomLeft, bc) + applyColor(b.chars.bottom.repeat(width), bc) + applyColor(b.chars.bottomRight, bc);
    }

    // Content lines
    let lines = content.split('\n');
    if (lines.map((l) => visualWidth(l)).some((w) => w > width)) {
      lines = lines.map((l) => (visualWidth(l) > width ? truncate(l, width) : l));
    }
    const middle = lines.map((line) => {
      const pad = width - visualWidth(line);
      return applyColor(b.chars.left, bc) + line + ' '.repeat(Math.max(0, pad)) + applyColor(b.chars.right, bc);
    });

    return [topEdge, ...middle, bottomEdge].join('\n');
  },
} as const;

export function renderGradientBorder(opts: GradientBorderOpts): string {
  const width = clampDimension(opts.width);
  const height = clampDimension(opts.height);
  const innerWidth = Math.max(0, width - 2);
  const innerHeight = Math.max(0, height - 2);
  const direction = opts.direction ?? 'clockwise';

  const rawTop =
    opts.title !== undefined
      ? (() => {
          const maxTitleLen = Math.max(0, innerWidth - 2);
          const safeTitle = visualWidth(opts.title) > maxTitleLen ? truncate(opts.title, maxTitleLen) : opts.title;
          return buildTitledEdge(
            opts.border.chars.topLeft,
            opts.border.chars.top,
            opts.border.chars.topRight,
            innerWidth,
            safeTitle,
            visualWidth(safeTitle),
            opts.titleAlign ?? 'left',
            undefined,
            undefined,
          );
        })()
      : opts.border.chars.topLeft + opts.border.chars.top.repeat(innerWidth) + opts.border.chars.topRight;

  const rawBottom = opts.border.chars.bottomLeft + opts.border.chars.bottom.repeat(innerWidth) + opts.border.chars.bottomRight;
  const rows: string[] = [colorizeGradientRow(rawTop, 0, width, height, opts.gradient, direction)];

  for (let row = 0; row < innerHeight; row++) {
    rows.push(
      applyGradientChar(opts.border.chars.left, row + 1, 0, width, height, opts.gradient, direction) +
        ' '.repeat(innerWidth) +
        applyGradientChar(opts.border.chars.right, row + 1, width - 1, width, height, opts.gradient, direction),
    );
  }

  rows.push(colorizeGradientRow(rawBottom, height - 1, width, height, opts.gradient, direction));
  return rows.join('\n');
}

// ── Internal helper ──────────────────────────────────────────────────────────

/**
 * Build a single horizontal border edge (top or bottom) with a label string
 * embedded at the requested alignment position.
 *
 * The label is surrounded by a single space on each side, so a 10-wide box
 * with title "Hi" produces:  ╭─ Hi ──────╮
 */
function buildTitledEdge(
  leftCorner: string,
  dash: string,
  rightCorner: string,
  width: number,
  label: string,
  labelLen: number,
  align: TitleAlign,
  bc: Color | undefined,
  lc: Color | undefined,
): string {
  // Segment lengths: total dashes = width - 2 (for the spaces flanking the label)
  const totalDashes = Math.max(0, width - labelLen - 2);
  let leftDashes: number;
  let rightDashes: number;

  if (align === 'left') {
    leftDashes = Math.min(1, totalDashes);
    rightDashes = Math.max(0, totalDashes - leftDashes);
  } else if (align === 'right') {
    rightDashes = Math.min(1, totalDashes);
    leftDashes = Math.max(0, totalDashes - rightDashes);
  } else {
    // center
    leftDashes = Math.floor(totalDashes / 2);
    rightDashes = totalDashes - leftDashes;
  }

  return (
    applyColor(leftCorner, bc) +
    applyColor(dash.repeat(leftDashes), bc) +
    applyColor(' ', bc) +
    applyColor(label, lc) +
    applyColor(' ', bc) +
    applyColor(dash.repeat(rightDashes), bc) +
    applyColor(rightCorner, bc)
  );
}
