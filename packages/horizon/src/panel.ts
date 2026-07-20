/**
 * Horizon Panel Components
 *
 * Higher-level styled panel components that combine borders, colors, and layout.
 * These components return VNodes ready for use in splitPane(), tabbedPane(), etc.
 */

import { type Border, border, type Color, color, defaultTheme, style } from '@celestial/core/corona';
import { box, column, flex, text, type VNode } from '@celestial/core/nebula';
import { splitPane } from './split.js';

const PANEL_BORDER_COLOR = defaultTheme.elevation.raised.border ?? defaultTheme.colors.border;
const PANEL_TITLE_COLOR = defaultTheme.typography.title.color;
const PANEL_FOCUS_COLOR = defaultTheme.states.focus.border ?? defaultTheme.colors.borderActive;
const PANEL_EXPAND_GLYPH = defaultTheme.glyphs.pointer;
const PANEL_COLLAPSE_GLYPH = defaultTheme.glyphs.menuArrow;

export interface PanelStyle {
  /** Optional title displayed in the top */
  title?: string;
  /** Border style (default: border.rounded) */
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
  const {
    content,
    title,
    borderStyle = border.rounded,
    borderColor = PANEL_BORDER_COLOR,
    titleColor = PANEL_TITLE_COLOR,
    focused = false,
    focusColor = PANEL_FOCUS_COLOR,
    padding = 0,
    fill = false,
    fillColor = defaultTheme.elevation.raised.surface ?? defaultTheme.colors.surface,
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
  const {
    content,
    title,
    header,
    footer,
    headerDivider = true,
    borderStyle = border.rounded,
    borderColor = PANEL_BORDER_COLOR,
    titleColor = PANEL_TITLE_COLOR,
    focused = false,
    focusColor = PANEL_FOCUS_COLOR,
    padding = 0,
    fill = false,
    fillColor = defaultTheme.elevation.raised.surface ?? defaultTheme.colors.surface,
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

export interface CollapsiblePaneConfig {
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
  const {
    title,
    content,
    collapsed,
    borderStyle = border.rounded,
    borderColor = PANEL_BORDER_COLOR,
    titleColor = PANEL_TITLE_COLOR,
    expandChar = PANEL_EXPAND_GLYPH,
    collapseChar = PANEL_COLLAPSE_GLYPH,
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
