import {
  captureDenseArray,
  captureObject,
  freezeSnapshot,
  MAX_CAPTURED_ARRAY_LENGTH,
} from './internal.js';
import {
  isParsedUrlSnapshot,
  type LocalUrlInput,
  type ParsedUrl,
  type QueryPair,
  toParsedUrl,
} from './url.js';

export interface HistoryState {
  readonly entries: readonly ParsedUrl[];
  readonly index: number;
}

const HISTORY_SNAPSHOTS = new WeakSet<object>();

function freezeHistory(entries: readonly ParsedUrl[], index: number): HistoryState {
  if (entries.length > MAX_CAPTURED_ARRAY_LENGTH) {
    throw new RangeError(
      `History entries length must not exceed ${MAX_CAPTURED_ARRAY_LENGTH}`,
    );
  }
  const snapshot = freezeSnapshot({
    entries: freezeSnapshot([...entries]),
    index,
  });
  HISTORY_SNAPSHOTS.add(snapshot);
  return snapshot;
}

function snapshotLocation(value: unknown, index: number): ParsedUrl {
  if (isParsedUrlSnapshot(value)) return value;
  const label = `History entry ${index} parsed location`;
  const captured = captureObject(value, label, ['href', 'pathname', 'query', 'hash']);
  const query = captureDenseArray<unknown>(captured.values.query, `${label} query`);
  const queryPairs: QueryPair[] = [];

  for (const [pairIndex, valuePair] of query.values.entries()) {
    const pair = captureDenseArray<unknown>(valuePair, `${label} query pair ${pairIndex}`);
    if (pair.values.length !== 2) {
      throw new TypeError(`${label} query pair ${pairIndex} must contain exactly [key, value]`);
    }
    queryPairs.push(freezeSnapshot([pair.values[0], pair.values[1]]) as QueryPair);
  }

  const canonical = toParsedUrl({
    pathname: captured.values.pathname as string,
    query: queryPairs,
    hash: captured.values.hash as string | null,
  });
  const href = captured.values.href;
  if (
    typeof href !== 'string' ||
    href !== canonical.href ||
    captured.values.pathname !== canonical.pathname ||
    captured.values.hash !== canonical.hash
  ) {
    throw new RangeError(`${label} must be a canonical parsed location`);
  }

  const queryMatches =
    queryPairs.length === canonical.query.length &&
    queryPairs.every(
      ([key, pairValue], pairIndex) =>
        key === canonical.query[pairIndex]?.[0] && pairValue === canonical.query[pairIndex]?.[1],
    );
  if (!queryMatches) {
    throw new RangeError(`${label} must be a canonical parsed location`);
  }

  return canonical;
}

/**
 * Validate and canonicalize an externally supplied history model.
 *
 * This is package-private support for the router and is not exported from the
 * package root.
 */
export function normalizeHistory(state: HistoryState): HistoryState {
  if (state !== null && typeof state === 'object' && HISTORY_SNAPSHOTS.has(state)) {
    return state;
  }
  if (state === null || typeof state !== 'object' || Array.isArray(state)) {
    throw new TypeError('History state must contain an entries array');
  }
  const captured = captureObject(state, 'History state', ['entries', 'index']);
  const capturedEntries = captureDenseArray<unknown>(captured.values.entries, 'History entries');
  if (capturedEntries.values.length === 0) {
    throw new RangeError('History state must contain at least one location');
  }

  const index = captured.values.index;
  if (!Number.isSafeInteger(index) || (index as number) < 0 || (index as number) >= capturedEntries.values.length) {
    throw new RangeError('History index must identify an existing location');
  }

  const entries = capturedEntries.values.map((location, entryIndex) => snapshotLocation(location, entryIndex));
  return freezeHistory(entries, index as number);
}

export function createHistory(initialLocation: LocalUrlInput = '/'): HistoryState {
  return freezeHistory([toParsedUrl(initialLocation)], 0);
}

export function currentLocation(state: HistoryState): ParsedUrl {
  const normalized = normalizeHistory(state);
  const location = normalized.entries[normalized.index];
  if (location === undefined) {
    throw new RangeError('History index must identify an existing location');
  }
  return location;
}

export function pushHistory(state: HistoryState, location: LocalUrlInput): HistoryState {
  const normalized = normalizeHistory(state);
  const retained = normalized.entries.slice(0, normalized.index + 1);
  if (retained.length >= MAX_CAPTURED_ARRAY_LENGTH) {
    throw new RangeError(
      `History entries length must not exceed ${MAX_CAPTURED_ARRAY_LENGTH}`,
    );
  }
  const entries = [...retained, toParsedUrl(location)];
  return freezeHistory(entries, entries.length - 1);
}

export function replaceHistory(state: HistoryState, location: LocalUrlInput): HistoryState {
  const normalized = normalizeHistory(state);
  const entries = [...normalized.entries];
  entries[normalized.index] = toParsedUrl(location);
  return freezeHistory(entries, normalized.index);
}

export function canGoBack(state: HistoryState): boolean {
  return normalizeHistory(state).index > 0;
}

export function canGoForward(state: HistoryState): boolean {
  const normalized = normalizeHistory(state);
  return normalized.index < normalized.entries.length - 1;
}

export function goBack(state: HistoryState): HistoryState {
  const normalized = normalizeHistory(state);
  return normalized.index > 0 ? freezeHistory(normalized.entries, normalized.index - 1) : normalized;
}

export function goForward(state: HistoryState): HistoryState {
  const normalized = normalizeHistory(state);
  return normalized.index < normalized.entries.length - 1 ? freezeHistory(normalized.entries, normalized.index + 1) : normalized;
}
