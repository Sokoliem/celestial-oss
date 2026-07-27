/**
 * Scrollable Pane
 *
 * A bordered pane with a fixed header, a scrollable body viewport, and an
 * optional pinned footer + scroll-progress indicator. Designed to compose
 * on top of {@link ScrollRegionModel} / {@link scrollRegionUpdate} for the
 * scroll state, and on top of {@link titledPane}'s border/title styling
 * for the chrome.
 *
 * Why this exists. Alt-screen TUIs (`\x1b[?1049h`) lose terminal scrollback
 * by design — long pages silently truncate. Without a composite helper,
 * every consumer rebuilds "header + scroll(body, offset, height) + footer
 * + key bindings" from primitives.
 *
 * @example Basic — driven by a `ScrollRegionModel` in your app model:
 *     scrollablePane({
 *       title: 'Release notes',
 *       body: longDocumentVNode,
 *       scrollY: model.scroll.scrollY,
 *       viewportHeight: model.scroll.viewportHeight,
 *       contentHeight: model.scroll.contentHeight,
 *       footer: text('↑↓ scroll · q quit'),
 *     })
 *
 * @example Wire standard scroll keys in subscriptions:
 *     subscriptions(model) {
 *       return Sub.batch(
 *         scrollPaneSubscriptions((msg) => ({ type: 'scroll', msg })),
 *         Sub.key('q', { type: 'quit' }),
 *       );
 *     }
 */

import {
  type Border,
  type Color,
  color,
  createTheme,
  defaultTheme,
  resolveElevationBorder,
  style,
  type ThemeInput,
} from '@celestial/core/corona';
import { box, column, Sub, scroll, text, type ThemeContext, type VNode } from '@celestial/core/nebula';
import { clampFinite, nonNegativeInteger, positiveInteger } from './internal.js';
import { getScrollProgress, type ScrollRegionModel, type ScrollRegionMsg } from './scroll.js';

/** Inputs to {@link scrollablePane}. */
export interface ScrollablePaneConfig {
  /** Static theme override for this pane. */
  theme?: ThemeInput;
  /** Reactive host theme. Takes precedence over `theme`. */
  themeCtx?: ThemeContext;
  /** The scrollable body content. */
  body: VNode;
  /** Current vertical scroll offset in lines (typically `model.scroll.scrollY`). */
  scrollY: number;
  /**
   * Viewport height in cell rows. The body is clipped to this many rows.
   * Should match `model.scroll.viewportHeight`. Clamped to >= 1.
   */
  viewportHeight: number;
  /**
   * Total content height in lines. Used for the scroll-progress indicator
   * and "line N of T" readout. When omitted, the indicator is hidden.
   */
  contentHeight?: number;
  /**
   * Optional pinned header. Rendered above the scroll viewport, inside the
   * border. Pass a VNode for full control, or a string for a default
   * title-styled line.
   */
  header?: VNode | string;
  /**
   * Optional pinned footer. Rendered below the scroll viewport (and below
   * the indicator, if shown), inside the border.
   */
  footer?: VNode | string;
  /**
   * When true (default when `contentHeight` is provided), shows a single
   * line above the footer: "lines N–M of T  (P%)". Set to `false` to hide.
   */
  showIndicator?: boolean;
  /**
   * Optional title shown when no `header` VNode is supplied. Mirrors the
   * `title` prop on {@link titledPane}.
   */
  title?: string;
  /** Border style (default: the active theme's raised elevation border). */
  borderStyle?: Border;
  /** Border color (default: semantic panel border). */
  borderColor?: Color;
  /** Title color (default: semantic title text). */
  titleColor?: Color;
  /** When true, swap `borderColor` for `focusColor`. */
  focused?: boolean;
  /** Focus highlight color (default: semantic focus border). */
  focusColor?: Color;
  /** Padding inside the border (default: 0). */
  padding?: number | [number, number] | [number, number, number, number];
}

/**
 * Render a bordered pane with a scrollable body viewport, optional pinned
 * header/footer, and a scroll-progress indicator.
 *
 * The pane is a pure VNode — keep the scroll state in your app model
 * (typically a {@link ScrollRegionModel}) and pass `scrollY`,
 * `viewportHeight`, and `contentHeight` from there. Wire the standard
 * scroll keys via {@link scrollPaneSubscriptions} or roll your own.
 */
export function scrollablePane(config: ScrollablePaneConfig): VNode {
  const theme = config.themeCtx?.current() ?? (config.theme ? createTheme(config.theme) : defaultTheme);
  const panelBorderColor = theme.elevation.raised.border ?? theme.colors.border;
  const {
    body,
    scrollY,
    viewportHeight,
    contentHeight,
    header,
    footer,
    showIndicator = contentHeight !== undefined,
    title,
    borderStyle = resolveElevationBorder(theme, 'raised'),
    borderColor = panelBorderColor,
    titleColor = theme.typography.title.color,
    focused = false,
    focusColor = theme.states.focus.border ?? theme.colors.borderActive,
    padding = 0,
  } = config;

  const activeColor = focused ? focusColor : borderColor;
  const R = color.reset.fg();
  const children: VNode[] = [];

  if (typeof header === 'string') {
    children.push(text(`${titleColor.fg()}${header}${R}`));
  } else if (header) {
    children.push(header);
  } else if (title) {
    children.push(text(`${titleColor.fg()}${title}${R}`));
  }

  const safeViewport = positiveInteger(viewportHeight, 1);
  const safeContentHeight = contentHeight === undefined ? undefined : nonNegativeInteger(contentHeight);
  const safeOffset = safeContentHeight === undefined ? nonNegativeInteger(scrollY) : clampFinite(scrollY, 0, Math.max(0, safeContentHeight - safeViewport));
  children.push(scroll(body, { height: safeViewport, offset: safeOffset }));

  if (showIndicator && safeContentHeight !== undefined) {
    const indicatorColor = theme.typography.label?.color ?? panelBorderColor;
    children.push(text(`${indicatorColor.fg()}${formatIndicator(safeOffset, safeViewport, safeContentHeight)}${R}`));
  }

  if (typeof footer === 'string') {
    children.push(text(footer));
  } else if (footer) {
    children.push(footer);
  }

  return box(column(...children), style({ color: activeColor, padding, border: borderStyle }));
}

/**
 * Format the scroll-progress indicator line.
 *
 * Examples:
 *   `lines 1–24 of 24  (100%)` — content fits in viewport
 *   `lines 11–34 of 120  (8%)` — partway through a long doc
 *
 * Exported for testing.
 */
export function formatIndicator(scrollY: number, viewportHeight: number, contentHeight: number): string {
  const content = nonNegativeInteger(contentHeight);
  if (content <= 0) return 'lines 0–0 of 0  (100%)';
  const viewport = positiveInteger(viewportHeight, 1);
  const maxScroll = Math.max(0, content - viewport);
  const offset = clampFinite(scrollY, 0, maxScroll);
  const start = Math.min(content, offset + 1);
  const end = Math.min(content, offset + viewport);
  const pct = maxScroll === 0 ? 100 : Math.round((offset / maxScroll) * 100);
  return `lines ${start}–${end} of ${content}  (${Math.max(0, Math.min(100, pct))}%)`;
}

/**
 * Re-derive the indicator using a {@link ScrollRegionModel}. Equivalent to
 * `formatIndicator(model.scrollY, model.viewportHeight, model.contentHeight)`,
 * but also returns the raw scroll progress (0–1) for callers that want to
 * render their own scrollbar.
 */
export function scrollIndicatorState(model: ScrollRegionModel): {
  text: string;
  progress: number;
} {
  return {
    text: formatIndicator(model.scrollY, model.viewportHeight, model.contentHeight),
    progress: getScrollProgress(model),
  };
}

/**
 * Standard scroll-key bindings recognised by {@link scrollPaneSubscriptions}.
 *
 * - `'default'` — arrows + PgUp/PgDn + Home/End + Ctrl-u/Ctrl-d + j/k
 * - `'vim'` — j/k + Ctrl-u/Ctrl-d + g/G + PgUp/PgDn (no arrows)
 * - `'arrows-only'` — ↑/↓/PgUp/PgDn/Home/End
 * - `'minimal'` — only ↑/↓/PgUp/PgDn
 */
export type ScrollKeyBindings = 'default' | 'vim' | 'arrows-only' | 'minimal';

/**
 * A single resolved scroll-key binding. Includes optional modifier flags so
 * combinations like Ctrl-u and Ctrl-d round-trip correctly through
 * {@link Sub.keyWithModifiers} — plain {@link Sub.key} only matches when no
 * `ctrl`/`alt` modifiers are active, so a binding like `'ctrl+u'` MUST go
 * through `keyWithModifiers` to fire.
 */
export interface ScrollKeyBinding {
  /** Bare key name as nebula reports it (e.g. `'u'`, `'up'`, `'pageup'`, `'G'`). */
  key: string;
  /** When true, the binding requires Ctrl to be held. */
  ctrl?: boolean;
  /** When true, the binding requires Alt to be held. */
  alt?: boolean;
  /** ScrollRegionMsg dispatched when the binding fires. */
  msg: ScrollRegionMsg;
}

interface KeyDef {
  key: string;
  ctrl?: boolean;
}

interface KeyMap {
  up: KeyDef[];
  down: KeyDef[];
  pageUp: KeyDef[];
  pageDown: KeyDef[];
  toTop: KeyDef[];
  toBottom: KeyDef[];
  halfPageUp: KeyDef[];
  halfPageDown: KeyDef[];
}

const KEY_MAPS: Record<ScrollKeyBindings, KeyMap> = {
  default: {
    up: [{ key: 'up' }, { key: 'k' }],
    down: [{ key: 'down' }, { key: 'j' }],
    pageUp: [{ key: 'pageup' }],
    pageDown: [{ key: 'pagedown' }],
    toTop: [{ key: 'home' }],
    toBottom: [{ key: 'end' }],
    halfPageUp: [{ key: 'u', ctrl: true }],
    halfPageDown: [{ key: 'd', ctrl: true }],
  },
  vim: {
    up: [{ key: 'k' }],
    down: [{ key: 'j' }],
    pageUp: [{ key: 'pageup' }],
    pageDown: [{ key: 'pagedown' }],
    toTop: [{ key: 'g' }],
    // 'G' arrives uppercase from nebula's parser when shift is held; the
    // plain Sub.key('G', ...) matcher tolerates the shift modifier so this
    // does not need a `shift: true` flag.
    toBottom: [{ key: 'G' }],
    halfPageUp: [{ key: 'u', ctrl: true }],
    halfPageDown: [{ key: 'd', ctrl: true }],
  },
  'arrows-only': {
    up: [{ key: 'up' }],
    down: [{ key: 'down' }],
    pageUp: [{ key: 'pageup' }],
    pageDown: [{ key: 'pagedown' }],
    toTop: [{ key: 'home' }],
    toBottom: [{ key: 'end' }],
    halfPageUp: [],
    halfPageDown: [],
  },
  minimal: {
    up: [{ key: 'up' }],
    down: [{ key: 'down' }],
    pageUp: [{ key: 'pageup' }],
    pageDown: [{ key: 'pagedown' }],
    toTop: [],
    toBottom: [],
    halfPageUp: [],
    halfPageDown: [],
  },
};

/**
 * Resolve a {@link ScrollKeyBindings} preset into the underlying
 * {@link ScrollKeyBinding} list. Useful for callers that want to render a
 * help overlay or merge the bindings with their own.
 */
export function resolveScrollKeyBindings(bindings: ScrollKeyBindings = 'default'): ScrollKeyBinding[] {
  const map = KEY_MAPS[bindings] ?? KEY_MAPS.default;

  // Half-page bindings use a fixed amount of 12 lines as a sensible default
  // when the live viewport isn't known. Apps that want exact half-page
  // semantics should subscribe to layout themselves and dispatch
  // 'scroll-up'/'scroll-down' with viewportHeight/2.
  const HALF_PAGE = 12;

  const out: ScrollKeyBinding[] = [];
  const push = (defs: KeyDef[], msg: ScrollRegionMsg): void => {
    for (const d of defs) out.push({ key: d.key, ctrl: d.ctrl, msg });
  };
  push(map.up, { type: 'scroll-up' });
  push(map.down, { type: 'scroll-down' });
  push(map.pageUp, { type: 'scroll-page-up' });
  push(map.pageDown, { type: 'scroll-page-down' });
  push(map.toTop, { type: 'scroll-to-top' });
  push(map.toBottom, { type: 'scroll-to-bottom' });
  push(map.halfPageUp, { type: 'scroll-up', amount: HALF_PAGE });
  push(map.halfPageDown, { type: 'scroll-down', amount: HALF_PAGE });
  return out;
}

/**
 * Format a {@link ScrollKeyBinding} as a human-readable string for help
 * overlays — e.g. `ctrl+u`, `pageup`, `G`.
 */
export function formatScrollKey(binding: ScrollKeyBinding): string {
  const parts: string[] = [];
  if (binding.ctrl) parts.push('ctrl');
  if (binding.alt) parts.push('alt');
  parts.push(binding.key);
  return parts.join('+');
}

/**
 * Standard scroll-key subscriptions for a {@link scrollablePane}. Returns
 * `Sub.batch(...)` of one entry per resolved {@link ScrollKeyBinding}.
 * Bindings with modifier flags use {@link Sub.keyWithModifiers} so they
 * actually fire (plain {@link Sub.key} ignores key events when ctrl/alt are
 * held).
 *
 * @example
 *   subscriptions(model) {
 *     return Sub.batch(
 *       scrollPaneSubscriptions((msg) => ({ type: 'scroll' as const, msg })),
 *       Sub.key('q', { type: 'quit' as const }),
 *     );
 *   }
 */
export function scrollPaneSubscriptions<M>(toMsg: (msg: ScrollRegionMsg) => M, bindings: ScrollKeyBindings = 'default'): Sub<M> {
  const pairs = resolveScrollKeyBindings(bindings);
  return Sub.batch(
    ...pairs.map((p) => {
      if (p.ctrl || p.alt) {
        return Sub.keyWithModifiers(p.key, { ctrl: p.ctrl ?? false, alt: p.alt ?? false }, toMsg(p.msg));
      }
      return Sub.key(p.key, toMsg(p.msg));
    }),
  );
}
