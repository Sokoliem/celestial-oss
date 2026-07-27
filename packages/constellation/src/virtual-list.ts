import { type Color, type SemanticTheme, style, type ThemeInput, type TokenContract } from '@celestial/core/corona';
import {
  box,
  Cmd,
  column,
  event,
  type Msg,
  row,
  setVNodeMeta,
  Sub,
  type ThemeContext,
  text,
  type VNode,
} from '@celestial/core/nebula';
import { MAX_RENDER_CELLS, nonNegativeInteger, positiveInteger, wheelDirection } from './internal.js';
import { getScrollbarMetrics, type ScrollbarModel, type ScrollbarMsg, scrollbar } from './scrollbar.js';
import { useTokens } from './theme.js';
import type { ComponentDescriptor } from './types.js';
import { getVisibleRange, scrollToIndex, virtualScrollUpdate } from './virtual-scroll.js';

export interface VirtualListTokens {
  text: Color;
  muted: Color;
  disabled: Color;
  hoverBg: Color;
  focusBg: Color;
  selectedBg: Color;
  focusRail: Color;
  error: Color;
  pipBg: Color;
  pipText: Color;
}

export const virtualListContract: TokenContract<VirtualListTokens> = {
  text: (theme: SemanticTheme) => theme.colors.text,
  muted: (theme: SemanticTheme) => theme.colors.textSoft,
  disabled: (theme: SemanticTheme) => theme.colors.muted,
  hoverBg: (theme: SemanticTheme) => theme.colors.surfaceRaised,
  focusBg: (theme: SemanticTheme) => theme.colors.surfaceAlt,
  selectedBg: (theme: SemanticTheme) => theme.colors.highlight,
  focusRail: (theme: SemanticTheme) => theme.colors.tones.accent,
  error: (theme: SemanticTheme) => theme.colors.tones.danger,
  pipBg: (theme: SemanticTheme) => theme.colors.surfaceRaised,
  pipText: (theme: SemanticTheme) => theme.colors.tones.accent,
};

export type VirtualListSelection = 'none' | 'single';
export type VirtualListScrollAnchor = 'top' | 'bottom-sticky';

export interface VirtualListItemState {
  focused: boolean;
  hovered: boolean;
  selected: boolean;
  disabled: boolean;
}

export interface VirtualListConfig<T> {
  id?: string;
  label?: string;
  items: readonly T[];
  getKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number, state: VirtualListItemState) => VNode;
  viewportRows: number;
  width?: number;
  selection?: VirtualListSelection;
  scrollAnchor?: VirtualListScrollAnchor;
  focused?: boolean;
  emptyLabel?: string;
  isDisabled?: (item: T, index: number) => boolean;
  activateOnClick?: boolean;
  onSelect?: (item: T, index: number) => void;
  onActivate?: (item: T, index: number) => void;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}

export interface VirtualListModel<T> {
  items: readonly T[];
  keys: readonly string[];
  keyIndex: ReadonlyMap<string, number>;
  disabledKeys: ReadonlySet<string>;
  viewportRows: number;
  scrollOffset: number;
  focused: boolean;
  focusedKey: string | null;
  selectedKey: string | null;
  hoveredKey: string | null;
  pipHovered: boolean;
  stickyToBottom: boolean;
  unseenCount: number;
  scrollbar: ScrollbarModel;
}

export type VirtualListMsg<T> =
  | Msg<'vl-focus'>
  | Msg<'vl-blur'>
  | Msg<'vl-hover', { key: string }>
  | Msg<'vl-leave', { key: string }>
  | Msg<'vl-click', { key: string }>
  | Msg<'vl-arrow', { direction: -1 | 1 }>
  | Msg<'vl-page', { direction: -1 | 1 }>
  | Msg<'vl-home'>
  | Msg<'vl-end'>
  | Msg<'vl-select'>
  | Msg<'vl-activate'>
  | Msg<'vl-wheel', { direction: -1 | 0 | 1 }>
  | Msg<'vl-jump-bottom'>
  | Msg<'vl-hover-pip'>
  | Msg<'vl-leave-pip'>
  | Msg<'vl-replace-items', { items: readonly T[] }>
  | Msg<'vl-sync-viewport', { viewportRows: number }>
  | Msg<'vl-scrollbar', { msg: ScrollbarMsg }>
  | Msg<'noop'>;

interface IndexedItem<T> {
  item: T;
  index: number;
  key: string;
  disabled: boolean;
}

interface ItemSnapshot<T> {
  items: readonly T[];
  keys: readonly string[];
  keyIndex: ReadonlyMap<string, number>;
  disabledKeys: ReadonlySet<string>;
}

const UNSAFE_KEY = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069\uD800-\uDFFF]/u;
const MAX_KEY_LENGTH = 512;

function safeCallback(callback: (() => void) | undefined): void {
  try {
    callback?.();
  } catch {
    // Host callbacks are observational and cannot corrupt the Elm update loop.
  }
}

function boundedItems<T>(items: readonly T[]): readonly T[] {
  if (items.length > MAX_RENDER_CELLS) {
    throw new Error(`VirtualList supports at most ${MAX_RENDER_CELLS} keyed items.`);
  }
  return Object.freeze(Array.from(items));
}

export function virtualList<T>(config: VirtualListConfig<T>): ComponentDescriptor<VirtualListModel<T>, VirtualListMsg<T>> {
  const interactionId = config.id ?? 'virtual-list';
  const selectionMode = config.selection ?? 'none';
  const scrollAnchor = config.scrollAnchor ?? 'top';
  const activateOnClick = config.activateOnClick ?? true;
  const rowClickTag = `${interactionId}:row-click`;
  const rowHoverTag = `${interactionId}:row-hover`;
  const rowLeaveTag = `${interactionId}:row-leave`;
  const scrollTag = `${interactionId}:scroll`;
  const pipClickTag = `${interactionId}:pip-click`;
  const pipHoverTag = `${interactionId}:pip-hover`;
  const pipLeaveTag = `${interactionId}:pip-leave`;

  function indexItems(items: readonly T[]): IndexedItem<T>[] {
    const seen = new Set<string>();
    return items.map((item, index) => {
      let key: string;
      try {
        key = config.getKey(item, index);
      } catch (error) {
        throw new Error(`VirtualList getKey failed at index ${index}.`, { cause: error });
      }
      if (typeof key !== 'string' || key.length === 0) throw new Error(`VirtualList item at index ${index} must have a non-empty string key.`);
      if (key.length > MAX_KEY_LENGTH || UNSAFE_KEY.test(key)) {
        throw new Error(`VirtualList item key at index ${index} must be safe single-line metadata no longer than ${MAX_KEY_LENGTH} characters.`);
      }
      if (seen.has(key)) throw new Error(`VirtualList item keys must be unique; received duplicate key "${key}".`);
      seen.add(key);
      let disabled = false;
      try {
        disabled = config.isDisabled?.(item, index) ?? false;
      } catch {
        disabled = true;
      }
      return { item, index, key, disabled };
    });
  }

  function snapshotItems(items: readonly T[]): ItemSnapshot<T> {
    const bounded = boundedItems(items);
    const entries = indexItems(bounded);
    return {
      items: bounded,
      keys: Object.freeze(entries.map((entry) => entry.key)),
      keyIndex: new Map(entries.map((entry) => [entry.key, entry.index])),
      disabledKeys: new Set(entries.filter((entry) => entry.disabled).map((entry) => entry.key)),
    };
  }

  function viewportRows(value: number): number {
    return positiveInteger(value, 1);
  }

  function maxOffset(items: readonly T[], rows: number): number {
    return Math.max(0, items.length - rows);
  }

  function withScroll(model: VirtualListModel<T>, scrollOffset: number, preserveDrag = false): VirtualListModel<T> {
    const nextOffset = Math.max(0, Math.min(maxOffset(model.items, model.viewportRows), nonNegativeInteger(scrollOffset, model.scrollOffset)));
    const atBottom = nextOffset >= maxOffset(model.items, model.viewportRows);
    const stickyToBottom = scrollAnchor === 'bottom-sticky' && atBottom;
    const unseenCount = stickyToBottom ? 0 : model.unseenCount;
    const next = { ...model, scrollOffset: nextOffset, stickyToBottom, unseenCount };
    return syncScrollbar(next, preserveDrag);
  }

  function scrollbarDescriptor(model: VirtualListModel<T>) {
    return scrollbar({
      id: `${interactionId}:scrollbar`,
      label: `${config.label ?? 'Virtual list'} scrollbar`,
      total: model.items.length,
      viewport: model.viewportRows,
      trackLength: model.viewportRows,
      scroll: model.scrollOffset,
      theme: config.theme,
      themeCtx: config.themeCtx,
    });
  }

  function syncScrollbar(model: VirtualListModel<T>, preserveDrag = false): VirtualListModel<T> {
    const current = getScrollbarMetrics(model.items.length, model.viewportRows, model.viewportRows, model.scrollOffset);
    return {
      ...model,
      scrollbar: {
        ...model.scrollbar,
        total: current.total,
        viewport: current.viewport,
        trackLength: current.trackLength,
        scroll: current.scroll,
        hoveredCell: model.scrollbar.hoveredCell !== null && model.scrollbar.hoveredCell < current.trackLength ? model.scrollbar.hoveredCell : null,
        drag: preserveDrag ? model.scrollbar.drag : null,
      },
    };
  }

  function entryByKey(model: VirtualListModel<T>, key: string): IndexedItem<T> | undefined {
    const index = model.keyIndex.get(key);
    if (index === undefined || index < 0 || index >= model.items.length) return undefined;
    const item = model.items[index] as T;
    return { item, index, key, disabled: model.disabledKeys.has(key) };
  }

  function firstEnabled(model: Pick<VirtualListModel<T>, 'items' | 'keys' | 'disabledKeys'>, from: number, direction: -1 | 1): IndexedItem<T> | undefined {
    if (model.items.length === 0) return undefined;
    let index = Math.max(0, Math.min(model.items.length - 1, from));
    while (index >= 0 && index < model.items.length) {
      const item = model.items[index] as T;
      const key = model.keys[index];
      if (key !== undefined && !model.disabledKeys.has(key)) return { item, index, key, disabled: false };
      index += direction;
    }
    return undefined;
  }

  function moveFocus(model: VirtualListModel<T>, targetIndex: number, direction: -1 | 1): VirtualListModel<T> {
    const entry = firstEnabled(model, targetIndex, direction) ?? firstEnabled(model, targetIndex, direction === 1 ? -1 : 1);
    if (!entry) return model;
    const scrollState = scrollToIndex(
      { items: model.items, viewportHeight: model.viewportRows, rowHeight: 1, overscan: 0 },
      { scrollOffset: model.scrollOffset, totalHeight: model.items.length },
      entry.index,
    );
    return withScroll(
      { ...model, focused: true, focusedKey: entry.key, scrollbar: { ...model.scrollbar, focused: false } },
      scrollState.scrollOffset,
    );
  }

  function selectFocused(model: VirtualListModel<T>): VirtualListModel<T> {
    if (selectionMode !== 'single' || model.focusedKey === null) return model;
    const entry = entryByKey(model, model.focusedKey);
    if (!entry || entry.disabled) return model;
    if (model.selectedKey !== entry.key) safeCallback(config.onSelect ? () => config.onSelect?.(entry.item, entry.index) : undefined);
    return model.selectedKey === entry.key ? model : { ...model, selectedKey: entry.key };
  }

  function activateFocused(model: VirtualListModel<T>): VirtualListModel<T> {
    if (model.focusedKey === null) return model;
    const entry = entryByKey(model, model.focusedKey);
    if (!entry || entry.disabled) return model;
    safeCallback(config.onActivate ? () => config.onActivate?.(entry.item, entry.index) : undefined);
    return model;
  }

  function keysAreStrictAppend(previous: readonly IndexedItem<T>[], next: readonly IndexedItem<T>[]): boolean {
    if (next.length <= previous.length) return false;
    return previous.every((entry, index) => next[index]?.key === entry.key);
  }

  return {
    init(): [VirtualListModel<T>, Cmd<VirtualListMsg<T>>] {
      const snapshot = snapshotItems(config.items);
      const rows = viewportRows(config.viewportRows);
      const focusedKey = firstEnabled(snapshot, 0, 1)?.key ?? null;
      const initialOffset = scrollAnchor === 'bottom-sticky' ? maxOffset(snapshot.items, rows) : 0;
      const bar = scrollbar({
        id: `${interactionId}:scrollbar`,
        label: `${config.label ?? 'Virtual list'} scrollbar`,
        total: snapshot.items.length,
        viewport: rows,
        trackLength: rows,
        scroll: initialOffset,
        theme: config.theme,
        themeCtx: config.themeCtx,
      }).init()[0];
      return [
        {
          ...snapshot,
          viewportRows: rows,
          scrollOffset: initialOffset,
          focused: config.focused ?? false,
          focusedKey,
          selectedKey: null,
          hoveredKey: null,
          pipHovered: false,
          stickyToBottom: scrollAnchor === 'bottom-sticky',
          unseenCount: 0,
          scrollbar: { ...bar, focused: false },
        },
        Cmd.none(),
      ];
    },

    update(message: VirtualListMsg<T>, model: VirtualListModel<T>): [VirtualListModel<T>, Cmd<VirtualListMsg<T>>] {
      switch (message.type) {
        case 'vl-focus':
          return [
            model.focused && !model.scrollbar.focused && model.scrollbar.drag === null
              ? model
              : { ...model, focused: true, scrollbar: { ...model.scrollbar, focused: false, drag: null } },
            Cmd.none(),
          ];
        case 'vl-blur': {
          const [blurredScrollbar] = scrollbarDescriptor(model).update({ type: 'sb-blur' }, model.scrollbar);
          return [
            withScroll(
              {
                ...model,
                focused: false,
                hoveredKey: null,
                pipHovered: false,
                scrollbar: blurredScrollbar,
              },
              blurredScrollbar.scroll,
            ),
            Cmd.none(),
          ];
        }
        case 'vl-hover': {
          const entry = entryByKey(model, message.key);
          if (!entry || entry.disabled || model.hoveredKey === entry.key) return [model, Cmd.none()];
          return [{ ...model, hoveredKey: entry.key }, Cmd.none()];
        }
        case 'vl-leave':
          return [model.hoveredKey === message.key ? { ...model, hoveredKey: null } : model, Cmd.none()];
        case 'vl-click': {
          const entry = entryByKey(model, message.key);
          if (!entry || entry.disabled) return [model, Cmd.none()];
          let next: VirtualListModel<T> = {
            ...model,
            focused: true,
            focusedKey: entry.key,
            scrollbar: { ...model.scrollbar, focused: false, drag: null },
          };
          next = selectFocused(next);
          if (activateOnClick) next = activateFocused(next);
          return [next, Cmd.none()];
        }
        case 'vl-arrow': {
          const current = model.focusedKey === null ? -1 : (model.keyIndex.get(model.focusedKey) ?? -1);
          const from = current < 0 ? (message.direction === 1 ? 0 : model.items.length - 1) : current + message.direction;
          return [moveFocus(model, from, message.direction), Cmd.none()];
        }
        case 'vl-page': {
          const current = model.focusedKey === null ? -1 : (model.keyIndex.get(model.focusedKey) ?? -1);
          const base = current < 0 ? 0 : current;
          return [moveFocus(model, base + message.direction * Math.max(1, model.viewportRows), message.direction), Cmd.none()];
        }
        case 'vl-home':
          return [moveFocus(model, 0, 1), Cmd.none()];
        case 'vl-end':
          return [moveFocus(model, model.items.length - 1, -1), Cmd.none()];
        case 'vl-select':
          return [selectFocused(model), Cmd.none()];
        case 'vl-activate':
          return [activateFocused(model), Cmd.none()];
        case 'vl-wheel': {
          if (message.direction === 0) return [model, Cmd.none()];
          const next = virtualScrollUpdate(
            { type: message.direction < 0 ? 'vscroll-up' : 'vscroll-down', amount: 3 },
            { scrollOffset: model.scrollOffset, totalHeight: model.items.length },
            { items: model.items, viewportHeight: model.viewportRows, rowHeight: 1, overscan: 0 },
          );
          return [withScroll(model, next.scrollOffset), Cmd.none()];
        }
        case 'vl-jump-bottom':
          return [withScroll({ ...model, unseenCount: 0 }, maxOffset(model.items, model.viewportRows)), Cmd.none()];
        case 'vl-hover-pip':
          return [model.pipHovered ? model : { ...model, pipHovered: true }, Cmd.none()];
        case 'vl-leave-pip':
          return [model.pipHovered ? { ...model, pipHovered: false } : model, Cmd.none()];
        case 'vl-sync-viewport': {
          const rows = viewportRows(message.viewportRows);
          if (rows === model.viewportRows) return [model, Cmd.none()];
          const next = { ...model, viewportRows: rows };
          return [withScroll(next, scrollAnchor === 'bottom-sticky' && model.stickyToBottom ? maxOffset(next.items, rows) : model.scrollOffset), Cmd.none()];
        }
        case 'vl-replace-items': {
          const snapshot = snapshotItems(message.items);
          const previousEntries = model.keys.map((key, index) => ({
            item: model.items[index] as T,
            index,
            key,
            disabled: model.disabledKeys.has(key),
          }));
          const nextEntries = snapshot.keys.map((key, index) => ({
            item: snapshot.items[index] as T,
            index,
            key,
            disabled: snapshot.disabledKeys.has(key),
          }));
          const appended = keysAreStrictAppend(previousEntries, nextEntries);
          const appendedCount = appended ? nextEntries.length - previousEntries.length : 0;
          const enabledKeys = new Set(snapshot.keys.filter((key) => !snapshot.disabledKeys.has(key)));
          const focusedKey = model.focusedKey !== null && enabledKeys.has(model.focusedKey) ? model.focusedKey : (firstEnabled(snapshot, 0, 1)?.key ?? null);
          const selectedKey = model.selectedKey !== null && enabledKeys.has(model.selectedKey) ? model.selectedKey : null;
          const hoveredKey = model.hoveredKey !== null && enabledKeys.has(model.hoveredKey) ? model.hoveredKey : null;
          const stayAtBottom = scrollAnchor === 'bottom-sticky' && model.stickyToBottom && appended;
          const requestedOffset = stayAtBottom ? maxOffset(snapshot.items, model.viewportRows) : model.scrollOffset;
          const unseenCount =
            scrollAnchor === 'bottom-sticky' && appended && !stayAtBottom ? model.unseenCount + appendedCount : 0;
          const clampedOffset = Math.min(requestedOffset, maxOffset(snapshot.items, model.viewportRows));
          const next = {
            ...model,
            ...snapshot,
            focusedKey,
            selectedKey,
            hoveredKey,
            scrollOffset: clampedOffset,
            stickyToBottom: scrollAnchor === 'bottom-sticky' && clampedOffset >= maxOffset(snapshot.items, model.viewportRows),
            unseenCount,
          };
          return [syncScrollbar(next), Cmd.none()];
        }
        case 'vl-scrollbar': {
          const descriptor = scrollbarDescriptor(model);
          const [scrollbarModel, command] = descriptor.update(message.msg, model.scrollbar);
          if (scrollbarModel === model.scrollbar && scrollbarModel.scroll === model.scrollOffset) {
            return [model, Cmd.map(command, (msg) => ({ type: 'vl-scrollbar', msg }))];
          }
          const next = withScroll(
            {
              ...model,
              focused: message.msg.type === 'sb-press' || message.msg.type === 'sb-focus' ? false : model.focused,
              scrollbar: scrollbarModel,
            },
            scrollbarModel.scroll,
            true,
          );
          return [next, Cmd.map(command, (msg) => ({ type: 'vl-scrollbar', msg }))];
        }
        case 'noop':
          return [model, Cmd.none()];
      }
    },

    view(model: VirtualListModel<T>): VNode {
      const tokens = useTokens(virtualListContract, config, 'VirtualList');
      const range = getVisibleRange(
        { scrollOffset: model.scrollOffset, totalHeight: model.items.length },
        { items: model.items, viewportHeight: model.viewportRows, rowHeight: 1, overscan: 0 },
      );
      const rows: VNode[] = [];

      for (let index = range.startIndex; index <= range.endIndex; index++) {
        const item = model.items[index] as T;
        const key = model.keys[index];
        if (key === undefined) continue;
        const entry = { item, index, key, disabled: model.disabledKeys.has(key) };
        const focused = model.focused && model.focusedKey === entry.key;
        const hovered = model.hoveredKey === entry.key;
        const selected = model.selectedKey === entry.key;
        const state: VirtualListItemState = { focused, hovered, selected, disabled: entry.disabled };
        let content: VNode;
        try {
          content = config.renderItem(entry.item, entry.index, state);
        } catch {
          content = text('[row render failed]', style({ color: tokens.error, bold: true }));
        }
        const background = selected ? tokens.selectedBg : hovered ? tokens.hoverBg : focused ? tokens.focusBg : undefined;
        const rail = text(focused ? '▌' : ' ', style({ color: tokens.focusRail, dim: !focused }));
        const body = box(
          row(rail, content),
          background === undefined ? undefined : style({ background }),
          {
            height: 1,
            overflow: 'hidden',
            ...(config.width === undefined ? {} : { width: positiveInteger(config.width, 1) }),
          },
        );
        const handlers = entry.disabled
          ? { onScroll: scrollTag }
          : { onClick: rowClickTag, onMouseEnter: rowHoverTag, onMouseLeave: rowLeaveTag, onScroll: scrollTag };
        const rowNode = event(`${interactionId}:row:${entry.index}`, body, handlers, {
          label: `Virtual list row ${entry.index + 1}`,
          intent: entry.disabled ? 'scroll' : 'select',
          affordances: entry.disabled ? ['scroll'] : ['hover', 'click', 'scroll'],
          cursor: entry.disabled ? 'not-allowed' : 'pointer',
        });
        setVNodeMeta(rowNode, {
          testId: `${interactionId}:row:${entry.key}`,
          a11y: {
            role: 'listitem',
            label: entry.key,
            disabled: entry.disabled,
            selected: selectionMode === 'single' ? selected : undefined,
          },
        });
        rows.push(rowNode);
      }

      if (rows.length === 0) {
        rows.push(box(text(config.emptyLabel ?? 'No items', style({ color: tokens.muted, dim: true })), undefined, { height: 1, overflow: 'hidden' }));
      }
      while (rows.length < model.viewportRows) rows.push(box(text(''), undefined, { height: 1, overflow: 'hidden' }));

      const bar = scrollbarDescriptor(model).view({ ...model.scrollbar, scroll: model.scrollOffset });
      const main = row(column(...rows.slice(0, model.viewportRows)), bar);
      setVNodeMeta(main, {
        testId: interactionId,
        a11y: {
          role: 'listbox',
          label: config.label ?? 'Virtual list',
        },
      });

      if (model.unseenCount <= 0) return main;
      const pipLabel = `▼ ${model.unseenCount} new`;
      const pip = event(
        `${interactionId}:new-items`,
        text(pipLabel, style({ color: tokens.pipText, background: model.pipHovered ? tokens.selectedBg : tokens.pipBg, bold: true })),
        { onClick: pipClickTag, onMouseEnter: pipHoverTag, onMouseLeave: pipLeaveTag },
        { label: pipLabel, intent: 'scroll-to-bottom', affordances: ['hover', 'click'], cursor: 'pointer' },
      );
      setVNodeMeta(pip, { testId: `${interactionId}:new-items`, a11y: { role: 'button', label: pipLabel } });
      return column(main, pip);
    },

    subscriptions(model: VirtualListModel<T>): Sub<VirtualListMsg<T>> {
      const pointer = Sub.elementMouse<VirtualListMsg<T>>((mouseEvent) => {
        if (mouseEvent.handlerTag === pipClickTag) return { type: 'vl-jump-bottom' };
        if (mouseEvent.handlerTag === pipHoverTag) return { type: 'vl-hover-pip' };
        if (mouseEvent.handlerTag === pipLeaveTag) return { type: 'vl-leave-pip' };
        if (mouseEvent.handlerTag === scrollTag) {
          const direction = wheelDirection(mouseEvent.deltaY);
          return direction === 0 ? { type: 'noop' } : { type: 'vl-wheel', direction };
        }
        if (!mouseEvent.elementId.startsWith(`${interactionId}:row:`)) return { type: 'noop' };
        const index = Number(mouseEvent.elementId.slice(`${interactionId}:row:`.length));
        if (!Number.isSafeInteger(index) || index < 0 || index >= model.items.length) return { type: 'noop' };
        const key = model.keys[index];
        if (key === undefined) return { type: 'noop' };
        if (mouseEvent.handlerTag === rowClickTag) return { type: 'vl-click', key };
        if (mouseEvent.handlerTag === rowHoverTag) return { type: 'vl-hover', key };
        if (mouseEvent.handlerTag === rowLeaveTag) return { type: 'vl-leave', key };
        return { type: 'noop' };
      });
      const bar = Sub.map(scrollbarDescriptor(model).subscriptions?.(model.scrollbar) ?? Sub.none<ScrollbarMsg>(), (msg) => ({
        type: 'vl-scrollbar',
        msg,
      }) as VirtualListMsg<T>);
      const subscriptions: Sub<VirtualListMsg<T>>[] = [pointer, bar];

      if (model.focused) {
        subscriptions.push(
          Sub.key('up', { type: 'vl-arrow', direction: -1 }),
          Sub.key('down', { type: 'vl-arrow', direction: 1 }),
          Sub.key('pageup', { type: 'vl-page', direction: -1 }),
          Sub.key('pagedown', { type: 'vl-page', direction: 1 }),
          Sub.key('home', { type: 'vl-home' }),
          Sub.key('end', { type: 'vl-end' }),
          Sub.key('space', { type: 'vl-select' }),
          Sub.key('enter', { type: 'vl-activate' }),
        );
      }

      return Sub.batch(...subscriptions);
    },
  };
}
