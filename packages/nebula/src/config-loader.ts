/**
 * Platform-neutral configuration loading.
 *
 * Sources own I/O. Nebula only coordinates precedence, parsing, validation,
 * and diagnostics, so the same loader can be used with files, environment
 * variables, browser storage, or an in-memory test adapter.
 */

import { segmentGraphemes } from '@celestial/rosetta';

const UNSAFE_SINGLE_LINE_TEXT = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069\uD800-\uDFFF]/u;
const UNSAFE_DIAGNOSTIC_TEXT =
  /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069\uD800-\uDFFF]/gu;
const ILL_FORMED_UTF16 = /[\uD800-\uDFFF]/u;
const MAX_SOURCE_ID_LENGTH = 256;
const MAX_CONFIG_SOURCES = 1_000;
const MAX_DIAGNOSTIC_DETAIL_LENGTH = 1_024;
const MAX_VALIDATION_ISSUES = 100;
const MAX_VALIDATION_ISSUE_LENGTH = 2_048;
const MAX_STAGE_TIMEOUT_MS = 2_147_483_647;
const STAGE_TIMEOUT = Symbol('config-adapter-timeout');
const NATIVE_PROMISE_THEN = Promise.prototype.then;

export interface ConfigSource {
  /** Stable, human-readable identifier used in diagnostics. */
  readonly id: string;
  /** Return `undefined` only when this source is absent. */
  readonly read: () => string | undefined | Promise<string | undefined>;
}

export interface ConfigLoadContext {
  readonly sourceId: string;
  /** Zero-based index in the caller's highest-to-lowest precedence list. */
  readonly precedenceIndex: number;
}

export type ConfigValidation<T> =
  /**
   * Successful values are snapshotted into deeply frozen plain data before
   * they leave the loader. Functions, accessors, symbols, class instances,
   * maps, sets, promises, and other stateful objects are rejected.
   */
  { readonly valid: true; readonly value: T } | { readonly valid: false; readonly issues: readonly string[] };

export interface ConfigLoadOptions<T> {
  /**
   * Required to make source ordering explicit at every call site.
   *
   * The first listed source that returns content wins. An error in that
   * source is terminal and never falls through to a lower-priority source.
   */
  readonly precedence: 'first-listed-wins';
  /** Sources ordered from highest to lowest precedence. */
  readonly sources: readonly ConfigSource[];
  readonly parse: (contents: string, context: ConfigLoadContext) => unknown | Promise<unknown>;
  readonly validate: (candidate: unknown, context: ConfigLoadContext) => ConfigValidation<T> | Promise<ConfigValidation<T>>;
  /**
   * Optional independent timeout for each read, parse, and validate adapter.
   * Omit only when adapter liveness is guaranteed by the caller.
   */
  readonly stageTimeoutMs?: number;
}

export type ConfigDiagnosticStage = 'resolve' | 'read' | 'parse' | 'validate';

export type ConfigDiagnosticCode =
  | 'config-not-found'
  | 'config-read-failed'
  | 'config-read-adapter-invalid'
  | 'config-parse-failed'
  | 'config-validation-failed'
  | 'config-validation-adapter-invalid'
  | 'config-adapter-timeout';

export interface ConfigDiagnostic {
  readonly code: ConfigDiagnosticCode;
  readonly stage: ConfigDiagnosticStage;
  readonly sourceId: string | null;
  readonly message: string;
  readonly issues?: readonly string[];
}

interface ConfigLoadReceipt {
  /** Source IDs actually inspected, in precedence order. */
  readonly checkedSources: readonly string[];
  readonly diagnostics: readonly ConfigDiagnostic[];
}

export interface ConfigLoadSuccess<T> extends ConfigLoadReceipt {
  readonly ok: true;
  readonly value: T;
  readonly sourceId: string;
}

export interface ConfigLoadFailure extends ConfigLoadReceipt {
  readonly ok: false;
  readonly value: null;
  readonly sourceId: string | null;
}

export type ConfigLoadResult<T> = ConfigLoadSuccess<T> | ConfigLoadFailure;

interface NormalizedConfigSource {
  readonly id: string;
  readonly read: ConfigSource['read'];
}

interface NormalizedConfigLoadOptions<T> {
  readonly sources: readonly NormalizedConfigSource[];
  readonly parse: ConfigLoadOptions<T>['parse'];
  readonly validate: ConfigLoadOptions<T>['validate'];
  readonly stageTimeoutMs: number | undefined;
}

interface OwnPropertySnapshot {
  readonly present: boolean;
  readonly value?: unknown;
}

type ValidationSnapshot<T> =
  | { readonly kind: 'success'; readonly value: T }
  | { readonly kind: 'failure'; readonly issues: readonly string[] }
  | { readonly kind: 'invalid'; readonly detail?: string };

function sanitizeDetail(error: unknown): string {
  let detail = 'Unknown adapter error';
  try {
    if (typeof error === 'string' && error.length > 0) {
      detail = error;
    } else if ((typeof error === 'object' && error !== null) || typeof error === 'function') {
      const message = Reflect.get(error, 'message');
      if (typeof message === 'string' && message.length > 0) {
        detail = message;
      }
    }
  } catch {
    // Error inspection is best-effort. A hostile message getter must not
    // escape the loader's diagnostic boundary.
  }

  const needsTruncation = detail.length > MAX_DIAGNOSTIC_DETAIL_LENGTH;
  const boundedDetail = needsTruncation ? detail.slice(0, MAX_DIAGNOSTIC_DETAIL_LENGTH) : detail;
  const sanitized = boundedDetail.replace(UNSAFE_DIAGNOSTIC_TEXT, '\uFFFD');
  if (!needsTruncation) return sanitized;

  let bounded = '';
  for (const grapheme of segmentGraphemes(sanitized)) {
    if (bounded.length + grapheme.length > MAX_DIAGNOSTIC_DETAIL_LENGTH - 1) break;
    bounded += grapheme;
  }
  return `${bounded}…`;
}

function readPropertyOnce(target: object, key: PropertyKey, label: string): unknown {
  try {
    return Reflect.get(target, key);
  } catch (error) {
    throw new TypeError(`${label} could not be read: ${sanitizeDetail(error)}`);
  }
}

function snapshotOwnProperty(target: object, key: PropertyKey): OwnPropertySnapshot {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  if (descriptor === undefined) return { present: false };
  if ('value' in descriptor) return { present: true, value: descriptor.value };
  return {
    present: true,
    value: descriptor.get === undefined ? undefined : Reflect.apply(descriptor.get, target, []),
  };
}

function isSafeSingleLineText(value: string, maximumLength: number): boolean {
  return value.length > 0 && value.length <= maximumLength && !UNSAFE_SINGLE_LINE_TEXT.test(value);
}

function normalizeOptions<T>(input: ConfigLoadOptions<T>): NormalizedConfigLoadOptions<T> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Config load options must be an object');
  }

  const options = input as object;
  const precedence = readPropertyOnce(options, 'precedence', 'Config precedence');
  const rawSources = readPropertyOnce(options, 'sources', 'Config sources');
  const parse = readPropertyOnce(options, 'parse', 'Config parse adapter');
  const validate = readPropertyOnce(options, 'validate', 'Config validate adapter');
  const stageTimeoutMs = readPropertyOnce(options, 'stageTimeoutMs', 'Config stage timeout');

  if (precedence !== 'first-listed-wins') {
    throw new RangeError('Config precedence must be explicitly set to "first-listed-wins"');
  }
  if (!Array.isArray(rawSources)) {
    throw new TypeError('Config sources must be an array');
  }
  const sourceLength = readPropertyOnce(rawSources, 'length', 'Config sources length');
  if (
    typeof sourceLength !== 'number'
    || !Number.isSafeInteger(sourceLength)
    || sourceLength < 0
    || sourceLength > MAX_CONFIG_SOURCES
  ) {
    throw new TypeError(
      `Config sources length must be a non-negative safe integer no greater than ${MAX_CONFIG_SOURCES}`,
    );
  }
  if (sourceLength === 0) {
    throw new RangeError('Config loading requires at least one source');
  }
  if (typeof parse !== 'function') {
    throw new TypeError('Config parse adapter must be a function');
  }
  if (typeof validate !== 'function') {
    throw new TypeError('Config validate adapter must be a function');
  }
  if (
    stageTimeoutMs !== undefined &&
    (typeof stageTimeoutMs !== 'number' || !Number.isSafeInteger(stageTimeoutMs) || stageTimeoutMs <= 0 || stageTimeoutMs > MAX_STAGE_TIMEOUT_MS)
  ) {
    throw new RangeError(`Config stage timeout must be a positive integer no greater than ${MAX_STAGE_TIMEOUT_MS}`);
  }

  const sourceIds = new Set<string>();
  const sources: NormalizedConfigSource[] = [];
  for (let index = 0; index < sourceLength; index += 1) {
    let sourceEntry: OwnPropertySnapshot;
    try {
      sourceEntry = snapshotOwnProperty(rawSources, index);
    } catch (error) {
      throw new TypeError(`Config source ${index} could not be inspected: ${sanitizeDetail(error)}`);
    }
    if (!sourceEntry.present) {
      throw new TypeError(`Config sources must be dense; source ${index} is missing`);
    }
    const source = sourceEntry.value;
    if (source === null || typeof source !== 'object' || Array.isArray(source)) {
      throw new TypeError(`Config source ${index} must be an object`);
    }
    const id = readPropertyOnce(source, 'id', `Config source ${index} id`);
    const read = readPropertyOnce(source, 'read', `Config source ${index} read adapter`);
    if (typeof id !== 'string' || id.trim() !== id || !isSafeSingleLineText(id, MAX_SOURCE_ID_LENGTH)) {
      throw new RangeError(
        `Config source ${index} id must be a non-empty, well-formed single-line string of at most ${MAX_SOURCE_ID_LENGTH} characters without surrounding whitespace`,
      );
    }
    if (sourceIds.has(id)) {
      throw new RangeError(`Config source IDs must be unique; duplicate id "${id}"`);
    }
    if (typeof read !== 'function') {
      throw new TypeError(`Config source "${id}" read adapter must be a function`);
    }
    sourceIds.add(id);
    sources.push(Object.freeze({ id, read: read as ConfigSource['read'] }));
  }

  return Object.freeze({
    sources: Object.freeze(sources),
    parse: parse as ConfigLoadOptions<T>['parse'],
    validate: validate as ConfigLoadOptions<T>['validate'],
    stageTimeoutMs: stageTimeoutMs as number | undefined,
  });
}

function awaitStage<T>(
  value: T | Promise<T>,
  timeoutMs: number | undefined,
): Promise<{ readonly value: T } | typeof STAGE_TIMEOUT> {
  return new Promise<{ readonly value: T } | typeof STAGE_TIMEOUT>((resolve, reject) => {
    let settled = false;
    const timeout =
      timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            if (settled) return;
            settled = true;
            resolve(STAGE_TIMEOUT);
          }, timeoutMs);

    const clearStageTimeout = () => {
      if (timeout !== undefined) clearTimeout(timeout);
    };
    const resolveValue = (resolved: T) => {
      if (settled) return;
      settled = true;
      clearStageTimeout();
      // Wrap adapter values so Promise resolution never assimilates a
      // structurally thenable object returned synchronously by an adapter.
      resolve({ value: resolved });
    };
    const rejectValue = (error: unknown) => {
      if (settled) return;
      settled = true;
      clearStageTimeout();
      reject(error);
    };

    if ((typeof value === 'object' && value !== null) || typeof value === 'function') {
      try {
        // Promise.prototype.then performs the native Promise brand check
        // without reading an attacker-owned `then` property. Structural
        // thenables are synchronous values and are rejected by the relevant
        // adapter-result validator instead of entering recursive assimilation.
        Reflect.apply(NATIVE_PROMISE_THEN, value, [resolveValue, rejectValue]);
        return;
      } catch {
        // Not a genuine Promise. Treat it as a synchronous adapter value.
      }
    }

    resolveValue(value as T);
  });
}

function snapshotPlainData<T>(input: T): T {
  const seen = new WeakMap<object, object>();

  function visit(value: unknown): unknown {
    if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'bigint') {
      return value;
    }
    if (typeof value === 'string') {
      if (ILL_FORMED_UTF16.test(value)) {
        throw new TypeError('Config values must contain well-formed UTF-16 strings');
      }
      return value;
    }
    if (typeof value === 'symbol' || typeof value === 'function') {
      throw new TypeError('Config values must contain only plain data');
    }

    const existing = seen.get(value);
    if (existing !== undefined) return existing;

    if (Array.isArray(value)) {
      const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
      if (lengthDescriptor === undefined || !('value' in lengthDescriptor) || !Number.isSafeInteger(lengthDescriptor.value)) {
        throw new TypeError('Config arrays must have a stable length');
      }
      const length = lengthDescriptor.value as number;
      const keys = Reflect.ownKeys(value);
      const indexes: number[] = [];
      for (const key of keys) {
        if (key === 'length') continue;
        if (typeof key !== 'string') {
          throw new TypeError('Config arrays cannot contain symbol properties');
        }
        const index = Number(key);
        if (!Number.isSafeInteger(index) || index < 0 || index >= length || String(index) !== key) {
          throw new TypeError('Config arrays cannot contain non-index properties');
        }
        indexes.push(index);
      }
      if (indexes.length !== length) {
        throw new TypeError('Config arrays must be dense');
      }

      const copy: unknown[] = new Array(length);
      seen.set(value, copy);
      for (const index of indexes) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (descriptor === undefined || !('value' in descriptor)) {
          throw new TypeError('Config arrays must contain stable data properties');
        }
        copy[index] = visit(descriptor.value);
      }
      return Object.freeze(copy);
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Config values must contain only plain objects and arrays');
    }

    const copy = Object.create(prototype) as Record<string, unknown>;
    seen.set(value, copy);
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') {
        throw new TypeError('Config objects cannot contain symbol properties');
      }
      if (ILL_FORMED_UTF16.test(key)) {
        throw new TypeError('Config object keys must be well-formed UTF-16 strings');
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !('value' in descriptor)) {
        throw new TypeError('Config objects must contain only stable data properties');
      }
      Object.defineProperty(copy, key, {
        configurable: true,
        enumerable: descriptor.enumerable,
        value: visit(descriptor.value),
        writable: true,
      });
    }
    return Object.freeze(copy);
  }

  return visit(input) as T;
}

function snapshotValidationIssues(input: unknown): readonly string[] | null {
  if (!Array.isArray(input)) return null;
  const lengthSnapshot = snapshotOwnProperty(input, 'length');
  if (
    !lengthSnapshot.present ||
    typeof lengthSnapshot.value !== 'number' ||
    !Number.isSafeInteger(lengthSnapshot.value) ||
    lengthSnapshot.value < 1 ||
    lengthSnapshot.value > MAX_VALIDATION_ISSUES
  ) {
    return null;
  }

  const issues: string[] = [];
  for (let index = 0; index < lengthSnapshot.value; index += 1) {
    const issueSnapshot = snapshotOwnProperty(input, index);
    if (!issueSnapshot.present) return null;
    const issue = issueSnapshot.value;
    if (typeof issue !== 'string' || issue.trim().length === 0 || !isSafeSingleLineText(issue, MAX_VALIDATION_ISSUE_LENGTH)) {
      return null;
    }
    issues.push(issue);
  }
  return Object.freeze(issues);
}

function inspectValidation<T>(input: unknown): ValidationSnapshot<T> {
  try {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      return { kind: 'invalid' };
    }
    const validSnapshot = snapshotOwnProperty(input, 'valid');
    if (!validSnapshot.present) return { kind: 'invalid' };

    if (validSnapshot.value === true) {
      const valueSnapshot = snapshotOwnProperty(input, 'value');
      if (!valueSnapshot.present) return { kind: 'invalid' };
      try {
        return { kind: 'success', value: snapshotPlainData(valueSnapshot.value) as T };
      } catch (error) {
        return {
          kind: 'invalid',
          detail: `Successful config value could not be snapshotted: ${sanitizeDetail(error)}`,
        };
      }
    }

    if (validSnapshot.value === false) {
      const issuesSnapshot = snapshotOwnProperty(input, 'issues');
      if (!issuesSnapshot.present) return { kind: 'invalid' };
      const issues = snapshotValidationIssues(issuesSnapshot.value);
      return issues === null ? { kind: 'invalid' } : { kind: 'failure', issues };
    }
  } catch (error) {
    return {
      kind: 'invalid',
      detail: `Could not inspect validator result: ${sanitizeDetail(error)}`,
    };
  }

  return { kind: 'invalid' };
}

function freezeDiagnostic(diagnostic: ConfigDiagnostic): ConfigDiagnostic {
  return Object.freeze({
    ...diagnostic,
    ...(diagnostic.issues === undefined ? {} : { issues: Object.freeze([...diagnostic.issues]) }),
  });
}

function failure(checkedSources: readonly string[], diagnostic: ConfigDiagnostic): ConfigLoadFailure {
  return Object.freeze({
    ok: false,
    value: null,
    sourceId: diagnostic.sourceId,
    checkedSources: Object.freeze([...checkedSources]),
    diagnostics: Object.freeze([freezeDiagnostic(diagnostic)]),
  });
}

/**
 * Load the first present configuration source.
 *
 * Missing sources continue down the precedence list. Read, parse, and
 * validation failures are terminal receipts: a malformed high-priority
 * configuration is never hidden by a lower-priority source or a default.
 */
export async function loadConfig<T>(input: ConfigLoadOptions<T>): Promise<ConfigLoadResult<T>> {
  const options = normalizeOptions(input);
  const checkedSources: string[] = [];

  for (const [precedenceIndex, source] of options.sources.entries()) {
    checkedSources.push(source.id);
    const context = Object.freeze({ sourceId: source.id, precedenceIndex });
    let contents: string | undefined;
    try {
      const readResult = await awaitStage(source.read(), options.stageTimeoutMs);
      if (readResult === STAGE_TIMEOUT) {
        return failure(checkedSources, {
          code: 'config-adapter-timeout',
          stage: 'read',
          sourceId: source.id,
          message: `Config read adapter for source "${source.id}" exceeded the ${options.stageTimeoutMs} ms stage timeout`,
        });
      }
      contents = readResult.value;
    } catch (error) {
      return failure(checkedSources, {
        code: 'config-read-failed',
        stage: 'read',
        sourceId: source.id,
        message: `Could not read config source "${source.id}": ${sanitizeDetail(error)}`,
      });
    }

    if (contents === undefined) continue;
    if (typeof contents !== 'string') {
      return failure(checkedSources, {
        code: 'config-read-adapter-invalid',
        stage: 'read',
        sourceId: source.id,
        message: `Config source "${source.id}" returned a non-string value; return undefined only when absent`,
      });
    }

    let candidate: unknown;
    try {
      const parseResult = await awaitStage(options.parse(contents, context), options.stageTimeoutMs);
      if (parseResult === STAGE_TIMEOUT) {
        return failure(checkedSources, {
          code: 'config-adapter-timeout',
          stage: 'parse',
          sourceId: source.id,
          message: `Config parse adapter for source "${source.id}" exceeded the ${options.stageTimeoutMs} ms stage timeout`,
        });
      }
      candidate = parseResult.value;
    } catch (error) {
      return failure(checkedSources, {
        code: 'config-parse-failed',
        stage: 'parse',
        sourceId: source.id,
        message: `Could not parse config source "${source.id}": ${sanitizeDetail(error)}`,
      });
    }

    let validation: ConfigValidation<T>;
    try {
      const validationResult = await awaitStage(options.validate(candidate, context), options.stageTimeoutMs);
      if (validationResult === STAGE_TIMEOUT) {
        return failure(checkedSources, {
          code: 'config-adapter-timeout',
          stage: 'validate',
          sourceId: source.id,
          message: `Config validate adapter for source "${source.id}" exceeded the ${options.stageTimeoutMs} ms stage timeout`,
        });
      }
      validation = validationResult.value;
    } catch (error) {
      return failure(checkedSources, {
        code: 'config-validation-failed',
        stage: 'validate',
        sourceId: source.id,
        message: `Could not validate config source "${source.id}": ${sanitizeDetail(error)}`,
      });
    }

    const validationSnapshot = inspectValidation<T>(validation);
    if (validationSnapshot.kind === 'success') {
      return Object.freeze({
        ok: true,
        value: validationSnapshot.value,
        sourceId: source.id,
        checkedSources: Object.freeze([...checkedSources]),
        diagnostics: Object.freeze([]),
      });
    }
    if (validationSnapshot.kind === 'failure') {
      return failure(checkedSources, {
        code: 'config-validation-failed',
        stage: 'validate',
        sourceId: source.id,
        message: `Config source "${source.id}" failed validation`,
        issues: validationSnapshot.issues,
      });
    }

    return failure(checkedSources, {
      code: 'config-validation-adapter-invalid',
      stage: 'validate',
      sourceId: source.id,
      message:
        validationSnapshot.detail === undefined
          ? `Config validator for source "${source.id}" returned an invalid result`
          : `Config validator for source "${source.id}" returned an invalid result: ${validationSnapshot.detail}`,
    });
  }

  return failure(checkedSources, {
    code: 'config-not-found',
    stage: 'resolve',
    sourceId: null,
    message: `No configuration source returned content after checking ${checkedSources.length} source(s)`,
  });
}
