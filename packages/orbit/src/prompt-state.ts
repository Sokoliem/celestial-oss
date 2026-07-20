// ─── Pure State Machines (extracted from original prompt.ts) ─────────────────
// These are the original pure-logic state machines for prompt interactions.
// They remain for backward compatibility. Prefer the new ComponentDescriptor
// prompts (inputPrompt, confirmPrompt, selectPrompt, multiSelectPrompt) in
// prompt.ts for Elm Architecture integration.

import { segmentGraphemes } from '@celestial/rosetta';
import { normalizeHighlightedIndex, normalizeOptionIndex, normalizePromptOptions } from './internal.js';

// ─── Input State ────────────────────────────────────────────────────────────

export interface InputState {
  value: string;
  done: boolean;
}

export function createInputState(defaultValue?: string): InputState {
  return { value: defaultValue ?? '', done: false };
}

export function updateInputState(state: InputState, key: string): InputState {
  if (state.done) return state;
  if (key === 'return' || key === 'enter') {
    return { ...state, done: true };
  }
  if (key === 'backspace') {
    return { ...state, value: segmentGraphemes(state.value).slice(0, -1).join('') };
  }
  // Append a single user-perceived character, including combined sequences.
  if (segmentGraphemes(key).length === 1) {
    return { ...state, value: state.value + key };
  }
  return state;
}

// ─── Confirm State ──────────────────────────────────────────────────────────

export interface ConfirmState {
  value: boolean | null;
  defaultValue: boolean;
  done: boolean;
}

export function createConfirmState(defaultValue?: boolean): ConfirmState {
  return { value: null, defaultValue: defaultValue ?? false, done: false };
}

export function updateConfirmState(state: ConfirmState, key: string): ConfirmState {
  if (state.done) return state;
  const lower = key.toLowerCase();
  if (lower === 'y') {
    return { ...state, value: true, done: true };
  }
  if (lower === 'n') {
    return { ...state, value: false, done: true };
  }
  if (key === 'return' || key === 'enter') {
    return { ...state, value: state.defaultValue, done: true };
  }
  return state;
}

export function confirmResult(state: ConfirmState): boolean {
  return state.value ?? state.defaultValue;
}

// ─── Select State ───────────────────────────────────────────────────────────

export interface SelectState {
  options: { label: string; value: string }[];
  highlighted: number;
  selected: string | null;
  done: boolean;
}

export function createSelectState(options: readonly string[] | readonly { label: string; value: string }[]): SelectState {
  const normalized = normalizePromptOptions(options);
  return { options: normalized, highlighted: 0, selected: null, done: false };
}

export function updateSelectState(state: SelectState, key: string): SelectState {
  if (state.done) return state;
  if (key === 'up') {
    const current = normalizeHighlightedIndex(state.highlighted, state.options.length);
    const highlighted = Math.max(0, current - 1);
    return { ...state, highlighted };
  }
  if (key === 'down') {
    const current = normalizeHighlightedIndex(state.highlighted, state.options.length);
    const highlighted = state.options.length === 0 ? 0 : Math.min(state.options.length - 1, current + 1);
    return { ...state, highlighted };
  }
  if (key === 'return' || key === 'enter') {
    const index = normalizeOptionIndex(state.highlighted, state.options.length);
    if (index === null) return state;
    return { ...state, highlighted: index, selected: state.options[index]!.value, done: true };
  }
  return state;
}

// ─── MultiSelect State ──────────────────────────────────────────────────────

export interface MultiSelectState {
  options: { label: string; value: string }[];
  highlighted: number;
  selected: Set<number>;
  done: boolean;
}

export function createMultiSelectState(options: readonly string[] | readonly { label: string; value: string }[]): MultiSelectState {
  const normalized = normalizePromptOptions(options);
  return { options: normalized, highlighted: 0, selected: new Set(), done: false };
}

export function updateMultiSelectState(state: MultiSelectState, key: string): MultiSelectState {
  if (state.done) return state;
  if (key === 'up') {
    const current = normalizeHighlightedIndex(state.highlighted, state.options.length);
    const highlighted = Math.max(0, current - 1);
    return { ...state, highlighted };
  }
  if (key === 'down') {
    const current = normalizeHighlightedIndex(state.highlighted, state.options.length);
    const highlighted = state.options.length === 0 ? 0 : Math.min(state.options.length - 1, current + 1);
    return { ...state, highlighted };
  }
  if (key === 'space' || key === ' ') {
    const highlighted = normalizeOptionIndex(state.highlighted, state.options.length);
    if (highlighted === null) return state;
    const newSelected = new Set(state.selected);
    if (newSelected.has(highlighted)) {
      newSelected.delete(highlighted);
    } else {
      newSelected.add(highlighted);
    }
    return { ...state, highlighted, selected: newSelected };
  }
  if (key === 'return' || key === 'enter') {
    return { ...state, done: true };
  }
  return state;
}

export function multiSelectResults(state: MultiSelectState): string[] {
  return Array.from(state.selected)
    .filter((index) => normalizeOptionIndex(index, state.options.length) !== null)
    .sort((a, b) => a - b)
    .map((i) => state.options[i]!.value);
}
