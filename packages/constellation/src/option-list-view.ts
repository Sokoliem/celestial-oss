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
import { Cmd, column, type Msg, row, Sub, type ThemeContext, text, type VNode } from '@celestial/nebula';
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
  | Msg<'opt-toggle', { id: string }>;

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
  const maxVisible = Math.max(1, config.maxVisible ?? 50);
  const initialQuery = config.query ?? '';
  const initialHighlight = Math.max(0, config.initialHighlight ?? 0);

  function makeModel(query: string, items: readonly OptionListItem<T>[], prev?: OptionListModel<T>): OptionListModel<T> {
    const filteredIds = computeFilteredIds(items, filter, query);
    const highlighted = filteredIds.length === 0 ? 0 : Math.min(prev?.highlightedIndex ?? initialHighlight, filteredIds.length - 1);
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
      const model = makeModel(initialQuery, config.items);
      return [model, Cmd.none<OptionListMsg>()];
    },

    update(msg: OptionListMsg, model: OptionListModel<T>) {
      const items = model._itemsRef ?? config.items;
      switch (msg.type) {
        case 'opt-query': {
          if (msg.query === model.query) return [model, Cmd.none<OptionListMsg>()];
          // Reset highlight to 0 on query change — pattern matches every consuming builder.
          const filteredIds = computeFilteredIds(items, filter, msg.query);
          const next: OptionListModel<T> = {
            ...model,
            query: msg.query,
            filteredIds,
            highlightedIndex: filteredIds.length === 0 ? 0 : 0,
          };
          if (config.onHighlight && filteredIds.length > 0) {
            const id = filteredIds[0]!;
            const item = items.find((i) => i.id === id);
            if (item) {
              try {
                config.onHighlight(id, item.value);
              } catch {
                // best-effort
              }
            }
          }
          return [next, Cmd.none<OptionListMsg>()];
        }
        case 'opt-arrow': {
          if (model.filteredIds.length === 0) return [model, Cmd.none<OptionListMsg>()];
          const next = moveOptionHighlight(model.highlightedIndex, model.filteredIds.length, msg.direction);
          const nextModel: OptionListModel<T> = { ...model, highlightedIndex: next };
          if (config.onHighlight) {
            const id = model.filteredIds[next];
            if (id) {
              const item = items.find((i) => i.id === id);
              if (item) {
                try {
                  config.onHighlight(id, item.value);
                } catch {
                  // best-effort
                }
              }
            }
          }
          return [nextModel, Cmd.none<OptionListMsg>()];
        }
        case 'opt-hover': {
          const idx = model.filteredIds.indexOf(msg.id);
          if (idx === -1 || idx === model.highlightedIndex) return [model, Cmd.none<OptionListMsg>()];
          return [{ ...model, highlightedIndex: idx }, Cmd.none<OptionListMsg>()];
        }
        case 'opt-select': {
          const id = model.filteredIds[model.highlightedIndex];
          if (!id) return [model, Cmd.none<OptionListMsg>()];
          const item = items.find((i) => i.id === id);
          if (!item || item.disabled) return [model, Cmd.none<OptionListMsg>()];
          if (config.multiSelect) {
            const next = new Set(model.selectedIds);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            try {
              config.onSelect?.(id, item.value);
            } catch {
              // best-effort
            }
            return [{ ...model, selectedIds: next }, Cmd.none<OptionListMsg>()];
          }
          try {
            config.onSelect?.(id, item.value);
          } catch {
            // best-effort
          }
          return [model, Cmd.none<OptionListMsg>()];
        }
        case 'opt-toggle': {
          const item = items.find((i) => i.id === msg.id);
          if (!item || item.disabled) return [model, Cmd.none<OptionListMsg>()];
          const next = new Set(model.selectedIds);
          if (next.has(msg.id)) next.delete(msg.id);
          else next.add(msg.id);
          return [{ ...model, selectedIds: next }, Cmd.none<OptionListMsg>()];
        }
      }
    },

    view(model: OptionListModel<T>): VNode {
      const items = model._itemsRef ?? config.items;
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
        const item = items.find((it) => it.id === id);
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
        rows.push(row(...parts));
      }

      return column(...rows);
    },

    subscriptions(_model: OptionListModel<T>): Sub<OptionListMsg> {
      // The primitive doesn't own input — consumer wires its own arrow/enter
      // keys and dispatches the appropriate msg. We return none so consumers
      // can wrap with their own Sub.batch.
      return Sub.none<OptionListMsg>();
    },
  };
}
