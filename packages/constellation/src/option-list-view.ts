/**
 * `optionListView` — filtered selectable list primitive.
 *
 * Replaces the duplicated filtered-list logic in combobox / autocomplete /
 * command-palette / slash-palette / context-menu-view (each previously
 * re-implemented filteredIndices + highlightedIndex + arrow-nav + Enter-
 * select + hover-highlight). Auto-virtualizes via gravity.virtualList past
 * `maxVisible`.
 *
 * The view does NOT own the input field — consumers pass in `query` and
 * dispatch `opt-query` when input changes. This keeps the primitive
 * compatible with both an embedded text input (combobox) and a separate
 * search bar (command palette).
 *
 * Phase 3 of the constellation primitive-hardening PRD (N2).
 */

import type { Color, SemanticTheme, ThemeInput, TokenContract } from '@celestial/corona';
import { style } from '@celestial/corona';
import { Cmd, column, event, type Msg, row, Sub, setVNodeMeta, type ThemeContext, text, type VNode } from '@celestial/nebula';
import { generateFocusGroupId } from './focus-group.js';
import { boundedInteger, MAX_RENDER_CELLS, positiveInteger, wheelDirection } from './internal.js';
import { resolveTheme, useTokens } from './theme.js';
import type { ComponentDescriptor } from './types.js';

// ─── Token contract ─────────────────────────────────────────────────────────

export interface OptionListTokens {
  text: Color;
  textSoft: Color;
  highlight: Color;
  selected: Color;
  muted: Color;
  border: Color;
  bg: Color;
}

export const optionListContract: TokenContract<OptionListTokens> = {
  text: (t: SemanticTheme) => t.colors.text,
  textSoft: (t: SemanticTheme) => t.colors.textSoft,
  highlight: (t: SemanticTheme) => t.colors.highlight,
  selected: (t: SemanticTheme) => t.colors.tones.accent,
  muted: (t: SemanticTheme) => t.colors.muted,
  border: (t: SemanticTheme) => t.colors.border,
  bg: (t: SemanticTheme) => t.colors.surfaceRaised,
};

// ─── Data model ─────────────────────────────────────────────────────────────

export interface OptionListItem<T = unknown> {
  readonly id: string;
  readonly label: string;
  readonly value: T;
  readonly icon?: VNode;
  readonly trailing?: VNode;
  readonly disabled?: boolean;
  readonly group?: string;
}

export type OptionListFilter<T> = (item: OptionListItem<T>, query: string) => boolean;

export interface OptionListConfig<T = unknown> {
  readonly items: readonly OptionListItem<T>[];
  /** Initial query. Consumer drives query updates via opt-query. */
  readonly query?: string;
  /** Filter predicate. Default: case-insensitive label substring match. */
  readonly filter?: OptionListFilter<T>;
  /** Max visible rows. Default 50. */
  readonly maxVisible?: number;
  /** Force virtualization regardless of item count. Default: auto past maxVisible. */
  readonly virtualize?: boolean;
  /** Allow multi-select via opt-toggle. Default false (single-select via opt-select). */
  readonly multiSelect?: boolean;
  readonly onSelect?: (id: string, value: T) => void;
  readonly onHighlight?: (id: string, value: T) => void;
  /** Initial highlighted index in filteredIds. Default 0. */
  readonly initialHighlight?: number;
  /** Empty-state node when filteredIds is empty. */
  readonly emptyState?: VNode;
  readonly themeCtx?: ThemeContext;
  readonly theme?: ThemeInput;
}

export interface OptionListModel<T = unknown> {
  readonly query: string;
  readonly filteredIds: readonly string[];
  readonly highlightedIndex: number;
  readonly selectedIds: ReadonlySet<string>;
  /** Cached for memoization; consumers should not read this directly. */
  readonly _itemsRef?: readonly OptionListItem<T>[];
}

export type OptionListMsg =
  | Msg<'opt-query', { query: string }>
  | Msg<'opt-arrow', { direction: 'up' | 'down' | 'home' | 'end' }>
  | Msg<'opt-hover', { id: string }>
  | Msg<'opt-select'>
  | Msg<'opt-toggle', { id: string }>
  | Msg<'opt-click', { id: string }>
  | Msg<'opt-noop'>;

export type OptionListDirection = 'up' | 'down' | 'home' | 'end';

// ─── Default filter ─────────────────────────────────────────────────────────

export function filterByLabel<T>(item: OptionListItem<T>, query: string): boolean {
  if (query.length === 0) return true;
  return item.label.toLowerCase().includes(query.toLowerCase());
}

/**
 * Lightweight fuzzy filter — every query character must appear in label order.
 * Not a ranking function; ordering preserved from input items.
 */
export function filterByFuzzy<T>(item: OptionListItem<T>, query: string): boolean {
  if (query.length === 0) return true;
  const q = query.toLowerCase();
  const label = item.label.toLowerCase();
  let qi = 0;
  for (const ch of label) {
    if (ch === q[qi]) qi++;
    if (qi === q.length) return true;
  }
  return qi === q.length;
}

// ─── Filter memo ────────────────────────────────────────────────────────────

function computeFilteredIds<T>(items: readonly OptionListItem<T>[], filter: OptionListFilter<T>, query: string): string[] {
  const out: string[] = [];
  for (const it of items) {
    if (filter(it, query)) out.push(it.id);
  }
  return out;
}

export function moveOptionHighlight(current: number, total: number, direction: OptionListDirection): number {
  if (total <= 0) return 0;
  const clamped = Math.max(0, Math.min(current, total - 1));
  switch (direction) {
    case 'up':
      return clamped === 0 ? total - 1 : clamped - 1;
    case 'down':
      return (clamped + 1) % total;
    case 'home':
      return 0;
    case 'end':
      return total - 1;
  }
}

// ─── Factory ────────────────────────────────────────────────────────────────

export function optionListView<T = unknown>(config: OptionListConfig<T>): ComponentDescriptor<OptionListModel<T>, OptionListMsg> {
  const filter: OptionListFilter<T> = config.filter ?? filterByLabel;
  const maxVisible = positiveInteger(config.maxVisible, 50);
  const initialQuery = String(config.query ?? '').slice(0, MAX_RENDER_CELLS);
  const initialHighlight = boundedInteger(config.initialHighlight, 0, 0);
  const interactionId = generateFocusGroupId('option-list');
  const clickTag = `${interactionId}:click`;
  const hoverTag = `${interactionId}:hover`;
  const scrollTag = `${interactionId}:scroll`;
  const items = config.items.slice(0, MAX_RENDER_CELLS).map((item) => ({ ...item, id: String(item.id), label: String(item.label) }));
  const itemsById = new Map<string, OptionListItem<T>>();
  for (const item of items) {
    if (itemsById.has(item.id)) throw new Error(`OptionList item ids must be unique; received duplicate id "${item.id}"`);
    itemsById.set(item.id, item);
  }

  function itemForId(id: string | undefined): OptionListItem<T> | undefined {
    return id === undefined ? undefined : itemsById.get(id);
  }

  function notifyHighlight(id: string): void {
    const item = itemForId(id);
    if (!item || item.disabled) return;
    try {
      config.onHighlight?.(id, item.value);
    } catch {
      // Host callbacks cannot corrupt the component's Elm update.
    }
  }

  function notifySelect(id: string): void {
    const item = itemForId(id);
    if (!item || item.disabled) return;
    try {
      config.onSelect?.(id, item.value);
    } catch {
      // Host callbacks cannot corrupt the component's Elm update.
    }
  }

  function enabledHighlight(filteredIds: readonly string[], current: number, direction: OptionListDirection): number {
    if (filteredIds.length === 0) return 0;
    const enabled = filteredIds
      .map((id, index) => ({ index, item: itemForId(id) }))
      .filter((entry) => entry.item !== undefined && !entry.item.disabled)
      .map((entry) => entry.index);
    if (enabled.length === 0) return Math.max(0, Math.min(current, filteredIds.length - 1));
    if (direction === 'home') return enabled[0]!;
    if (direction === 'end') return enabled.at(-1)!;

    const currentPosition = enabled.indexOf(current);
    if (currentPosition === -1) {
      if (direction === 'up') return enabled.filter((index) => index < current).at(-1) ?? enabled.at(-1)!;
      return enabled.find((index) => index > current) ?? enabled[0]!;
    }
    return direction === 'up'
      ? enabled[(currentPosition - 1 + enabled.length) % enabled.length]!
      : enabled[(currentPosition + 1) % enabled.length]!;
  }

  function normalizedEnabledHighlight(filteredIds: readonly string[], requested: number): number {
    const requestedId = filteredIds[requested];
    if (requestedId !== undefined && !itemForId(requestedId)?.disabled) return requested;
    return enabledHighlight(filteredIds, requested, 'down');
  }

  function makeModel(query: string, items: readonly OptionListItem<T>[], prev?: OptionListModel<T>): OptionListModel<T> {
    const filteredIds = computeFilteredIds(items, filter, query);
    const requestedHighlight = filteredIds.length === 0 ? 0 : Math.min(prev?.highlightedIndex ?? initialHighlight, filteredIds.length - 1);
    const highlighted = normalizedEnabledHighlight(filteredIds, requestedHighlight);
    return {
      query,
      filteredIds,
      highlightedIndex: highlighted,
      selectedIds: prev?.selectedIds ?? new Set<string>(),
      _itemsRef: items,
    };
  }

  return {
    init() {
      const model = makeModel(initialQuery, items);
      return [model, Cmd.none<OptionListMsg>()];
    },

    update(msg: OptionListMsg, model: OptionListModel<T>) {
      const sourceItems = items;
      switch (msg.type) {
        case 'opt-query': {
          const query = String(msg.query).slice(0, MAX_RENDER_CELLS);
          if (query === model.query) return [model, Cmd.none<OptionListMsg>()];
          // Reset highlight to 0 on query change — pattern matches every consuming builder.
          const filteredIds = computeFilteredIds(sourceItems, filter, query);
          const highlightedIndex = normalizedEnabledHighlight(filteredIds, 0);
          const next: OptionListModel<T> = {
            ...model,
            query,
            filteredIds,
            highlightedIndex,
          };
          const highlightedId = filteredIds[highlightedIndex];
          if (highlightedId) notifyHighlight(highlightedId);
          return [next, Cmd.none<OptionListMsg>()];
        }
        case 'opt-arrow': {
          if (model.filteredIds.length === 0) return [model, Cmd.none<OptionListMsg>()];
          const next = enabledHighlight(model.filteredIds, model.highlightedIndex, msg.direction);
          const nextModel: OptionListModel<T> = { ...model, highlightedIndex: next };
          const highlightedId = model.filteredIds[next];
          if (highlightedId) notifyHighlight(highlightedId);
          return [nextModel, Cmd.none<OptionListMsg>()];
        }
        case 'opt-hover': {
          const idx = model.filteredIds.indexOf(msg.id);
          const item = itemForId(msg.id);
          if (idx === -1 || item?.disabled || idx === model.highlightedIndex) return [model, Cmd.none<OptionListMsg>()];
          notifyHighlight(msg.id);
          return [{ ...model, highlightedIndex: idx }, Cmd.none<OptionListMsg>()];
        }
        case 'opt-select': {
          const id = model.filteredIds[model.highlightedIndex];
          if (!id) return [model, Cmd.none<OptionListMsg>()];
          const item = itemForId(id);
          if (!item || item.disabled) return [model, Cmd.none<OptionListMsg>()];
          if (config.multiSelect) {
            const next = new Set(model.selectedIds);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            notifySelect(id);
            return [{ ...model, selectedIds: next }, Cmd.none<OptionListMsg>()];
          }
          notifySelect(id);
          return [model, Cmd.none<OptionListMsg>()];
        }
        case 'opt-toggle': {
          const item = itemForId(msg.id);
          if (!item || item.disabled) return [model, Cmd.none<OptionListMsg>()];
          const next = new Set(model.selectedIds);
          if (next.has(msg.id)) next.delete(msg.id);
          else next.add(msg.id);
          notifySelect(msg.id);
          return [{ ...model, selectedIds: next }, Cmd.none<OptionListMsg>()];
        }
        case 'opt-click': {
          const item = itemForId(msg.id);
          const highlightedIndex = model.filteredIds.indexOf(msg.id);
          if (!item || item.disabled || highlightedIndex === -1) return [model, Cmd.none<OptionListMsg>()];
          if (config.multiSelect) {
            const selectedIds = new Set(model.selectedIds);
            selectedIds.has(msg.id) ? selectedIds.delete(msg.id) : selectedIds.add(msg.id);
            if (highlightedIndex !== model.highlightedIndex) notifyHighlight(msg.id);
            notifySelect(msg.id);
            return [{ ...model, selectedIds, highlightedIndex }, Cmd.none<OptionListMsg>()];
          }
          if (highlightedIndex !== model.highlightedIndex) notifyHighlight(msg.id);
          notifySelect(msg.id);
          return [{ ...model, highlightedIndex }, Cmd.none<OptionListMsg>()];
        }
        case 'opt-noop':
          return [model, Cmd.none<OptionListMsg>()];
      }
    },

    view(model: OptionListModel<T>): VNode {
      const tokens = useTokens(optionListContract, config, 'OptionList');
      void resolveTheme(config); // ensures reactive theme tracking

      if (model.filteredIds.length === 0) {
        return config.emptyState ?? text('No matches', style({ color: tokens.muted, italic: true }));
      }

      // Virtualize past maxVisible: render only the slice around the highlight.
      const total = model.filteredIds.length;
      const shouldVirtualize = config.virtualize ?? total > maxVisible;
      let startIdx = 0;
      let endIdx = total;
      if (shouldVirtualize) {
        const half = Math.floor(maxVisible / 2);
        startIdx = Math.max(0, Math.min(total - maxVisible, model.highlightedIndex - half));
        endIdx = Math.min(total, startIdx + maxVisible);
      }

      const rows: VNode[] = [];
      for (let i = startIdx; i < endIdx; i++) {
        const id = model.filteredIds[i]!;
        const item = itemForId(id);
        if (!item) continue;
        const isHighlighted = i === model.highlightedIndex;
        const isSelected = model.selectedIds.has(id);
        const isDisabled = item.disabled;
        const labelColor = isDisabled ? tokens.muted : isSelected ? tokens.selected : tokens.text;
        const rowStyle = style({
          color: labelColor,
          background: isHighlighted ? tokens.highlight : tokens.bg,
          bold: isSelected,
          dim: isDisabled,
        });
        const labelPrefix = config.multiSelect ? (isSelected ? '[x] ' : '[ ] ') : isHighlighted ? '▸ ' : '  ';
        const parts: VNode[] = [text(labelPrefix, rowStyle)];
        if (item.icon) parts.push(item.icon);
        parts.push(text(item.label, rowStyle));
        if (item.trailing) parts.push(item.trailing);
        const optionRow = row(...parts);
        setVNodeMeta(optionRow, { testId: id, a11y: { role: 'listitem', label: item.label, checked: isSelected } });
        rows.push(
          event(
            `${interactionId}:item:${id}`,
            optionRow,
            isDisabled ? { onScroll: scrollTag } : { onClick: clickTag, onMouseEnter: hoverTag, onScroll: scrollTag },
            {
              label: item.label,
              intent: isDisabled ? 'scroll' : 'select',
              affordances: isDisabled ? ['scroll'] : ['hover', 'click', 'scroll'],
              cursor: isDisabled ? 'default' : 'pointer',
            },
          ),
        );
      }

      return column(...rows);
    },

    subscriptions(_model: OptionListModel<T>): Sub<OptionListMsg> {
      return Sub.elementMouse<OptionListMsg>((mouseEvent) => {
        if (mouseEvent.handlerTag === scrollTag) {
          const direction = wheelDirection(mouseEvent.deltaY);
          return direction < 0
            ? { type: 'opt-arrow', direction: 'up' }
            : direction > 0
              ? { type: 'opt-arrow', direction: 'down' }
              : { type: 'opt-noop' };
        }
        if (!mouseEvent.elementId.startsWith(`${interactionId}:item:`)) return { type: 'opt-noop' };
        const id = mouseEvent.elementId.slice(`${interactionId}:item:`.length);
        if (mouseEvent.handlerTag === clickTag) return { type: 'opt-click', id };
        if (mouseEvent.handlerTag === hoverTag) return { type: 'opt-hover', id };
        return { type: 'opt-noop' };
      });
    },
  };
}
