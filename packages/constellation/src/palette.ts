import { fuzzyFilter } from './fuzzy.js';
import { moveOptionHighlight } from './option-list-view.js';

export interface Command<M = unknown> {
  id: string;
  label: string;
  category?: string;
  shortcut?: string;
  msg: M;
  keywords?: string[];
}

export interface PaletteState {
  open: boolean;
  query: string;
  selectedIndex: number;
  filteredIds: string[];
}

export interface RankedCommand<M = unknown> {
  command: Command<M>;
  score: number;
}

export interface PaletteVisibleWindow {
  start: number;
  end: number;
}

export interface PaletteCategoryGroup {
  category: string | null;
  commandIds: string[];
}

export type PaletteMsg =
  | { type: 'pal-open' }
  | { type: 'pal-close' }
  | { type: 'pal-input'; char: string }
  | { type: 'pal-backspace' }
  | { type: 'pal-up' }
  | { type: 'pal-down' }
  | { type: 'pal-select' };

export function createPaletteState(): PaletteState {
  return {
    open: false,
    query: '',
    selectedIndex: 0,
    filteredIds: [],
  };
}

/** Build searchable text from a command: label + keywords */
export function buildPaletteSearchText<M>(command: Command<M>): string {
  const parts = [command.label];
  if (command.keywords && command.keywords.length > 0) {
    parts.push(...command.keywords);
  }
  return parts.join(' ');
}

/** Rank commands for a query, preserving fuzzy-score order. */
export function rankPaletteCommands<M>(query: string, commands: readonly Command<M>[]): RankedCommand<M>[] {
  if (query === '') {
    return commands.map((command) => ({ command, score: 0 }));
  }

  return fuzzyFilter([...commands], query, (cmd) => buildPaletteSearchText(cmd)).map((result) => ({
    command: result.item,
    score: result.score,
  }));
}

/** Filter commands by query and return sorted IDs. */
export function filterPaletteCommandIds<M>(query: string, commands: readonly Command<M>[]): string[] {
  if (query === '') {
    return commands.map((c) => c.id);
  }
  return rankPaletteCommands(query, commands).map((result) => result.command.id);
}

/** Compute the visible inclusive-exclusive window that keeps the selection in view. */
export function getPaletteVisibleWindow(total: number, selectedIndex: number, maxVisible: number): PaletteVisibleWindow {
  const safeTotal = Math.max(0, total);
  const safeVisible = Math.max(1, maxVisible);
  if (safeTotal === 0) {
    return { start: 0, end: 0 };
  }

  const maxStart = Math.max(0, safeTotal - safeVisible);
  const clampedIndex = Math.max(0, Math.min(selectedIndex, safeTotal - 1));
  let start = Math.max(0, clampedIndex - safeVisible + 1);
  if (clampedIndex < safeVisible) {
    start = 0;
  }
  start = Math.min(start, maxStart);
  return {
    start,
    end: Math.min(safeTotal, start + safeVisible),
  };
}

/** Group ordered command IDs by adjacent categories while preserving order. */
export function groupPaletteCommandIdsByCategory<M>(commandIds: readonly string[], commands: readonly Command<M>[]): PaletteCategoryGroup[] {
  const commandById = new Map(commands.map((command) => [command.id, command] as const));
  const groups: PaletteCategoryGroup[] = [];

  for (const commandId of commandIds) {
    const command = commandById.get(commandId);
    if (!command) {
      continue;
    }

    const category = command.category ?? null;
    const lastGroup = groups[groups.length - 1];
    if (!lastGroup || lastGroup.category !== category) {
      groups.push({ category, commandIds: [commandId] });
      continue;
    }

    lastGroup.commandIds.push(commandId);
  }

  return groups;
}

export function paletteUpdate<M>(msg: PaletteMsg, state: PaletteState, commands: Command<M>[]): PaletteState {
  switch (msg.type) {
    case 'pal-open': {
      const filteredIds = filterPaletteCommandIds('', commands);
      return {
        open: true,
        query: '',
        selectedIndex: 0,
        filteredIds,
      };
    }

    case 'pal-close':
      return createPaletteState();

    case 'pal-input': {
      const newQuery = state.query + msg.char;
      const filteredIds = filterPaletteCommandIds(newQuery, commands);
      return {
        ...state,
        query: newQuery,
        filteredIds,
        selectedIndex: 0,
      };
    }

    case 'pal-backspace': {
      const newQuery = state.query.slice(0, -1);
      const filteredIds = filterPaletteCommandIds(newQuery, commands);
      return {
        ...state,
        query: newQuery,
        filteredIds,
        selectedIndex: 0,
      };
    }

    case 'pal-up': {
      if (state.filteredIds.length === 0) return state;
      const newIndex = moveOptionHighlight(state.selectedIndex, state.filteredIds.length, 'up');
      return { ...state, selectedIndex: newIndex };
    }

    case 'pal-down': {
      if (state.filteredIds.length === 0) return state;
      const newIndex = moveOptionHighlight(state.selectedIndex, state.filteredIds.length, 'down');
      return { ...state, selectedIndex: newIndex };
    }

    case 'pal-select':
      return state;

    default:
      return state;
  }
}

/** Get the currently selected command */
export function getSelectedCommand<M>(state: PaletteState, commands: Command<M>[]): Command<M> | null {
  if (!state.open || state.filteredIds.length === 0) return null;
  if (state.selectedIndex < 0 || state.selectedIndex >= state.filteredIds.length) {
    return null;
  }
  const selectedId = state.filteredIds[state.selectedIndex];
  return commands.find((c) => c.id === selectedId) ?? null;
}
