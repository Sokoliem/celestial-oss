export const MAX_COLLECTION_ITEMS = 100_000;
export const DEFAULT_PROMPT_VISIBLE_ITEMS = 8;
export const MAX_PROMPT_VISIBLE_ITEMS = 1_000;
export const MAX_PROMPT_INPUT_GRAPHEMES = 100_000;
export const MAX_FIELD_ARRAY_INDEX = MAX_COLLECTION_ITEMS - 1;
export const MAX_WIZARD_STEPS = 1_000;
export const MAX_FORM_FIELDS = 1_000;

export interface NormalizedPromptOption {
  label: string;
  value: string;
}

export function boundedInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value!)));
}

export function finiteNumber(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? value! : fallback;
}

export function nextSequence(value: number | undefined): number {
  if (!Number.isSafeInteger(value) || value! < 0 || value! >= Number.MAX_SAFE_INTEGER) return 1;
  return value! + 1;
}

export function normalizePromptOptions(options: readonly string[] | readonly { label: string; value: string }[]): NormalizedPromptOption[] {
  return (options as readonly (string | { label: string; value: string })[])
    .slice(0, MAX_COLLECTION_ITEMS)
    .map((option) => (typeof option === 'string' ? { label: option, value: option } : { label: option.label, value: option.value }));
}

export function normalizeOptionIndex(index: number, length: number): number | null {
  if (length <= 0 || !Number.isInteger(index) || index < 0 || index >= length) return null;
  return index;
}

export function normalizeHighlightedIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return boundedInteger(index, 0, 0, length - 1);
}

export function promptWindow(index: number, length: number, requestedVisible?: number): { start: number; end: number } {
  if (length <= 0) return { start: 0, end: 0 };
  const visible = boundedInteger(requestedVisible, DEFAULT_PROMPT_VISIBLE_ITEMS, 1, MAX_PROMPT_VISIBLE_ITEMS);
  const highlighted = normalizeHighlightedIndex(index, length);
  const start = Math.max(0, Math.min(highlighted - Math.floor(visible / 2), length - visible));
  return { start, end: Math.min(length, start + visible) };
}

let interactionSequence = 0;

export function nextInteractionId(prefix: string): string {
  interactionSequence = (interactionSequence + 1) % Number.MAX_SAFE_INTEGER;
  return `orbit-${prefix}-${interactionSequence}`;
}
