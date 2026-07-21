export const MAX_LAYOUT_ITEMS = 100_000;
export const MAX_CELL_SIZE = 1_000_000;
export const MAX_SPLIT_PANES = 1_000;

export function finiteNumber(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? value! : fallback;
}

export function boundedInteger(value: number | undefined, fallback: number, min: number, max = MAX_CELL_SIZE): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value!)));
}

export function nonNegativeInteger(value: number | undefined, fallback = 0, max = MAX_CELL_SIZE): number {
  return boundedInteger(value, fallback, 0, max);
}

export function positiveInteger(value: number | undefined, fallback = 1, max = MAX_CELL_SIZE): number {
  return boundedInteger(value, fallback, 1, max);
}

export function clampFinite(value: number, min: number, max: number, fallback = min): number {
  const safeMin = finiteNumber(min, 0);
  const safeMax = Math.max(safeMin, finiteNumber(max, safeMin));
  return Math.max(safeMin, Math.min(safeMax, finiteNumber(value, fallback)));
}

export function finiteCell(value: number | undefined, fallback = 0): number {
  return boundedInteger(value, fallback, -MAX_CELL_SIZE, MAX_CELL_SIZE);
}

export function isSafeRecordKey(value: string): boolean {
  return value.length > 0 && value !== '__proto__' && value !== 'prototype' && value !== 'constructor';
}
