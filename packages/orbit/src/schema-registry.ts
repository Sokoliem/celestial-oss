import { stableJsonString } from './schema-json.js';
import type { FieldTypeDescriptor, FieldTypeRegistry, JsonValue, RecentValueStore } from './schema-types.js';

const DEFAULT_RECENT_VALUE_LIMIT = 50;

export function createFieldTypeRegistry(initial: readonly FieldTypeDescriptor[] = []): FieldTypeRegistry {
  const descriptors = new Map<string, FieldTypeDescriptor>();

  for (const descriptor of initial) {
    descriptors.set(descriptor.typeKey, descriptor);
  }

  return {
    register(descriptor: FieldTypeDescriptor): () => void {
      descriptors.set(descriptor.typeKey, descriptor);
      return () => {
        if (descriptors.get(descriptor.typeKey) === descriptor) {
          descriptors.delete(descriptor.typeKey);
        }
      };
    },

    resolve(typeKey: string): FieldTypeDescriptor | null {
      return descriptors.get(typeKey) ?? null;
    },

    list(): readonly FieldTypeDescriptor[] {
      return [...descriptors.values()];
    },
  };
}

export function createInMemoryRecentValueStore(): RecentValueStore {
  const entries = new Map<string, JsonValue[]>();

  return {
    record(storeKey: string, value: JsonValue): void {
      const current = entries.get(storeKey) ?? [];
      const valueKey = stableJsonString(value);
      const next = [value, ...current.filter((entry) => stableJsonString(entry) !== valueKey)].slice(0, DEFAULT_RECENT_VALUE_LIMIT);
      entries.set(storeKey, next);
    },

    list(storeKey: string, max: number): readonly JsonValue[] {
      return [...(entries.get(storeKey) ?? [])].slice(0, Math.max(0, max));
    },

    clear(storeKey: string): void {
      entries.delete(storeKey);
    },
  };
}
