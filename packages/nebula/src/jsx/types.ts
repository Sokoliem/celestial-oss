import type { Border, Color, Responsive, Style } from '@celestial/corona';
import type { EventHandlers, MouseHandler, RegionMetadata, VNode } from '../vdom.js';

export type Child = VNode | string | number | boolean | null | undefined | Child[];

export interface BaseProps {
  /**
   * Accepted for React-style authoring compatibility. Celestial reconciles
   * rendered cells positionally (not via keyed VNode lists), so `key` is
   * currently ignored by the renderer and never forwarded to components.
   */
  key?: string | number;
  children?: Child;
  /**
   * Explicit region id. Required for deterministic snapshots whenever more
   * than one evented element shares the same handlers on one screen; when
   * omitted, a deterministic id is derived from the handler tags.
   */
  id?: string;
}

export interface BoxProps extends BaseProps {
  flexDirection?: 'row' | 'column';
  gap?: number;
  width?: Responsive<number>;
  height?: Responsive<number>;
  fit?: 'fill' | 'content';
  overflow?: 'visible' | 'hidden' | 'scroll';
  scrollOffset?: number;
  border?: boolean | Border | string;
  borderColor?: Responsive<Color>;
  color?: Responsive<Color>;
  bg?: Responsive<Color>;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  padding?: Responsive<number>;
  /** Base style. Individual style props (color, bold, ...) override it. */
  style?: Style;
  onClick?: EventHandlers['onClick'];
  onMouseEnter?: EventHandlers['onMouseEnter'];
  onMouseLeave?: EventHandlers['onMouseLeave'];
  onMouseDown?: EventHandlers['onMouseDown'];
  onMouseUp?: EventHandlers['onMouseUp'];
  region?: RegionMetadata;
}

export interface TextProps extends BaseProps {
  color?: Responsive<Color>;
  bg?: Responsive<Color>;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  wrap?: boolean;
  href?: string;
  /** Base style. Individual style props (color, bold, ...) override it. */
  style?: Style;
}

export interface RowProps extends BaseProps {
  gap?: number;
  style?: Style;
}

export interface ColumnProps extends BaseProps {
  gap?: number;
  style?: Style;
}

export interface ScrollProps extends BaseProps {
  height: number;
  offset?: number;
}

export interface FocusProps extends BaseProps {
  id: string;
  focused?: boolean;
  tabIndex?: number;
  group?: string;
}

export interface ButtonProps extends BaseProps {
  label?: string;
  /**
   * Message tag dispatched when the button is clicked (a string tag or a
   * modifier-aware handler). The message flows through the app's `update`
   * loop like every other interaction.
   */
  onClick?: MouseHandler;
  focused?: boolean;
  disabled?: boolean;
  tone?: 'default' | 'primary' | 'secondary' | 'danger' | 'success';
}

/**
 * Presentational text input for the JSX layer: it renders value, placeholder,
 * focus chrome, and masking, but owns no editing state. For interactive input
 * with cursor movement, selection, and change events, use the `textInput`
 * builder from `@celestial/ui`, which is a full state-machine component.
 */
export interface TextInputProps extends BaseProps {
  value: string;
  placeholder?: string;
  focused?: boolean;
  mask?: boolean | string;
}

export interface BadgeProps extends BaseProps {
  label: string;
  tone?: 'default' | 'info' | 'success' | 'warning' | 'danger';
  variant?: 'solid' | 'subtle' | 'outline';
}

export interface ProgressBarProps extends BaseProps {
  value: number;
  max?: number;
  width?: number;
  tone?: 'default' | 'info' | 'success' | 'warning' | 'danger';
}

export interface SpinnerProps extends BaseProps {
  frame?: number;
  label?: string;
}

export interface DividerProps extends BaseProps {
  label?: string;
  orientation?: 'horizontal' | 'vertical';
}

export interface CardProps extends BaseProps {
  title?: string;
  tone?: 'default' | 'info' | 'success' | 'warning' | 'danger';
  border?: boolean | Border;
  padding?: Responsive<number>;
}

export type ComponentFunction<P = any> = (props: P) => VNode;

export namespace JSX {
  export type Element = VNode;
  export interface ElementChildrenAttribute {
    children: {};
  }
  export interface IntrinsicElements {
    box: BoxProps;
    text: TextProps;
    row: RowProps;
    column: ColumnProps;
    scroll: ScrollProps;
    focus: FocusProps;
    divider: DividerProps;
    badge: BadgeProps;
    button: ButtonProps;
    textInput: TextInputProps;
    progressBar: ProgressBarProps;
    spinner: SpinnerProps;
    card: CardProps;
  }
}
