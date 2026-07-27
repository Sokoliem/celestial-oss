/**
 * Horizon Panel Components
 *
 * Higher-level styled panel components that combine borders, colors, and layout.
 * These components return VNodes ready for use in splitPane(), tabbedPane(), etc.
 */

import {
  type Border,
  type Color,
  color,
  createTheme,
  defaultTheme,
  resolveElevationBorder,
  type SemanticTheme,
  style,
  type ThemeInput,
} from '@celestial/core/corona';
import { box, column, flex, text, type ThemeContext, type VNode } from '@celestial/core/nebula';
import { splitPane } from './split.js';

interface PanelThemeConfig {
  /** Static theme override for this pane. */
  theme?: ThemeInput;
  /** Reactive host theme. Takes precedence over `theme`. */
  themeCtx?: ThemeContext;
}

function resolvePanelTheme(config: PanelThemeConfig): SemanticTheme {
  return config.themeCtx?.current() ?? (config.theme ? createTheme(config.theme) : defaultTheme);
}

export interface PanelStyle extends PanelThemeConfig {
  /** Optional title displayed in the top */
  title?: string;
  /** Border style (default: the active theme's raised elevation border) */
  borderStyle?: Border;
  /** Border/text color (default: semantic panel border) */
  borderColor?: Color;
  /** Title text color (default: semantic title text) */
  titleColor?: Color;
  /** Focus state - changes border to focusColor */
  focused?: boolean;
  /** Focus highlight color (default: semantic focus border) */
  focusColor?: Color;
  /** Padding (default: 0) */
  padding?: number | [number, number] | [number, number, number, number];
  /** Keep the panel at its allocated layout height instead of shrinking to content */
  fill?: boolean;
  /** Background color used when fill is enabled */
  fillColor?: Color;
}

export interface PanelConfig extends PanelStyle {
  /** Content inside the panel */
  content: VNode;
}

/**
 * Create a simple bordered panel.
 *
 * @example
 * panel({
 *   title: 'Files',
 *   content: column(text('file1.ts'), text('file2.ts')),
 *   borderColor: color.cyan,
 * })
 */
export function panel(config: PanelConfig): VNode {
  const theme = resolvePanelTheme(config);
  const {
    content,
    title,
    borderStyle = resolveElevationBorder(theme, 'raised'),
    borderColor = theme.elevation.raised.border ?? theme.colors.border,
    titleColor = theme.typography.title.color,
    focused = false,
    focusColor = theme.states.focus.border ?? theme.colors.borderActive,
    padding = 0,
    fill = false,
    fillColor = theme.elevation.raised.surface ?? theme.colors.surface,
  } = config;

  const activeColor = focused ? focusColor : borderColor;
  const R = color.reset.fg();

  const body = fill ? flex(content, { flex: 1 }) : content;
  const panelContent = title ? column(text(`${titleColor.fg()}${title}${R}`), body) : body;

  const s = style({ color: activeColor, padding, border: borderStyle, ...(fill ? { background: fillColor } : {}) });

  return box(panelContent, s, fill ? { overflow: 'hidden' } : undefined);
}

export interface TitledPaneConfig extends PanelConfig {
  /** Header content (overrides title string) */
  header?: VNode;
  /** Show divider between header and body */
  headerDivider?: boolean;
  /** Footer content */
  footer?: VNode;
}

/**
 * Create a panel with distinct header/body/footer sections.
 *
 * @example
 * titledPane({
 *   title: 'Files',
 *   content: fileList,
 *   footer: hint('Press Enter to open'),
 * })
 */
export function titledPane(config: TitledPaneConfig): VNode {
  const theme = resolvePanelTheme(config);
  const {
    content,
    title,
    header,
    footer,
    headerDivider = true,
    borderStyle = resolveElevationBorder(theme, 'raised'),
    borderColor = theme.elevation.raised.border ?? theme.colors.border,
    titleColor = theme.typography.title.color,
    focused = false,
    focusColor = theme.states.focus.border ?? theme.colors.borderActive,
    padding = 0,
    fill = false,
    fillColor = theme.elevation.raised.surface ?? theme.colors.surface,
  } = config;

  const activeColor = focused ? focusColor : borderColor;
  const R = color.reset.fg();
  const children: VNode[] = [];

  if (header) {
    children.push(header);
  } else if (title) {
    children.push(text(`${titleColor.fg()}${title}${R}`));
  }

  if (headerDivider && (header || title)) {
    const chars = borderStyle.chars;
    children.push(text(`${activeColor.fg()}${chars.top.repeat(20)}${R}`));
  }

  children.push(fill ? flex(content, { flex: 1 }) : content);

  if (footer) {
    children.push(footer);
  }

  const s = style({ color: activeColor, padding, border: borderStyle, ...(fill ? { background: fillColor } : {}) });

  return box(column(...children), s, fill ? { overflow: 'hidden' } : undefined);
}

export interface CollapsiblePaneConfig extends PanelThemeConfig {
  /** Unique ID for this pane */
  id: string;
  /** Title shown in header */
  title: string;
  /** Content when expanded */
  content: VNode;
  /** Current collapsed state */
  collapsed: boolean;
  /** Border style */
  borderStyle?: Border;
  /** Border color */
  borderColor?: Color;
  /** Title color */
  titleColor?: Color;
  /** Character to show expand indicator */
  expandChar?: string;
  /** Character to show collapse indicator */
  collapseChar?: string;
}

/**
 * Create a collapsible panel that shows only a toggle indicator when collapsed.
 *
 * @example
 * collapsiblePane({
 *   id: 'sidebar',
 *   title: 'Files',
 *   content: fileTree,
 *   collapsed: model.sidebarCollapsed,
 * })
 */
export function collapsiblePane(config: CollapsiblePaneConfig): VNode {
  const theme = resolvePanelTheme(config);
  const {
    title,
    content,
    collapsed,
    borderStyle = resolveElevationBorder(theme, 'raised'),
    borderColor = theme.elevation.raised.border ?? theme.colors.border,
    titleColor = theme.typography.title.color,
    expandChar = theme.glyphs.pointer,
    collapseChar = theme.glyphs.menuArrow,
  } = config;

  if (collapsed) {
    return box(text(`${borderColor.fg()}${expandChar}${color.reset.fg()}`), style({ color: borderColor }));
  }

  return titledPane({
    title: `${collapseChar} ${title}`,
    content,
    borderStyle,
    borderColor,
    titleColor,
    theme: config.theme,
    themeCtx: config.themeCtx,
  });
}

export interface SplitPanelLayoutConfig {
  /** First pane content */
  first: VNode;
  /** Second pane content */
  second: VNode;
  /** Split direction */
  direction: 'horizontal' | 'vertical';
  /** Ratio for first pane (0.0-1.0) */
  ratio?: number;
  /** Separator character */
  separator?: string;
  /** First panel config */
  firstConfig?: PanelConfig;
  /** Second panel config */
  secondConfig?: PanelConfig;
}

/**
 * Create a split pane with two styled panels.
 *
 * @example
 * splitPanelLayout({
 *   first: fileTree,
 *   second: editor,
 *   direction: 'horizontal',
 *   ratio: 0.2,
 *   firstConfig: { title: 'Files' },
 *   secondConfig: { title: 'Editor' },
 * })
 */
export function splitPanelLayout(config: SplitPanelLayoutConfig): VNode {
  const { first, second, direction, ratio = 0.5, separator, firstConfig, secondConfig } = config;

  const { content: _f, ...firstStyle } = firstConfig || ({} as PanelConfig);
  const { content: _s, ...secondStyle } = secondConfig || ({} as PanelConfig);
  const firstPanel = firstConfig ? panel({ ...firstStyle, content: first }) : first;
  const secondPanel = secondConfig ? panel({ ...secondStyle, content: second }) : second;

  return splitPane({
    direction,
    ratio,
    first: firstPanel,
    second: secondPanel,
    separator,
  });
}
