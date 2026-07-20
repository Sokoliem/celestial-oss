import type { JsonValue } from './schema-types.js';

function isJsonObject(value: JsonValue): value is Record<string, JsonValue> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeJsonValue(entry));
  }

  if (!isJsonObject(value)) {
    return value;
  }

  const normalizedEntries = Object.entries(value)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, entryValue]) => [key, normalizeJsonValue(entryValue)] as const);

  return Object.fromEntries(normalizedEntries);
}

export function stableJsonString(value: JsonValue): string {
  return JSON.stringify(normalizeJsonValue(value));
}

export function jsonValuesEqual(left: JsonValue, right: JsonValue): boolean {
  return stableJsonString(left) === stableJsonString(right);
}
