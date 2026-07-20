import type { FieldArrayMsg } from './field-array.js';
import type { FieldArrayModel } from './types.js';

/**
 * Render-helpers for the default reorderable field-array view. The orbit
 * field-array engine already supports `move` and `swap` — these helpers
 * just standardise the messages a drag-handle produces so a host UI can
 * reorder without inventing payloads.
 */

export interface ReorderHandle {
  /** Stable item identifier (`FieldArrayModel.keys[i]`). */
  readonly key: number;
  /** Current index. */
  readonly index: number;
}

/**
 * Resolve a drop event into the canonical `field-array:move` message.
 * Returns `null` when the move would be a no-op (drop onto the same row).
 */
export function dropToMoveMsg<ItemMsg = unknown>(from: number, to: number): FieldArrayMsg<ItemMsg> | null {
  if (from === to) return null;
  if (from < 0 || to < 0) return null;
  return { type: 'field-array:move', from, to };
}

/**
 * Compute the move msg from a key-keyed drag event. Hosts that track
 * stable keys rather than indices use this to translate.
 */
export function dragKeyToMoveMsg<ItemModel, ItemMsg = unknown>(
  model: FieldArrayModel<ItemModel>,
  fromKey: number,
  toKey: number,
): FieldArrayMsg<ItemMsg> | null {
  const from = model.keys.indexOf(fromKey);
  const to = model.keys.indexOf(toKey);
  if (from < 0 || to < 0) return null;
  return dropToMoveMsg(from, to);
}

/** Build the swap msg for keyboard-driven reorder shortcuts (e.g. Alt+Up/Down). */
export function swapMsg<ItemMsg = unknown>(indexA: number, indexB: number): FieldArrayMsg<ItemMsg> | null {
  if (indexA === indexB || indexA < 0 || indexB < 0) return null;
  return { type: 'field-array:swap', indexA, indexB };
}
