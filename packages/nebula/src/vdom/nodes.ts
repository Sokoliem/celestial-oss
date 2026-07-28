/**
 * Extracted from ../vdom.ts. Behavior-preserving split.
 */

import type { Responsive } from '@celestial/corona';
import type { PointerCursor } from '../pointer-cursor.js';
import type { ComponentRenderContext, EchoHint, StyleAttrs } from './style.js';

// --- Virtual Node Types ---

export interface TextNode {
  readonly kind: 'text';
  readonly content: string;
  readonly style?: StyleAttrs;
  readonly wrap?: boolean; // word-wrap at container bounds
  readonly href?: string; // OSC 8 hyperlink URL
  readonly layoutId?: string;
  readonly layoutDirty?: boolean;
}

export interface BoxNode {
  readonly kind: 'box';
  readonly children: VNode[];
  readonly style?: StyleAttrs;
  readonly border?: {
    topLeft: string;
    top: string;
    topRight: string;
    left: string;
    right: string;
    bottomLeft: string;
    bottom: string;
    bottomRight: string;
  };
  readonly width?: Responsive<number>;
  readonly height?: Responsive<number>;
  /** Fill available space by default, or hug measured content on both axes. */
  readonly fit?: 'fill' | 'content';
  readonly overflow?: 'visible' | 'hidden' | 'scroll';
  readonly scrollOffset?: number;
  readonly minWidth?: number;
  readonly maxWidth?: number;
  readonly minHeight?: number;
  readonly maxHeight?: number;
  readonly layoutId?: string;
  readonly layoutDirty?: boolean;
}

export interface RowNode {
  readonly kind: 'row';
  readonly children: VNode[];
  readonly gap?: number;
  readonly layoutId?: string;
  readonly layoutDirty?: boolean;
}

export interface ColumnNode {
  readonly kind: 'column';
  readonly children: VNode[];
  readonly gap?: number;
  readonly layoutId?: string;
  readonly layoutDirty?: boolean;
}

export interface ScrollNode {
  readonly kind: 'scroll';
  readonly child: VNode;
  readonly offset: number;
  readonly height: number;
  readonly layoutId?: string;
  readonly layoutDirty?: boolean;
}

export interface FocusNode {
  readonly kind: 'focus';
  readonly child: VNode;
  readonly id: string;
  readonly focused: boolean;
  readonly tabIndex?: number; // ordering for tab navigation
  readonly group?: string; // focus group (for traps)
  readonly echoHint?: EchoHint;
  readonly layoutId?: string;
  readonly layoutDirty?: boolean;
}

export interface EmptyNode {
  readonly kind: 'empty';
  readonly width?: Responsive<number>;
  readonly height?: Responsive<number>;
  readonly layoutId?: string;
  readonly layoutDirty?: boolean;
}

export interface ComponentNode {
  readonly kind: 'component';
  readonly render: (context?: ComponentRenderContext) => VNode;
  readonly key?: string;
  readonly layoutId?: string;
  readonly layoutDirty?: boolean;
}

/**
 * Click handler that varies by mouse modifier state. Use this when a region
 * should route different messages depending on whether Shift/Ctrl/Alt are
 * held — for example, Shift-click for range selection, Ctrl-click for toggle,
 * Alt-click for a secondary action. The runtime resolves the precise variant
 * from the live `MouseEventData` modifier flags. `default` fires when no
 * modifier matches a more specific variant.
 *
 * Backwards compatibility: a plain `string` handler is treated as `default`,
 * so existing components keep working unchanged.
 *
 * The shape is split into three union arms so an empty `{}` is unrepresentable
 * — every modifier handler must wire at least one variant. Without this, a
 * stray `{}` would type-check and silently swallow all clicks because the
 * resolver returns `undefined`. This makes the footgun a compile error.
 */
export type MouseModifierHandler =
  | {
      readonly default: string;
      readonly shift?: string;
      readonly ctrl?: string;
      readonly alt?: string;
      readonly shiftCtrl?: string;
      readonly shiftAlt?: string;
      readonly ctrlAlt?: string;
      readonly shiftCtrlAlt?: string;
    }
  | {
      readonly default?: string;
      readonly shift: string;
      readonly ctrl?: string;
      readonly alt?: string;
      readonly shiftCtrl?: string;
      readonly shiftAlt?: string;
      readonly ctrlAlt?: string;
      readonly shiftCtrlAlt?: string;
    }
  | {
      readonly default?: string;
      readonly shift?: string;
      readonly ctrl: string;
      readonly alt?: string;
      readonly shiftCtrl?: string;
      readonly shiftAlt?: string;
      readonly ctrlAlt?: string;
      readonly shiftCtrlAlt?: string;
    }
  | {
      readonly default?: string;
      readonly shift?: string;
      readonly ctrl?: string;
      readonly alt: string;
      readonly shiftCtrl?: string;
      readonly shiftAlt?: string;
      readonly ctrlAlt?: string;
      readonly shiftCtrlAlt?: string;
    }
  | {
      readonly default?: string;
      readonly shift?: string;
      readonly ctrl?: string;
      readonly alt?: string;
      readonly shiftCtrl: string;
      readonly shiftAlt?: string;
      readonly ctrlAlt?: string;
      readonly shiftCtrlAlt?: string;
    }
  | {
      readonly default?: string;
      readonly shift?: string;
      readonly ctrl?: string;
      readonly alt?: string;
      readonly shiftCtrl?: string;
      readonly shiftAlt: string;
      readonly ctrlAlt?: string;
      readonly shiftCtrlAlt?: string;
    }
  | {
      readonly default?: string;
      readonly shift?: string;
      readonly ctrl?: string;
      readonly alt?: string;
      readonly shiftCtrl?: string;
      readonly shiftAlt?: string;
      readonly ctrlAlt: string;
      readonly shiftCtrlAlt?: string;
    }
  | {
      readonly default?: string;
      readonly shift?: string;
      readonly ctrl?: string;
      readonly alt?: string;
      readonly shiftCtrl?: string;
      readonly shiftAlt?: string;
      readonly ctrlAlt?: string;
      readonly shiftCtrlAlt: string;
    };

export type MouseHandler = string | MouseModifierHandler;

export interface EventHandlers {
  readonly onClickCapture?: MouseHandler;
  readonly onClick?: MouseHandler;
  readonly onRightClickCapture?: MouseHandler;
  readonly onRightClick?: MouseHandler;
  readonly onMouseEnter?: string;
  readonly onMouseLeave?: string;
  readonly onMouseDownCapture?: MouseHandler;
  readonly onMouseDown?: MouseHandler;
  readonly onMouseUpCapture?: MouseHandler;
  readonly onMouseUp?: MouseHandler;
  readonly onMouseMoveCapture?: MouseHandler;
  readonly onMouseMove?: MouseHandler;
  readonly onScrollCapture?: MouseHandler;
  readonly onScroll?: MouseHandler;
}

/**
 * Standard semantic intents for interactive regions.
 *
 * When a `region(...)` declares an `intent`, host applications (such as the
 * Celestial workshop) can apply default semantics — e.g. record a click on
 * an `intent: 'close'` button without needing the component to write its own
 * handler. This is what enables passive observers / dev-tools to identify
 * primitives across an unfamiliar component without bespoke wiring.
 *
 * The list is open: applications may use custom intents (string), but the
 * standard values listed here have well-known meaning across the ecosystem.
 */
export type RegionIntent =
  | 'close'
  | 'submit'
  | 'cancel'
  | 'confirm'
  | 'dismiss'
  | 'navigate'
  | 'select'
  | 'toggle'
  | 'edit'
  | 'scroll'
  | 'drag'
  | 'open'
  | 'menu'
  | 'help'
  | (string & {});

/**
 * Optional metadata attached to a hit region. Surfaced through
 * `collectHitRegions` so applications can render inspection overlays,
 * help text, and tooltips driven by the same layout pass that produced
 * the visual — eliminating drift between declared and painted geometry.
 */
export interface RegionMetadata {
  readonly label?: string;
  readonly summary?: string;
  readonly detail?: string;
  readonly keyboardHint?: string;
  readonly affordances?: ReadonlyArray<'hover' | 'click' | 'drag' | 'resize' | 'edit' | 'observe' | 'scroll'>;
  readonly cursor?: PointerCursor;
  readonly scope?: string;
  readonly presentation?: 'inline' | 'outline' | 'spatial';
  /**
   * How the region exposes pointer hover feedback.
   *
   * `subtle` is supplied by Nebula as a calm text/glyph-only fallback for an
   * otherwise click-only control. `managed` means the component owns a richer
   * state face and exposes paired enter/leave handlers.
   */
  readonly hoverFeedback?: 'subtle' | 'managed';
  readonly handlerRegionId?: string;
  /**
   * Standard semantic intent of this region (e.g. 'close', 'submit', 'scroll').
   * Hosts can use this to apply default behavior without per-component wiring.
   */
  readonly intent?: RegionIntent;
  readonly extra?: Readonly<Record<string, unknown>>;
}

export interface EventNode {
  readonly kind: 'event';
  readonly child: VNode;
  readonly id: string;
  readonly handlers: EventHandlers;
  /** Optional metadata for inspectors / tooltips / help overlays. */
  readonly metadata?: RegionMetadata;
  readonly layoutId?: string;
  readonly layoutDirty?: boolean;
}

export interface HoverNode {
  readonly kind: 'hover';
  readonly child: VNode;
  readonly id: string;
  readonly hovered: boolean;
  /** Optional metadata for inspectors / tooltips / help overlays. */
  readonly metadata?: RegionMetadata;
  readonly layoutId?: string;
  readonly layoutDirty?: boolean;
}

export interface ImageNode {
  readonly kind: 'image';
  /** Pre-rendered image string (output of renderBlockImage, etc.) */
  readonly content: string;
  /** Width in terminal cells */
  readonly width: number;
  /** Height in terminal cells (number of lines) */
  readonly height: number;
  readonly layoutId?: string;
  /** If true, content is a verbatim escape sequence (Kitty/iTerm2/Sixel) */
  readonly raw?: boolean;
  readonly layoutDirty?: boolean;
}

export interface OverlayNode {
  readonly kind: 'overlay';
  readonly child: VNode;
  /** Absolute x position in terminal cells (0-based) */
  readonly x: number;
  /** Absolute y position in terminal cells (0-based) */
  readonly y: number;
  /** Optional explicit width constraint; defaults to child's measured width */
  readonly width?: Responsive<number>;
  /** Optional explicit height constraint; defaults to child's measured height */
  readonly height?: Responsive<number>;
  /** Z-index for stacking order. Higher values render on top. Default: 0 */
  readonly zIndex?: number;
  /** If true, empty cells (char=' ', no bg) show through to content below */
  readonly transparent?: boolean;
  readonly layoutId?: string;
  readonly layoutDirty?: boolean;
}

export interface FlexNode {
  readonly kind: 'flex';
  readonly child: VNode;
  /** Flex weight for proportional sizing (default: 1) */
  readonly flex?: number;
  readonly minWidth?: number;
  readonly minHeight?: number;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly layoutId?: string;
  readonly layoutDirty?: boolean;
}

export interface MemoNode {
  readonly kind: 'memo';
  readonly render: () => VNode;
  readonly deps: readonly unknown[];
  readonly layoutId?: string;
  readonly layoutDirty?: boolean;
}

export interface SuspenseNode {
  readonly kind: 'suspense';
  readonly child: VNode;
  readonly fallback: VNode;
  readonly resolved: boolean;
  readonly layoutId?: string;
  readonly layoutDirty?: boolean;
}

export interface PortalNode {
  readonly kind: 'portal';
  readonly child: VNode;
  readonly target: string;
  /** When true, unpainted cells preserve the target content beneath them. */
  readonly transparent?: boolean;
  readonly layoutId?: string;
  readonly layoutDirty?: boolean;
}

export interface LocalStateNode<S = unknown, A = unknown> {
  readonly kind: 'localState';
  readonly key: string;
  readonly init: () => S;
  readonly reducer: (state: S, action: A) => S;
  readonly view: (state: S, dispatch: (action: A) => void) => VNode;
  readonly layoutId?: string;
  readonly layoutDirty?: boolean;
}

export interface LazyNode {
  readonly kind: 'lazy';
  readonly loader: () => Promise<() => VNode>;
  readonly placeholder: VNode;
  readonly key: string;
  readonly layoutId?: string;
  readonly layoutDirty?: boolean;
}

export interface TabGroupNode {
  readonly kind: 'tabGroup';
  readonly children: VNode[];
  readonly id: string;
  readonly orientation: 'horizontal' | 'vertical';
  readonly activeIndex: number;
  readonly wrap?: boolean;
  readonly layoutId?: string;
  readonly layoutDirty?: boolean;
}

export type VNode =
  | TextNode
  | BoxNode
  | RowNode
  | ColumnNode
  | ScrollNode
  | FocusNode
  | EmptyNode
  | ComponentNode
  | EventNode
  | HoverNode
  | ImageNode
  | OverlayNode
  | FlexNode
  | MemoNode
  | SuspenseNode
  | PortalNode
  | LocalStateNode
  | LazyNode
  | TabGroupNode;
