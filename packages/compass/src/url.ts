import {
  assertSafeRecordKey,
  assertWellFormedString,
  captureDenseArray,
  captureObject,
  freezeSnapshot,
  MAX_CAPTURED_ARRAY_LENGTH,
} from './internal.js';

export type QueryPair = readonly [key: string, value: string];

export interface UrlDescriptor {
  readonly pathname: string;
  readonly query?: readonly QueryPair[];
  /** Decoded fragment text without the leading `#`. */
  readonly hash?: string | null;
}

export type LocalUrlInput = string | UrlDescriptor;

export interface ParsedUrl {
  /** Canonically encoded local pathname with one leading slash and no trailing slash. */
  readonly pathname: string;
  /** Decoded, ordered query pairs. Repeated keys remain separate pairs. */
  readonly query: readonly QueryPair[];
  /** Decoded fragment text without the leading `#`, or `null`. */
  readonly hash: string | null;
  /** Canonical encoded local URL. */
  readonly href: string;
}

const PARSED_URL_SNAPSHOTS = new WeakSet<object>();

function freezeParsedUrl(value: ParsedUrl): ParsedUrl {
  freezeSnapshot(value);
  PARSED_URL_SNAPSHOTS.add(value);
  return value;
}

/** Package-private provenance check for immutable history normalization. */
export function isParsedUrlSnapshot(value: unknown): value is ParsedUrl {
  return value !== null && typeof value === 'object' && PARSED_URL_SNAPSHOTS.has(value);
}

function assertSafeKey(value: string, label: string): void {
  assertSafeRecordKey(value, label);
}

function decodeComponent(value: string, label: string): string {
  try {
    const decoded = decodeURIComponent(value);
    assertWellFormedString(decoded, label);
    return decoded;
  } catch (error) {
    if (error instanceof URIError) {
      throw new RangeError(`${label} contains malformed percent encoding`);
    }
    throw error;
  }
}

function encodeComponent(value: string, label: string): string {
  assertWellFormedString(value, label);
  return encodeURIComponent(value);
}

export interface ParsedLocalPathname {
  readonly pathname: string;
  readonly segments: readonly string[];
}

/**
 * Parse a local pathname. This is package-private support for route matching.
 */
export function parseLocalPathname(input: string, label = 'URL pathname', allowDecodedDelimiters = false): ParsedLocalPathname {
  assertWellFormedString(input, label);
  if (!input.startsWith('/')) {
    throw new RangeError(`${label} must be a local path beginning with "/"`);
  }
  if (input.startsWith('//')) {
    throw new RangeError(`${label} must not contain an authority`);
  }
  if (input.includes('\\')) {
    throw new RangeError(`${label} must not contain backslash separators`);
  }
  if (!allowDecodedDelimiters && (input.includes('?') || input.includes('#'))) {
    throw new RangeError(`${label} must not contain query or fragment delimiters`);
  }

  const rawSegments = input.slice(1).split('/');
  if (rawSegments[rawSegments.length - 1] === '') rawSegments.pop();
  if (rawSegments.some((segment) => segment.length === 0)) {
    throw new RangeError(`${label} must not contain empty interior segments`);
  }

  const segments = rawSegments.map((segment, index) => {
    const decoded = decodeComponent(segment, `${label} segment ${index}`);
    if (decoded.length === 0 || decoded.includes('/') || decoded.includes('\\')) {
      throw new RangeError(`${label} segment ${index} must not decode to an empty value or separator`);
    }
    if (decoded === '.' || decoded === '..') {
      throw new RangeError(`${label} must not contain dot segments`);
    }
    return decoded;
  });
  const pathname = segments.length === 0 ? '/' : `/${segments.map((segment) => encodeComponent(segment, label)).join('/')}`;

  return freezeSnapshot({
    pathname,
    segments: freezeSnapshot(segments),
  });
}

function parseQuery(rawQuery: string): readonly QueryPair[] {
  if (rawQuery.length === 0) return freezeSnapshot([]);
  const pairs: QueryPair[] = [];

  let pairStart = 0;
  let index = 0;
  while (pairStart <= rawQuery.length) {
    if (index >= MAX_CAPTURED_ARRAY_LENGTH) {
      throw new RangeError(
        `URL query must not contain more than ${MAX_CAPTURED_ARRAY_LENGTH} pairs`,
      );
    }
    const delimiter = rawQuery.indexOf('&', pairStart);
    const rawPair =
      delimiter < 0 ? rawQuery.slice(pairStart) : rawQuery.slice(pairStart, delimiter);
    if (rawPair.length === 0) {
      throw new RangeError(`URL query pair ${index} must not be empty`);
    }
    const separator = rawPair.indexOf('=');
    const rawKey = separator < 0 ? rawPair : rawPair.slice(0, separator);
    const rawValue = separator < 0 ? '' : rawPair.slice(separator + 1);
    const key = decodeComponent(rawKey, `URL query key ${index}`);
    const value = decodeComponent(rawValue, `URL query value ${index}`);
    assertSafeKey(key, `URL query key ${index}`);
    pairs.push(freezeSnapshot([key, value]) as QueryPair);
    if (delimiter < 0) break;
    pairStart = delimiter + 1;
    index += 1;
  }

  return freezeSnapshot(pairs);
}

function snapshotQuery(query: readonly QueryPair[] | undefined): readonly QueryPair[] {
  if (query === undefined) return freezeSnapshot([]);
  const captured = captureDenseArray<QueryPair>(query, 'URL query');

  return freezeSnapshot(
    captured.values.map((pair, index) => {
      const capturedPair = captureDenseArray<unknown>(pair, `URL query pair ${index}`);
      if (capturedPair.values.length !== 2) {
        throw new TypeError(`URL query pair ${index} must contain exactly [key, value]`);
      }
      const key = capturedPair.values[0];
      const value = capturedPair.values[1];
      assertWellFormedString(key, `URL query key ${index}`);
      assertWellFormedString(value, `URL query value ${index}`);
      assertSafeKey(key, `URL query key ${index}`);
      return freezeSnapshot([key, value]) as QueryPair;
    }),
  );
}

function canonicalHref(pathname: string, query: readonly QueryPair[], hash: string | null): string {
  const search = query
    .map(([key, value], index) => `${encodeComponent(key, `URL query key ${index}`)}=${encodeComponent(value, `URL query value ${index}`)}`)
    .join('&');
  const fragment = hash === null ? '' : `#${encodeComponent(hash, 'URL hash')}`;
  return `${pathname}${search.length > 0 ? `?${search}` : ''}${fragment}`;
}

function fromDescriptor(input: UrlDescriptor): ParsedUrl {
  if (isParsedUrlSnapshot(input)) return input;
  const captured = captureObject(input, 'URL descriptor', ['pathname'], ['query', 'hash']);
  const pathname = captured.values.pathname;
  assertWellFormedString(pathname, 'URL pathname');
  const path = parseLocalPathname(pathname, 'URL pathname', true);
  const query = snapshotQuery(captured.present.has('query') ? (captured.values.query as readonly QueryPair[] | undefined) : undefined);
  const rawHash = captured.present.has('hash') ? captured.values.hash : undefined;
  const hash = rawHash === undefined || rawHash === null || rawHash === '' ? null : rawHash;
  if (hash !== null) assertWellFormedString(hash, 'URL hash');

  return freezeParsedUrl({
    pathname: path.pathname,
    query,
    hash,
    href: canonicalHref(path.pathname, query, hash),
  });
}

/**
 * Parse and canonicalize a local URL.
 */
export function parseUrl(input: string): ParsedUrl {
  assertWellFormedString(input, 'URL');
  const hashIndex = input.indexOf('#');
  const beforeHash = hashIndex < 0 ? input : input.slice(0, hashIndex);
  const rawHash = hashIndex < 0 ? null : input.slice(hashIndex + 1);
  const queryIndex = beforeHash.indexOf('?');
  const rawPathname = queryIndex < 0 ? beforeHash : beforeHash.slice(0, queryIndex);
  const rawQuery = queryIndex < 0 ? '' : beforeHash.slice(queryIndex + 1);
  const path = parseLocalPathname(rawPathname);
  const query = parseQuery(rawQuery);
  const hash = rawHash === null || rawHash === '' ? null : decodeComponent(rawHash, 'URL hash');

  return freezeParsedUrl({
    pathname: path.pathname,
    query,
    hash,
    href: canonicalHref(path.pathname, query, hash),
  });
}

/**
 * Serialize a descriptor, or validate and canonicalize an existing URL.
 */
export function serializeUrl(input: LocalUrlInput): string {
  return typeof input === 'string' ? parseUrl(input).href : fromDescriptor(input).href;
}

/**
 * Snapshot any supported URL input as a parsed location.
 */
export function toParsedUrl(input: LocalUrlInput): ParsedUrl {
  return typeof input === 'string' ? parseUrl(input) : fromDescriptor(input);
}
