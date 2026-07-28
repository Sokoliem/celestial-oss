/**
 * Nebula View Elements
 *
 * Convenience functions for building virtual terminal trees.
 */

import {
  type Border,
  type BreakpointName,
  type Color,
  type Gradient,
  type Responsive,
  type Style,
  type StyleEffects,
  truncate,
  visualWidth,
} from '@celestial/corona';
import { extractNodeText, getVNodeMeta, setVNodeMeta } from './automation.js';
import type {
  BoxNode,
  ColumnNode,
  ComponentNode,
  ComponentRenderContext,
  EmptyNode,
  EventHandlers,
  EventNode,
  FlexNode,
  FocusNode,
  HoverNode,
  ImageNode,
  LazyNode,
  LocalStateNode,
  MemoNode,
  OverlayNode,
  PortalNode,
  RegionMetadata,
  ResolvedStyleEffects,
  RowNode,
  ScrollNode,
  StyleAttrs,
  SuspenseNode,
  TabGroupNode,
  TextNode,
  VNode,
} from './vdom.js';

let stackedLayerId = 0;

type RegionAffordance = NonNullable<RegionMetadata['affordances']>[number];

function inferRegionMetadata(handlers: EventHandlers, metadata?: RegionMetadata): RegionMetadata | undefined {
  const hasMouseEnter = handlers.onMouseEnter !== undefined;
  const hasMouseLeave = handlers.onMouseLeave !== undefined;
  const hasHover = hasMouseEnter || hasMouseLeave;
  const hasClick =
    handlers.onClick !== undefined ||
    handlers.onClickCapture !== undefined ||
    handlers.onRightClick !== undefined ||
    handlers.onRightClickCapture !== undefined;
  const hasPointerDown = handlers.onMouseDown !== undefined || handlers.onMouseDownCapture !== undefined;
  const hasPointerMove = handlers.onMouseMove !== undefined || handlers.onMouseMoveCapture !== undefined;
  const hasDrag = hasPointerDown && hasPointerMove;
  const hasScroll = handlers.onScroll !== undefined || handlers.onScrollCapture !== undefined;
  const actionable = hasHover || hasClick || hasPointerDown || hasPointerMove;
  const hoverFeedback =
    metadata?.hoverFeedback ??
    (metadata?.presentation === 'spatial'
      ? undefined
      : hasMouseEnter && hasMouseLeave
        ? 'managed'
        : actionable
          ? 'subtle'
          : undefined);

  const inferredAffordances: RegionAffordance[] = [];
  if (hasHover || hoverFeedback !== undefined) inferredAffordances.push('hover');
  if (hasClick) inferredAffordances.push('click');
  if (hasDrag) inferredAffordances.push('drag');
  if (hasScroll) inferredAffordances.push('scroll');

  const inferredCursor = hasDrag ? 'grab' : hasClick ? 'pointer' : undefined;
  const affordances =
    inferredAffordances.length > 0
      ? Object.freeze([...new Set([...(metadata?.affordances ?? []), ...inferredAffordances])])
      : metadata?.affordances;
  if (metadata === undefined && inferredAffordances.length === 0 && inferredCursor === undefined && hoverFeedback === undefined) return undefined;

  return {
    ...metadata,
    ...(affordances !== undefined ? { affordances } : {}),
    ...(metadata?.cursor === undefined && inferredCursor !== undefined ? { cursor: inferredCursor } : {}),
    ...(metadata?.hoverFeedback === undefined && hoverFeedback !== undefined ? { hoverFeedback } : {}),
  };
}

function mapResponsiveColor(val: Responsive<Color> | undefined, type: 'fg' | 'bg'): Responsive<string> | undefined {
  if (!val) return undefined;
  if (typeof val === 'object' && val !== null && 'fg' in val) {
    return type === 'fg' ? (val as Color).fg() : (val as Color).bg();
  }
  const result: Partial<Record<BreakpointName, string>> = {};
  for (const [k, v] of Object.entries(val as object)) {
    if (v) result[k as BreakpointName] = type === 'fg' ? (v as Color).fg() : (v as Color).bg();
  }
  return result;
}

/** Extract the RGB tuple from a Color for use by screenshot/PNG renderers. */
function mapResponsiveRgb(val: Responsive<Color> | undefined): Responsive<[number, number, number] | null> | undefined {
  if (!val) return undefined;
  if (typeof val === 'object' && val !== null && 'rgb' in val) {
    return (val as Color).rgb;
  }
  const result: Partial<Record<BreakpointName, [number, number, number] | null>> = {};
  for (const [k, v] of Object.entries(val as object)) {
    if (v) result[k as BreakpointName] = (v as Color).rgb;
  }
  return result;
}

function mapResponsiveEffects(val: Responsive<StyleEffects> | undefined): Responsive<ResolvedStyleEffects> | undefined {
  if (!val) return undefined;
  if (typeof val === 'object' && val !== null && !('xs' in val || 'sm' in val || 'md' in val || 'lg' in val || 'xl' in val)) {
    // Single effect object
    const single = val as StyleEffects;
    return {
      ...single,
      tint: single.tint?.bg(),
    };
  }
  // Responsive effect object
  const result: Partial<Record<BreakpointName, ResolvedStyleEffects>> = {};
  for (const [k, v] of Object.entries(val as object)) {
    if (v) {
      const eff = v as StyleEffects;
      result[k as BreakpointName] = {
        ...eff,
        tint: eff.tint?.bg(),
      };
    }
  }
  return result;
}

/** Convert a Corona Style to internal StyleAttrs */
function toStyleAttrs(s?: Style): StyleAttrs | undefined {
  if (!s) return undefined;
  const props = s.props;
  const attrs: StyleAttrs = {};

  if (props.color) {
    attrs.fg = mapResponsiveColor(props.color, 'fg');
    attrs.fgRgb = mapResponsiveRgb(props.color);
  }
  if (props.background) {
    attrs.bg = mapResponsiveColor(props.background, 'bg');
    attrs.bgRgb = mapResponsiveRgb(props.background);
  }
  if (props.borderColor) {
    attrs.borderFg = mapResponsiveColor(props.borderColor, 'fg');
    attrs.borderFgRgb = mapResponsiveRgb(props.borderColor);
  }
  if (props.bold) attrs.bold = props.bold;
  if (props.dim) attrs.dim = props.dim;
  if (props.italic) attrs.italic = props.italic;
  if (props.underline) attrs.underline = props.underline;
  if (props.strikethrough) attrs.strikethrough = props.strikethrough;
  if (props.blink) attrs.blink = props.blink;
  if (props.reverse) attrs.reverse = props.reverse;
  if (props.hidden) attrs.hidden = props.hidden;
  if (props.effects) {
    attrs.effects = mapResponsiveEffects(props.effects);
  }
  if (props.elevation) attrs.elevation = props.elevation;
  if (props.icon) attrs.icon = props.icon;
  if (props.padding) attrs.padding = props.padding;

  return attrs;
}

/** Create a text node */
export function text(content: string | (() => string), s?: Style, opts?: { wrap?: boolean; href?: string }): TextNode {
  const resolved = typeof content === 'function' ? content() : content;
  return { kind: 'text', content: resolved, style: toStyleAttrs(s), wrap: opts?.wrap, href: opts?.href };
}

/** Create a hyperlinked text node using OSC 8 terminal hyperlinks */
export function link(url: string, label: string, s?: StyleAttrs | Style): TextNode {
  // Accept either raw StyleAttrs or a Corona Style object
  const style = s && 'render' in s ? toStyleAttrs(s as Style) : (s as StyleAttrs | undefined);
  return { kind: 'text', content: label, style, href: url };
}

/** Create a horizontal row layout */
export function row(...children: VNode[]): RowNode {
  return { kind: 'row', children };
}

/** Create a vertical column layout */
export function column(...children: VNode[]): ColumnNode {
  return { kind: 'column', children };
}

/** Create a box container (optionally bordered) */
export function box(
  child: VNode,
  s?: Style,
  options?: {
    overflow?: 'visible' | 'hidden' | 'scroll';
    width?: Responsive<number>;
    height?: Responsive<number>;
    /** Use measured content size instead of filling unconstrained axes. */
    fit?: 'fill' | 'content';
    scrollOffset?: number;
  },
): BoxNode {
  const props = s?.props;
  const rawBorder = props?.border;
  const border = rawBorder && typeof rawBorder === 'object' && 'chars' in rawBorder ? (rawBorder as Border).chars : undefined;
  return {
    kind: 'box',
    children: [child],
    style: toStyleAttrs(s),
    border,
    width: options?.width ?? props?.width,
    height: options?.height,
    fit: options?.fit,
    overflow: options?.overflow,
    scrollOffset: options?.scrollOffset,
  };
}

/** Create a scrollable viewport */
export function scroll(child: VNode, options: { height: number; offset?: number }): ScrollNode {
  return { kind: 'scroll', child, height: options.height, offset: options.offset ?? 0 };
}

/** Create a focusable node */
export interface FocusOptions {
  focused?: boolean;
  tabIndex?: number;
  group?: string;
  echoHint?: FocusNode['echoHint'];
}

export function focus(id: string, child: VNode, options?: boolean | FocusOptions): FocusNode {
  let node: FocusNode;
  if (typeof options === 'boolean') {
    // Backward-compatible: focus(id, child, focused)
    node = { kind: 'focus', child, id, focused: options };
  } else {
    node = {
      kind: 'focus',
      child,
      id,
      focused: options?.focused ?? false,
      tabIndex: options?.tabIndex,
      group: options?.group,
      echoHint: options?.echoHint,
    };
  }

  // Auto-annotate if no metadata already set (preserves explicit annotations)
  if (!getVNodeMeta(node)) {
    const label = extractNodeText(child).replace(/\s+/g, ' ').trim().slice(0, 80);
    if (label) {
      setVNodeMeta(node, { a11y: { label } });
    }
  }

  return node;
}

/** Create an empty spacer */
export function empty(width?: number, height?: number): EmptyNode {
  return { kind: 'empty', width, height };
}

/** Create a component node (lazy rendering with signal scope) */
export function component(render: (context?: ComponentRenderContext) => VNode, key?: string): ComponentNode {
  return { kind: 'component', render, key };
}

/** Wrap a VNode with a layoutId for compositor-driven layout animations */
export function animated(id: string, child: VNode): VNode {
  const result = { ...child, layoutId: id };
  // Preserve the key property from ComponentNode (spread loses prototype-chain props)
  if ('key' in child && (child as ComponentNode).key !== undefined) {
    (result as { key?: string }).key = (child as ComponentNode).key;
  }
  return result as VNode;
}

/** Create an event-handling wrapper node */
export function event(id: string, child: VNode, handlers: EventHandlers, metadata?: RegionMetadata): EventNode {
  return { kind: 'event', id, child, handlers, metadata: inferRegionMetadata(handlers, metadata) };
}

/** Create a hover-aware wrapper node */
export function hover(id: string, child: VNode | ((hovered: boolean) => VNode), hovered?: boolean, metadata?: RegionMetadata): HoverNode {
  const isHovered = hovered ?? false;
  const resolvedChild = typeof child === 'function' ? child(isHovered) : child;
  return { kind: 'hover', id, child: resolvedChild, hovered: isHovered, metadata };
}

/**
 * Create a layout-derived hit region. Bounds are taken from the wrapped
 * child after layout, so visual geometry and hit geometry are guaranteed
 * to agree. Metadata (label, summary, affordances, etc.) flows through
 * `collectHitRegions` for inspection UIs.
 *
 * Use this when you want a region with no event handlers attached — the
 * region exists purely for hit-testing and inspector reflection. Passing
 * handlers is also fine; this is a convenience over `event(...)`.
 */
export function region(id: string, metadata: RegionMetadata, child: VNode, handlers: EventHandlers = {}): EventNode {
  return { kind: 'event', id, child, handlers, metadata: inferRegionMetadata(handlers, metadata) };
}

/**
 * Create an image element from pre-rendered image content.
 *
 * @param content - Pre-rendered image string (from prism's renderBlockImage, etc.)
 * @param width - Width in terminal cells
 * @param height - Height in terminal cells (number of lines)
 * @param opts - Options. Set raw:true for verbatim escape sequences (Kitty/iTerm2/Sixel).
 */
export function imageEl(content: string, width: number, height: number, opts?: { raw?: boolean }): ImageNode {
  return { kind: 'image', content, width, height, raw: opts?.raw };
}

/** Create an overlay node — renders at absolute (x,y) on top of base content */
export function overlay(
  child: VNode,
  options: {
    x: number;
    y: number;
    width?: number;
    height?: number;
    zIndex?: number;
    transparent?: boolean;
    focusMode?: OverlayNode['focusMode'];
    layoutId?: string;
  },
): OverlayNode {
  return {
    kind: 'overlay',
    child,
    x: options.x,
    y: options.y,
    width: options.width,
    height: options.height,
    zIndex: options.zIndex,
    transparent: options.transparent,
    focusMode: options.focusMode,
    layoutId: options.layoutId,
  };
}

/** Create a flex layout node — proportional sizing inside row/column */
export function flex(child: VNode, opts?: { flex?: number; minWidth?: number; maxWidth?: number; minHeight?: number; maxHeight?: number }): FlexNode {
  return {
    kind: 'flex',
    child,
    flex: opts?.flex,
    minWidth: opts?.minWidth,
    maxWidth: opts?.maxWidth,
    minHeight: opts?.minHeight,
    maxHeight: opts?.maxHeight,
  };
}

/** Create a memoized VNode — skips re-rendering when deps are unchanged */
export function memo(render: () => VNode, deps: readonly unknown[]): MemoNode {
  return { kind: 'memo', render, deps };
}

/** Create a suspense boundary — shows fallback until resolved */
export function suspense(child: VNode, fallback: VNode, resolved: boolean): SuspenseNode {
  return { kind: 'suspense', child, fallback, resolved };
}

export interface PortalOptions {
  /** Preserve target cells where the portal child does not explicitly paint. */
  readonly transparent?: boolean;
  /** Explicit keyboard-focus ownership for the portal layer. */
  readonly focusMode?: PortalNode['focusMode'];
}

/** Create a portal — renders child at a named target location. */
export function portal(target: string, child: VNode, options: PortalOptions = {}): PortalNode {
  return { kind: 'portal', child, target, transparent: options.transparent, focusMode: options.focusMode };
}

/**
 * Compose a base node with layout-neutral overlay/portal declarations.
 *
 * The horizontal flex container is intentional: it gives the base the same
 * width and height constraints it would receive without the layer wrapper,
 * while overlay and portal nodes continue to measure as 0x0. A vertical
 * column would first measure the base's intrinsic height and can therefore
 * collapse fill-height application shells as soon as a layer is opened.
 */
export function layerStack(base: VNode, ...layers: Array<OverlayNode | PortalNode>): VNode {
  if (layers.length === 0) return base;
  return row(flex(base), ...layers);
}

/** Create a local state node — encapsulated state with reducer */
export function localState<S, A>(
  key: string,
  init: () => S,
  reducer: (state: S, action: A) => S,
  view: (state: S, dispatch: (action: A) => void) => VNode,
): LocalStateNode<S, A> {
  return { kind: 'localState', key, init, reducer, view };
}

/** Create a lazy-loaded VNode — shows placeholder until the loader resolves */
export function lazy(key: string, loader: () => Promise<() => VNode>, placeholder: VNode): LazyNode {
  return { kind: 'lazy', loader, placeholder, key };
}

/** Create a tab group — lays out children in a horizontal or vertical strip */
export function tabGroup(
  id: string,
  children: VNode[],
  opts?: { orientation?: 'horizontal' | 'vertical'; activeIndex?: number; wrap?: boolean },
): TabGroupNode {
  return {
    kind: 'tabGroup',
    children,
    id,
    orientation: opts?.orientation ?? 'horizontal',
    activeIndex: opts?.activeIndex ?? 0,
    wrap: opts?.wrap,
  };
}

/** Create a text node with gradient-colored foreground using Corona's OKLAB gradient system */
export function gradientText(content: string, grad: Gradient, s?: Style): TextNode {
  const resolved = content;
  const chars = [...resolved]; // handle multi-byte characters
  const gradientFg = chars.map((_, i) => grad.sample(chars.length <= 1 ? 0 : i / (chars.length - 1)).fg());
  const baseStyle = toStyleAttrs(s) ?? {};
  return { kind: 'text', content: resolved, style: { ...baseStyle, gradientFg } };
}

/** Create a horizontal row layout with a gap (in cells) between children */
export function rowWithGap(gap: number, ...children: VNode[]): RowNode {
  return { kind: 'row', children, gap };
}

/** Create a vertical column layout with a gap (in lines) between children */
export function columnWithGap(gap: number, ...children: VNode[]): ColumnNode {
  return { kind: 'column', children, gap };
}

/** Create a text node from a spinner frame. Pair with Corona's spinnerSub for animation. */
export function spinnerEl(frame: { text: string }, s?: Style): TextNode {
  return text(frame.text, s);
}

/** Create a text-based progress bar. Non-finite progress yields a static indeterminate stripe. */
export function progressBar(progress: number, opts?: { width?: number; filled?: string; empty?: string; style?: Style }): TextNode {
  const width = Math.max(1, Math.floor(opts?.width ?? 20));
  const filled = opts?.filled ?? '█';
  const emptyChar = opts?.empty ?? '░';

  if (!Number.isFinite(progress)) {
    const pattern = Array.from({ length: width }, (_, index) => (index % 3 === 1 ? filled : emptyChar)).join('');
    return text(pattern, opts?.style);
  }

  const clamped = Math.max(0, Math.min(1, progress));
  const filledCount = Math.round(clamped * width);
  return text(filled.repeat(filledCount) + emptyChar.repeat(width - filledCount), opts?.style);
}

/** Create a responsive divider that fills the available row width. */
export function divider(opts?: { char?: string; label?: string; style?: Style }): ComponentNode {
  const char = opts?.char ?? '─';
  return component((context) => {
    const width = Math.max(1, context?.container.cols ?? context?.available.cols ?? context?.terminal.cols ?? 1);
    if (!opts?.label) {
      return text(char.repeat(width), opts?.style);
    }

    const labelText = ` ${opts.label} `;
    const labelWidth = visualWidth(labelText);
    if (labelWidth >= width) {
      return truncatedText(opts.label, width, { style: opts?.style });
    }

    const remaining = width - labelWidth;
    const left = Math.floor(remaining / 2);
    const right = remaining - left;
    return text(char.repeat(left) + labelText + char.repeat(right), opts?.style);
  });
}

/** Return one of two branches without embedding ternaries into view trees. */
export function conditional(condition: boolean, ifTrue: VNode, ifFalse?: VNode): VNode {
  return condition ? ifTrue : (ifFalse ?? empty());
}

/** Map items to child nodes and wrap them in a row or column with optional gap. */
export function list<T>(
  items: readonly T[],
  renderItem: (item: T, index: number) => VNode,
  opts?: { direction?: 'row' | 'column'; gap?: number },
): RowNode | ColumnNode {
  const children = items.map((item, index) => renderItem(item, index));
  if (opts?.direction === 'row') {
    return { kind: 'row', children, gap: opts?.gap };
  }
  return { kind: 'column', children, gap: opts?.gap };
}

/** Render a compact inline label with bold emphasis by default. */
export function badge(label: string, s?: Style): TextNode {
  return {
    kind: 'text',
    content: `[${label}]`,
    style: s ? toStyleAttrs(s) : { bold: true },
  };
}

/** Clamp a string to a display width using a configurable ellipsis. */
export function truncatedText(content: string, maxWidth: number, opts?: { ellipsis?: string; style?: Style }): TextNode {
  const width = Math.max(0, Math.floor(maxWidth));
  if (visualWidth(content) <= width) {
    return text(content, opts?.style);
  }

  const ellipsis = opts?.ellipsis ?? '…';
  const ellipsisWidth = visualWidth(ellipsis);
  if (width <= ellipsisWidth) {
    return text(truncate(ellipsis, width), opts?.style);
  }

  const visible = truncate(content, width - ellipsisWidth);
  return text(`${visible}${ellipsis}`, opts?.style);
}

/**
 * Stack layers over a base node using transparent Nebula portals.
 *
 * Unpainted cells in later layers reveal earlier layers. A child can still
 * paint an opaque region by giving that region an explicit background.
 */
export function stackedLayers(...layers: VNode[]): VNode {
  if (layers.length === 0) return empty();
  if (layers.length === 1) return layers[0]!;

  const base = layers[0]!;
  const targetId = 'layoutId' in base && base.layoutId ? base.layoutId : `__stacked_${stackedLayerId++}`;
  const baseLayer = 'layoutId' in base && base.layoutId ? base : animated(targetId, base);
  const overlays = layers.slice(1).map((layer) => portal(targetId, layer, { transparent: true }));
  return layerStack(baseLayer, ...overlays);
}
