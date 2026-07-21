import type { Msg } from '@celestial/nebula';
import { Cmd } from '@celestial/nebula';
import { boundedInteger, MAX_COLLECTION_ITEMS, MAX_FIELD_ARRAY_INDEX } from './internal.js';
import type { FieldArrayConfig, FieldArrayModel, FieldArrayPath } from './types.js';

// ─── Messages ───────────────────────────────────────────────────────────────

export type FieldArrayMsg<ItemMsg = unknown> =
  | Msg<'field-array:append'>
  | Msg<'field-array:prepend'>
  | Msg<'field-array:remove', { readonly index: number }>
  | Msg<'field-array:move', { readonly from: number; readonly to: number }>
  | Msg<'field-array:swap', { readonly indexA: number; readonly indexB: number }>
  | Msg<'field-array:update-item', { readonly index: number; readonly msg: ItemMsg }>
  | Msg<'field-array:clear'>;

// ─── Descriptor ─────────────────────────────────────────────────────────────

/**
 * Public interface for a field array instance.
 * Manages a dynamic list of repeating items with stable keys.
 */
export interface FieldArrayDescriptor<ItemModel, ItemMsg> {
  init(): [FieldArrayModel<ItemModel>, Cmd<FieldArrayMsg<ItemMsg>>];
  update(msg: FieldArrayMsg<ItemMsg>, model: FieldArrayModel<ItemModel>): [FieldArrayModel<ItemModel>, Cmd<FieldArrayMsg<ItemMsg>>];

  // Helpers
  getItems(model: FieldArrayModel<ItemModel>): ItemModel[];
  getKeys(model: FieldArrayModel<ItemModel>): number[];
  length(model: FieldArrayModel<ItemModel>): number;
  canAppend(model: FieldArrayModel<ItemModel>): boolean;
  canRemove(model: FieldArrayModel<ItemModel>): boolean;
}

// ─── Factory ────────────────────────────────────────────────────────────────

/**
 * Create a field array manager.
 *
 * A field array manages a dynamic list of repeating item models.
 * Each item gets a stable integer key for reconciliation.
 * Items can be appended, prepended, removed, moved, swapped, and cleared.
 * min/max constraints are enforced.
 */
export function fieldArray<ItemModel, ItemMsg>(config: FieldArrayConfig<ItemModel, ItemMsg>): FieldArrayDescriptor<ItemModel, ItemMsg> {
  if (config.minItems !== undefined && (!Number.isInteger(config.minItems) || config.minItems < 0 || config.minItems > MAX_COLLECTION_ITEMS)) {
    throw new RangeError(`orbit/fieldArray: minItems must be an integer between 0 and ${MAX_COLLECTION_ITEMS}`);
  }
  if (
    config.maxItems !== undefined &&
    config.maxItems !== Number.POSITIVE_INFINITY &&
    (!Number.isInteger(config.maxItems) || config.maxItems < 0 || config.maxItems > MAX_COLLECTION_ITEMS)
  ) {
    throw new RangeError(`orbit/fieldArray: maxItems must be an integer between 0 and ${MAX_COLLECTION_ITEMS}, or Infinity`);
  }
  const minItems = boundedInteger(config.minItems, 0, 0, MAX_COLLECTION_ITEMS);
  const maxItems =
    config.maxItems === undefined || config.maxItems === Number.POSITIVE_INFINITY
      ? MAX_COLLECTION_ITEMS
      : boundedInteger(config.maxItems, MAX_COLLECTION_ITEMS, 0, MAX_COLLECTION_ITEMS);
  if (minItems > maxItems) throw new RangeError('orbit/fieldArray: minItems must not exceed maxItems');

  function createInitial(): FieldArrayModel<ItemModel> {
    const items: ItemModel[] = [];
    const keys: number[] = [];
    let nextKey = 0;

    for (let i = 0; i < minItems; i++) {
      const [item] = config.createItem();
      items.push(item);
      keys.push(nextKey++);
    }

    return { items, keys, nextKey };
  }

  return {
    init(): [FieldArrayModel<ItemModel>, Cmd<FieldArrayMsg<ItemMsg>>] {
      return [createInitial(), Cmd.none()];
    },

    update(msg: FieldArrayMsg<ItemMsg>, model: FieldArrayModel<ItemModel>): [FieldArrayModel<ItemModel>, Cmd<FieldArrayMsg<ItemMsg>>] {
      switch (msg.type) {
        case 'field-array:append': {
          if (model.items.length >= maxItems) return [model, Cmd.none()];
          const [item] = config.createItem();
          return [
            {
              items: [...model.items, item],
              keys: [...model.keys, model.nextKey],
              nextKey: model.nextKey + 1,
            },
            Cmd.none(),
          ];
        }

        case 'field-array:prepend': {
          if (model.items.length >= maxItems) return [model, Cmd.none()];
          const [item] = config.createItem();
          return [
            {
              items: [item, ...model.items],
              keys: [model.nextKey, ...model.keys],
              nextKey: model.nextKey + 1,
            },
            Cmd.none(),
          ];
        }

        case 'field-array:remove': {
          const { index } = msg;
          if (!Number.isInteger(index) || index < 0 || index >= model.items.length) return [model, Cmd.none()];
          if (model.items.length <= minItems) return [model, Cmd.none()];
          return [
            {
              items: model.items.filter((_, i) => i !== index),
              keys: model.keys.filter((_, i) => i !== index),
              nextKey: model.nextKey,
            },
            Cmd.none(),
          ];
        }

        case 'field-array:move': {
          const { from, to } = msg;
          if (!Number.isInteger(from) || from < 0 || from >= model.items.length) return [model, Cmd.none()];
          if (!Number.isInteger(to) || to < 0 || to >= model.items.length) return [model, Cmd.none()];
          if (from === to) return [model, Cmd.none()];

          const newItems = [...model.items];
          const newKeys = [...model.keys];

          // Remove from source
          const [movedItem] = newItems.splice(from, 1);
          const [movedKey] = newKeys.splice(from, 1);

          // Insert at target
          newItems.splice(to, 0, movedItem!);
          newKeys.splice(to, 0, movedKey!);

          return [{ items: newItems, keys: newKeys, nextKey: model.nextKey }, Cmd.none()];
        }

        case 'field-array:swap': {
          const { indexA, indexB } = msg;
          if (!Number.isInteger(indexA) || indexA < 0 || indexA >= model.items.length) return [model, Cmd.none()];
          if (!Number.isInteger(indexB) || indexB < 0 || indexB >= model.items.length) return [model, Cmd.none()];
          if (indexA === indexB) return [model, Cmd.none()];

          const newItems = [...model.items];
          const newKeys = [...model.keys];

          // Swap items
          const tmpItem = newItems[indexA]!;
          newItems[indexA] = newItems[indexB]!;
          newItems[indexB] = tmpItem;

          // Swap keys
          const tmpKey = newKeys[indexA]!;
          newKeys[indexA] = newKeys[indexB]!;
          newKeys[indexB] = tmpKey;

          return [{ items: newItems, keys: newKeys, nextKey: model.nextKey }, Cmd.none()];
        }

        case 'field-array:update-item': {
          const { index } = msg;
          if (!Number.isInteger(index) || index < 0 || index >= model.items.length) return [model, Cmd.none()];

          // For update-item, the msg payload is passed directly as the new item model
          // This is the simplest approach; a more complex approach would delegate
          // to an item's own update function.
          const newItems = [...model.items];
          newItems[index] = msg.msg as unknown as ItemModel;

          return [{ ...model, items: newItems }, Cmd.none()];
        }

        case 'field-array:clear': {
          // Clear and re-populate to minItems
          if (minItems > 0) {
            return [createInitial(), Cmd.none()];
          }
          return [{ items: [], keys: [], nextKey: model.nextKey }, Cmd.none()];
        }

        default:
          return [model, Cmd.none()];
      }
    },

    // ── Helpers ──────────────────────────────────────────────────────────

    getItems(model: FieldArrayModel<ItemModel>): ItemModel[] {
      return [...model.items];
    },

    getKeys(model: FieldArrayModel<ItemModel>): number[] {
      return [...model.keys];
    },

    length(model: FieldArrayModel<ItemModel>): number {
      return model.items.length;
    },

    canAppend(model: FieldArrayModel<ItemModel>): boolean {
      return model.items.length < maxItems;
    },

    canRemove(model: FieldArrayModel<ItemModel>): boolean {
      return model.items.length > minItems;
    },
  };
}

type PathSegment = string | number;

const UNSAFE_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

export function parseFieldArrayPath(path: FieldArrayPath): PathSegment[] | undefined {
  if (!path) return undefined;

  const segments: PathSegment[] = [];
  let cursor = 0;

  function readName(): string | undefined {
    const start = cursor;
    while (cursor < path.length && path[cursor] !== '.' && path[cursor] !== '[' && path[cursor] !== ']') cursor++;
    if (cursor === start) return undefined;
    return path.slice(start, cursor);
  }

  const first = readName();
  if (!first || UNSAFE_PATH_SEGMENTS.has(first)) return undefined;
  segments.push(first);

  while (cursor < path.length) {
    if (path[cursor] === '.') {
      cursor++;
      const name = readName();
      if (!name || UNSAFE_PATH_SEGMENTS.has(name)) return undefined;
      segments.push(name);
      continue;
    }
    if (path[cursor] === '[') {
      const close = path.indexOf(']', cursor + 1);
      if (close < 0) return undefined;
      const rawIndex = path.slice(cursor + 1, close);
      if (!/^\d+$/.test(rawIndex)) return undefined;
      const index = Number(rawIndex);
      if (!Number.isSafeInteger(index) || index > MAX_FIELD_ARRAY_INDEX) return undefined;
      segments.push(index);
      cursor = close + 1;
      continue;
    }
    return undefined;
  }

  return segments;
}

export function getFieldArrayValue<T = unknown>(value: unknown, path: FieldArrayPath): T | undefined {
  const segments = parseFieldArrayPath(path);
  if (!segments) return undefined;

  let current: any = value;
  for (const segment of segments) {
    if (current == null) return undefined;
    if ((typeof current !== 'object' && typeof current !== 'string') || !Object.hasOwn(current, segment)) return undefined;
    current = current[segment as any];
  }

  return current as T | undefined;
}

function setPathValue(target: unknown, segments: PathSegment[], value: unknown): unknown {
  if (segments.length === 0) return value;

  const [head, ...tail] = segments;

  if (typeof head === 'number') {
    const source = Array.isArray(target) ? [...target] : [];
    source[head] = setPathValue(source[head], tail, value);
    return source;
  }

  const source = target && typeof target === 'object' && !Array.isArray(target) ? { ...(target as Record<string, unknown>) } : {};

  const key = head as string;
  (source as Record<string, unknown>)[key] = setPathValue((source as Record<string, unknown>)[key], tail, value);
  return source;
}

export function setFieldArrayValue<T>(target: T, path: FieldArrayPath, value: unknown): T {
  const segments = parseFieldArrayPath(path);
  if (!segments) return target;
  return setPathValue(target, segments, value) as T;
}

export function appendValueAtPath<T>(target: T, path: FieldArrayPath, value: unknown): T {
  const resolved = getFieldArrayValue<unknown>(target, path);
  const current = Array.isArray(resolved) ? resolved : [];
  if (current.length >= MAX_COLLECTION_ITEMS) return target;
  return setFieldArrayValue(target, path, [...current, value]);
}

export function removeValueAtPath<T>(target: T, path: FieldArrayPath, index: number): T {
  const current = getFieldArrayValue<unknown[]>(target, path);
  if (!Array.isArray(current) || !Number.isInteger(index) || index < 0 || index >= current.length) return target;
  return setFieldArrayValue(
    target,
    path,
    current.filter((_, itemIndex) => itemIndex !== index),
  );
}

/**
 * @deprecated Use `getFieldArrayValue` instead. This alias exists for
 * backward compatibility and will be removed in 3.0. The two names confuse
 * call-site authors when scanning for the canonical helper.
 */
export const getValueAtPath = getFieldArrayValue;

/**
 * @deprecated Use `setFieldArrayValue` instead. Same rationale as
 * `getValueAtPath` above. Will be removed in 3.0.
 */
export const setValueAtPath = setFieldArrayValue;
