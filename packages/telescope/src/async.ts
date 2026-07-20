/**
 * Async testing utilities for Telescope.
 *
 * Poll-based waiting with configurable intervals and timeouts.
 */

import type { AccessibilityAnnouncement, FocusEventRecord, QueryResult, TextMatch, WaitOptions } from './types.js';

const DEFAULT_TIMEOUT = 1000;
const DEFAULT_INTERVAL = 50;
const PENDING = Symbol('pending');

interface ResolvedWaitOptions {
  timeout: number;
  interval: number;
  signal?: AbortSignal;
}

function resolveOptions(options?: WaitOptions): ResolvedWaitOptions {
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
  const interval = options?.interval ?? DEFAULT_INTERVAL;
  if (!Number.isFinite(timeout) || timeout < 0) throw new RangeError('Wait timeout must be a non-negative finite number.');
  if (!Number.isFinite(interval) || interval <= 0) throw new RangeError('Wait interval must be a positive finite number.');
  return { timeout: Math.floor(timeout), interval: Math.max(1, Math.floor(interval)), signal: options?.signal };
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error('Wait aborted.', { cause: signal.reason });
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortReason(signal);
}

async function poll<T>(operation: string, attempt: () => T | typeof PENDING, options?: WaitOptions, failureDetail?: () => string): Promise<T> {
  const { timeout, interval, signal } = resolveOptions(options);
  const deadline = performance.now() + timeout;
  let lastError: Error | undefined;

  while (true) {
    assertNotAborted(signal);
    try {
      const result = attempt();
      if (result !== PENDING) return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }

    const remaining = deadline - performance.now();
    if (remaining <= 0) break;
    await sleep(Math.min(interval, remaining), signal);
  }

  const detail = failureDetail?.() ?? (lastError ? ` Last error: ${lastError.message}` : '');
  throw new Error(`${operation} timed out after ${timeout}ms.${detail}`, lastError ? { cause: lastError } : undefined);
}

/**
 * Wait for a callback to not throw. Polls at the given interval.
 * Rejects with the last error on timeout.
 */
export async function waitFor(callback: () => void, options?: WaitOptions): Promise<void> {
  await poll(
    'waitFor',
    () => {
      callback();
      return true;
    },
    options,
  );
}

/**
 * Wait for a predicate to return true.
 * Rejects with a timeout error when the predicate never becomes truthy.
 */
export async function waitForPredicate(predicate: () => boolean, options?: WaitOptions): Promise<void> {
  await poll(
    'waitFor',
    () => {
      if (!predicate()) return PENDING;
      return true;
    },
    options,
    () => ' Last error: Predicate returned false',
  );
}

/**
 * Wait for a text query to succeed (text to appear).
 * Returns the query result when found.
 */
export async function waitForText(queryFn: () => QueryResult, options?: WaitOptions): Promise<QueryResult> {
  return poll('waitForText', queryFn, options);
}

/**
 * Wait for an element to be removed (query returns null).
 * The callback should return the element or null.
 */
export async function waitForElementToBeRemoved(callback: () => QueryResult | null, options?: WaitOptions): Promise<void> {
  let present: QueryResult | null = null;
  await poll(
    'waitForElementToBeRemoved',
    () => {
      present = callback();
      return present === null ? true : PENDING;
    },
    options,
    () => (present ? ` Element is still present with text: '${present.text}'` : ''),
  );
}

export async function waitForAnnouncement(
  getAnnouncements: () => readonly AccessibilityAnnouncement[],
  matcher: TextMatch,
  options?: WaitOptions,
): Promise<AccessibilityAnnouncement> {
  return poll(
    'waitForAnnouncement',
    () => getAnnouncements().find((item) => matchesText(matcher, item.message)) ?? PENDING,
    options,
    () => ` No announcement matched ${formatMatcher(matcher)}.`,
  );
}

export async function waitForFocusChange(
  getFocusEvents: () => readonly FocusEventRecord[],
  matcher: string | RegExp | null,
  options?: WaitOptions,
): Promise<FocusEventRecord> {
  return poll(
    'waitForFocusChange',
    () => getFocusEvents().find((item) => matchesFocusTarget(matcher, item.focusedId)) ?? PENDING,
    options,
    () => ` No focus event matched ${formatFocusMatcher(matcher)}.`,
  );
}

function testPattern(pattern: RegExp, text: string): boolean {
  pattern.lastIndex = 0;
  const result = pattern.test(text);
  pattern.lastIndex = 0;
  return result;
}

function matchesText(matcher: TextMatch, text: string): boolean {
  return typeof matcher === 'string' ? text === matcher : testPattern(matcher, text);
}

function matchesFocusTarget(matcher: string | RegExp | null, focusedId: string | null): boolean {
  if (matcher === null) {
    return focusedId === null;
  }

  if (focusedId === null) {
    return false;
  }

  return typeof matcher === 'string' ? focusedId === matcher : testPattern(matcher, focusedId);
}

function formatMatcher(matcher: TextMatch): string {
  return typeof matcher === 'string' ? `'${matcher}'` : `${matcher}`;
}

function formatFocusMatcher(matcher: string | RegExp | null): string {
  if (matcher === null) return 'focus cleared';
  return typeof matcher === 'string' ? `'${matcher}'` : `${matcher}`;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    assertNotAborted(signal);
    const onAbort = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(signal ? abortReason(signal) : new Error('Wait aborted.'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
