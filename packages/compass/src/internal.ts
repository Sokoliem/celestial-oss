const CONTROL_CODE_UNIT = /[\u0000-\u001f\u007f-\u009f]/u;
export const MAX_CAPTURED_ARRAY_LENGTH = 100_000;
const PROTOTYPE_SENSITIVE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const LIBRARY_SNAPSHOTS = new WeakSet<object>();

export interface CapturedObject {
  readonly source: object;
  readonly values: Readonly<Record<string, unknown>>;
  readonly present: ReadonlySet<string>;
  readonly canonical: boolean;
}

export interface CapturedArray<T = unknown> {
  readonly values: readonly T[];
  readonly canonical: boolean;
}

interface PropertySpec {
  readonly key: string;
  readonly required: boolean;
}

function hasSameKeys(actual: readonly PropertyKey[], expected: readonly string[]): boolean {
  if (actual.length !== expected.length) return false;
  const actualKeys = new Set(actual);
  return expected.every((key) => actualKeys.has(key));
}

function frozenDataDescriptor(descriptor: PropertyDescriptor): boolean {
  return (
    'value' in descriptor &&
    descriptor.enumerable === true &&
    descriptor.configurable === false &&
    descriptor.writable === false
  );
}

function isBidiFormatCodeUnit(code: number): boolean {
  return (
    code === 0x061c ||
    code === 0x200e ||
    code === 0x200f ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069)
  );
}

export function freezeSnapshot<T extends object>(value: T): T {
  Object.freeze(value);
  LIBRARY_SNAPSHOTS.add(value);
  return value;
}

export function isLibrarySnapshot(value: object): boolean {
  return LIBRARY_SNAPSHOTS.has(value);
}

export function hasIllFormedUtf16(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

export function assertWellFormedString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string') {
    throw new TypeError(`${label} must be a string`);
  }
  if (CONTROL_CODE_UNIT.test(value)) {
    throw new RangeError(`${label} must not contain terminal control characters`);
  }
  if (hasIllFormedUtf16(value)) {
    throw new RangeError(`${label} must contain well-formed UTF-16`);
  }
}

export function assertSafeRecordKey(value: string, label: string): void {
  assertWellFormedString(value, label);
  if (value.length === 0) {
    throw new RangeError(`${label} must not be empty`);
  }
  if (PROTOTYPE_SENSITIVE_KEYS.has(value)) {
    throw new RangeError(`${label} must not use a prototype-sensitive key`);
  }
}

export function diagnosticText(value: string): string {
  let output = '';
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        output += value.slice(index, index + 2);
        index += 1;
      } else {
        output += `\\u${code.toString(16).padStart(4, '0')}`;
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      output += `\\u${code.toString(16).padStart(4, '0')}`;
    } else if (
      code <= 0x1f ||
      (code >= 0x7f && code <= 0x9f) ||
      code === 0x2028 ||
      code === 0x2029 ||
      isBidiFormatCodeUnit(code)
    ) {
      output += `\\u${code.toString(16).padStart(4, '0')}`;
    } else if (value[index] === '\\' || value[index] === '"') {
      output += `\\${value[index]}`;
    } else {
      output += value[index];
    }
  }
  return output;
}

export function diagnosticUnknown(value: unknown): string {
  switch (typeof value) {
    case 'string':
      return diagnosticText(value);
    case 'number':
    case 'bigint':
    case 'boolean':
    case 'undefined':
      return String(value);
    case 'symbol':
      return `Symbol(${diagnosticText(value.description ?? '')})`;
    case 'function':
      return '[function]';
    case 'object':
      return value === null ? 'null' : Array.isArray(value) ? '[array]' : '[object]';
  }
}

export function captureObject(
  value: unknown,
  label: string,
  required: readonly string[],
  optional: readonly string[] = [],
): CapturedObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }

  const specs: PropertySpec[] = [
    ...required.map((key) => ({ key, required: true })),
    ...optional.map((key) => ({ key, required: false })),
  ];
  const ownKeys = Reflect.ownKeys(value);
  const values = Object.create(null) as Record<string, unknown>;
  const present = new Set<string>();
  const descriptors = new Map<string, PropertyDescriptor>();

  for (const { key, required: isRequired } of specs) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined) {
      if (isRequired) {
        throw new TypeError(`${label} must define own data property "${diagnosticText(key)}"`);
      }
      continue;
    }
    if (!('value' in descriptor)) {
      throw new TypeError(`${label} property "${diagnosticText(key)}" must be an own data property`);
    }
    present.add(key);
    descriptors.set(key, descriptor);
    values[key] = descriptor.value;
  }

  const presentKeys = [...present];
  const canonical =
    isLibrarySnapshot(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    !Object.isExtensible(value) &&
    hasSameKeys(ownKeys, presentKeys) &&
    presentKeys.every((key) => {
      const descriptor = descriptors.get(key);
      return descriptor !== undefined && frozenDataDescriptor(descriptor);
    });

  return Object.freeze({
    source: value,
    values: Object.freeze(values),
    present: Object.freeze(present),
    canonical,
  });
}

export function captureDenseArray<T = unknown>(value: unknown, label: string): CapturedArray<T> {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be an array`);
  }

  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  if (lengthDescriptor === undefined || !('value' in lengthDescriptor)) {
    throw new TypeError(`${label} length must be an own data property`);
  }
  const length: unknown = lengthDescriptor.value;
  if (!Number.isSafeInteger(length) || (length as number) < 0) {
    throw new RangeError(`${label} length must be a non-negative safe integer`);
  }
  if ((length as number) > MAX_CAPTURED_ARRAY_LENGTH) {
    throw new RangeError(`${label} length must not exceed ${MAX_CAPTURED_ARRAY_LENGTH}`);
  }
  const ownKeys = Reflect.ownKeys(value);
  const values: T[] = [];
  const descriptors: PropertyDescriptor[] = [];
  for (let index = 0; index < (length as number); index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined) {
      throw new RangeError(`${label} must be dense; missing index ${index}`);
    }
    if (!('value' in descriptor)) {
      throw new TypeError(`${label} index ${index} must be an own data property`);
    }
    descriptors.push(descriptor);
    values.push(descriptor.value as T);
  }

  const canonical =
    isLibrarySnapshot(value) &&
    Object.getPrototypeOf(value) === Array.prototype &&
    !Object.isExtensible(value) &&
    hasSameKeys(ownKeys, [
      ...Array.from({ length: length as number }, (_, index) => String(index)),
      'length',
    ]) &&
    lengthDescriptor.configurable === false &&
    lengthDescriptor.writable === false &&
    descriptors.every(frozenDataDescriptor);

  return Object.freeze({
    values: Object.freeze(values),
    canonical,
  });
}

function snapshotImmutableDataInternal(value: unknown, label: string, active: WeakSet<object>): unknown {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'function' || typeof value === 'symbol') {
      throw new TypeError(`${label} must contain only immutable plain data`);
    }
    return value;
  }
  if (active.has(value)) {
    throw new RangeError(`${label} must not contain circular references`);
  }

  active.add(value);
  try {
    if (Array.isArray(value)) {
      const captured = captureDenseArray(value, label);
      const items = captured.values.map((item, index) =>
        snapshotImmutableDataInternal(item, `${label}[${index}]`, active),
      );
      if (captured.canonical && items.every((item, index) => item === captured.values[index])) {
        return value;
      }
      return freezeSnapshot(items);
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${label} must contain only arrays and plain records`);
    }
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key === 'symbol')) {
      throw new RangeError(`${label} must not contain symbol keys`);
    }

    const snapshot = Object.create(null) as Record<string, unknown>;
    const descriptors: PropertyDescriptor[] = [];
    let childrenCanonical = true;
    for (const propertyKey of ownKeys) {
      const key = propertyKey as string;
      assertSafeRecordKey(key, `${label} key`);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !('value' in descriptor) || descriptor.enumerable !== true) {
        throw new TypeError(`${label} property "${diagnosticText(key)}" must be an enumerable own data property`);
      }
      descriptors.push(descriptor);
      const child = snapshotImmutableDataInternal(descriptor.value, `${label}.${diagnosticText(key)}`, active);
      snapshot[key] = child;
      if (child !== descriptor.value) childrenCanonical = false;
    }

    if (
      isLibrarySnapshot(value) &&
      prototype === null &&
      !Object.isExtensible(value) &&
      descriptors.every(frozenDataDescriptor) &&
      childrenCanonical
    ) {
      return value;
    }
    return freezeSnapshot(snapshot);
  } finally {
    active.delete(value);
  }
}

export function snapshotImmutableData<T>(value: T, label: string): T {
  return snapshotImmutableDataInternal(value, label, new WeakSet()) as T;
}
