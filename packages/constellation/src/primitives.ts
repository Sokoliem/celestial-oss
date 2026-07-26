/**
 * Shared visual primitives for application chrome.
 *
 * Components own state; these helpers own the semantic presentation and
 * interaction vocabulary so applications do not recreate it.
 */
import type { ElevationLevel, Style, ThemeGlyphs, ThemeInput, Tone } from '@celestial/core/corona';
import { resolveElevationBorder, style } from '@celestial/core/corona';
import type { ThemeContext, VNode } from '@celestial/core/nebula';
import { box, column, event, row, setVNodeMeta, text } from '@celestial/core/nebula';
import { resolveTheme } from './theme.js';

export type SemanticTextRole =
  | 'body'
  | 'title'
  | 'label'
  | 'heading'
  | 'muted'
  | 'action'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger';

export interface SemanticTextOptions {
  readonly role?: SemanticTextRole;
  readonly theme?: ThemeInput;
  readonly themeCtx?: ThemeContext;
  readonly wrap?: boolean;
  readonly bold?: boolean;
  readonly dim?: boolean;
}

export interface SemanticStyles {
  readonly body: Style;
  readonly title: Style;
  readonly label: Style;
  readonly heading: Style;
  readonly muted: Style;
  readonly action: Style;
  readonly info: Style;
  readonly success: Style;
  readonly warning: Style;
  readonly danger: Style;
}

/** Resolve the canonical semantic text styles for non-builder composition. */
export function semanticStyles(
  options: Pick<SemanticTextOptions, 'theme' | 'themeCtx'> = {},
): SemanticStyles {
  const theme = resolveTheme(options);
  return Object.freeze({
    body: style({ color: theme.colors.text }),
    title: style({ color: theme.colors.text, bold: true }),
    label: style({ color: theme.colors.textSoft, bold: true }),
    heading: style({ color: theme.colors.tones.accent, bold: true }),
    muted: style({ color: theme.colors.muted }),
    action: style({ color: theme.colors.interactive, bold: true }),
    info: style({ color: theme.colors.tones.info }),
    success: style({ color: theme.colors.tones.success }),
    warning: style({ color: theme.colors.tones.warning }),
    danger: style({ color: theme.colors.tones.danger, bold: true }),
  });
}

/** Resolve a glyph from the active semantic theme. */
export function semanticGlyph(
  name: keyof ThemeGlyphs,
  options: Pick<SemanticTextOptions, 'theme' | 'themeCtx'> = {},
): string {
  return resolveTheme(options).glyphs[name];
}

/** Render text from semantic theme roles rather than caller-owned styles. */
export function semanticText(content: string, options: SemanticTextOptions = {}): VNode {
  const role = options.role ?? 'body';
  const baseStyle = semanticStyles(options)[role];
  return text(
    content,
    style({
      ...baseStyle,
      bold:
        options.bold
        ?? (role === 'heading' || role === 'title' || role === 'action'),
      dim: options.dim,
    }),
    { wrap: options.wrap },
  );
}

export interface SurfaceFrameOptions {
  readonly content: VNode;
  readonly elevation: ElevationLevel;
  readonly title?: string;
  readonly width?: number;
  readonly height?: number;
  readonly padding?: number | [number, number];
  readonly hovered?: boolean;
  readonly focused?: boolean;
  readonly role?: 'dialog' | 'region' | 'status' | 'alert' | 'menu';
  readonly label?: string;
  readonly theme?: ThemeInput;
  readonly themeCtx?: ThemeContext;
}

export interface ThemedRootOptions {
  readonly theme?: ThemeInput;
  readonly themeCtx?: ThemeContext;
}

/** Apply the active theme's application foreground/background to a subtree. */
export function themedRoot(
  content: VNode,
  options: ThemedRootOptions = {},
): VNode {
  const theme = resolveTheme(options);
  return box(
    content,
    style({
      color: theme.colors.text,
      background: theme.colors.bg,
    }),
  );
}

/** Render a framed surface from the active theme's elevation contract. */
export function surfaceFrame(options: SurfaceFrameOptions): VNode {
  const theme = resolveTheme(options);
  const elevation = theme.elevation[options.elevation];
  const borderColor =
    options.focused || options.hovered
      ? theme.colors.borderHover
      : elevation.border ?? theme.colors.border;
  const background = elevation.surface ?? theme.colors.surfaceRaised;
  const children =
    options.title === undefined
      ? options.content
      : column(
          semanticText(options.title, {
            role: 'heading',
            theme,
          }),
          text(''),
          options.content,
        );
  const node = box(
    children,
    style({
      border: resolveElevationBorder(theme, options.elevation),
      borderColor,
      background,
      padding: options.padding ?? 1,
      width: options.width,
    }),
    {
      fit: 'content',
      ...(options.width === undefined ? {} : { width: options.width }),
      ...(options.height === undefined ? {} : { height: options.height }),
    },
  );
  if (options.role !== undefined || options.label !== undefined) {
    setVNodeMeta(node, {
      a11y: {
        role: options.role ?? 'region',
        label: options.label ?? options.title,
      },
    });
  }
  return node;
}

export type ActionControlVariant = 'filled' | 'outline' | 'ghost';

export interface ActionControlOptions {
  readonly id: string;
  readonly label: string;
  readonly onClick: string;
  readonly onRightClick?: string;
  readonly onMouseEnter?: string;
  readonly onMouseLeave?: string;
  readonly onScroll?: string;
  readonly tone?: Tone;
  readonly variant?: ActionControlVariant;
  readonly hovered?: boolean;
  readonly focused?: boolean;
  readonly selected?: boolean;
  readonly disabled?: boolean;
  readonly keyboardHint?: string;
  readonly intent?: string;
  readonly theme?: ThemeInput;
  readonly themeCtx?: ThemeContext;
}

/** Canonical event-driven action control used by components and applications. */
export function actionControl(options: ActionControlOptions): VNode {
  const theme = resolveTheme(options);
  const variant = options.variant ?? 'outline';
  const tone = options.tone ?? 'neutral';
  const toneColor = tone === 'neutral' ? theme.colors.interactive : theme.colors.tones[tone];
  const active = options.hovered || options.focused || options.selected;
  const background = active
    ? options.selected
      ? theme.states.selected.bg ?? theme.colors.surfaceAlt
      : theme.states.hover.bg ?? theme.colors.surfaceAlt
    : variant === 'filled'
      ? toneColor
      : undefined;
  const foreground = options.disabled
    ? theme.states.disabled.fg
    : variant === 'filled' && !active
      ? theme.colors.inverse
      : active
        ? theme.states.hover.fg
        : toneColor;
  const visibleLabel = options.disabled
    ? `${options.label} disabled`
    : options.label;
  const rendered =
    variant === 'ghost'
      ? visibleLabel
      : variant === 'filled'
        ? `▐ ${visibleLabel} ▌`
        : `[${visibleLabel}]`;
  const visual = text(
    rendered,
    style({
      color: foreground,
      background,
      bold: !options.disabled && (active || variant === 'filled'),
      dim: options.disabled,
      underline: variant === 'ghost' && active,
    }),
  );
  if (options.disabled) {
    setVNodeMeta(visual, {
      states: ['disabled'],
      a11y: { role: 'button', label: options.label, disabled: true },
    });
    return visual;
  }
  const node = event(
    options.id,
    visual,
    {
      onClick: options.onClick,
      onRightClick: options.onRightClick,
      onMouseEnter: options.onMouseEnter,
      onMouseLeave: options.onMouseLeave,
      onScroll: options.onScroll,
    },
    {
      label: options.label,
      intent: options.intent ?? 'activate',
      affordances: options.onScroll === undefined ? ['hover', 'click'] : ['hover', 'click', 'scroll'],
      cursor: 'pointer',
      keyboardHint: options.keyboardHint,
    },
  );
  setVNodeMeta(node, {
    ...(options.selected ? { states: ['selected'] } : {}),
    a11y: {
      role: 'button',
      label: options.label,
      selected: options.selected,
    },
  });
  return node;
}

export interface InteractiveRowOptions extends Omit<ActionControlOptions, 'label' | 'variant' | 'tone'> {
  readonly content: VNode;
  readonly label: string;
  readonly shortcut?: string;
}

/** Canonical selectable row chrome for palettes, menus, and list surfaces. */
export function interactiveRow(options: InteractiveRowOptions): VNode {
  const theme = resolveTheme(options);
  const active = options.hovered || options.focused || options.selected;
  const background = active
    ? options.selected
      ? theme.states.selected.bg ?? theme.colors.surfaceAlt
      : theme.states.hover.bg ?? theme.colors.surfaceAlt
    : undefined;
  const foreground = options.disabled
    ? theme.states.disabled.fg
    : active
      ? theme.states.hover.fg
      : theme.colors.text;
  const visual = box(
    row(options.content),
    style({
      color: foreground,
      background,
      dim: options.disabled,
    }),
  );
  if (options.disabled) {
    setVNodeMeta(visual, {
      states: ['disabled'],
      a11y: {
        role: 'menuitem',
        label: options.label,
        disabled: true,
        selected: options.selected,
      },
    });
    return visual;
  }
  const node = event(
    options.id,
    visual,
    {
      onClick: options.onClick,
      onRightClick: options.onRightClick,
      onMouseEnter: options.onMouseEnter,
      onMouseLeave: options.onMouseLeave,
      onScroll: options.onScroll,
    },
    {
      label: options.label,
      intent: options.intent ?? 'select',
      affordances: options.onScroll === undefined ? ['hover', 'click'] : ['hover', 'click', 'scroll'],
      cursor: 'pointer',
      keyboardHint: options.shortcut ?? options.keyboardHint,
    },
  );
  setVNodeMeta(node, {
    ...(options.selected ? { states: ['selected'] } : {}),
    a11y: {
      role: 'menuitem',
      label: options.label,
      selected: options.selected,
    },
  });
  return node;
}
