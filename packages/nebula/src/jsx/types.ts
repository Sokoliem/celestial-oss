import type { Border, Color, Responsive, Style } from '@celestial/corona';
import type { EventHandlers, RegionMetadata, VNode } from '../vdom.js';

export type Child = VNode | string | number | boolean | null | undefined | Child[];

export interface BaseProps {
  key?: string | number;
  children?: Child;
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
  onClick?: string | (() => void);
  focused?: boolean;
  disabled?: boolean;
  tone?: 'default' | 'primary' | 'secondary' | 'danger' | 'success';
}

export interface TextInputProps extends BaseProps {
  value: string;
  onChange?: (val: string) => void;
  placeholder?: string;
  focused?: boolean;
  cursor?: number;
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
    [elemName: string]: any;
  }
}

declare global {
  namespace JSX {
    type Element = VNode;
    interface ElementChildrenAttribute {
      children: {};
    }
    interface IntrinsicElements {
      box: BoxProps;
      text: TextProps;
      row: RowProps;
      column: ColumnProps;
      scroll: ScrollProps;
      focus: FocusProps;
      divider: DividerProps;
      badge: BadgeProps;
      [elemName: string]: any;
    }
  }
}

