/**
 * Async testing utilities for Telescope.
 *
 * Poll-based waiting with configurable intervals and timeouts.
 */

import type { AccessibilityAnnouncement, FocusEventRecord, QueryResult, TextMatch, WaitOptions } from './types.js';

const DEFAULT_TIMEOUT = 1000;
const DEFAULT_INTERVAL = 50;

/**
 * Wait for a callback to not throw. Polls at the given interval.
 * Rejects with the last error on timeout.
 */
export async function waitFor(callback: () => void, options?: WaitOptions): Promise<void> {
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
  const interval = options?.interval ?? DEFAULT_INTERVAL;
  const start = Date.now();
  let lastError: Error | undefined;

  while (Date.now() - start < timeout) {
    try {
      callback();
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
    await sleep(interval);
  }

  // One final attempt
  try {
    callback();
    return;
  } catch (err) {
    lastError = err instanceof Error ? err : new Error(String(err));
  }

  throw new Error(`waitFor timed out after ${timeout}ms. Last error: ${lastError?.message ?? 'unknown'}`);
}

/**
 * Wait for a predicate to return true.
 * Rejects with a timeout error when the predicate never becomes truthy.
 */
export async function waitForPredicate(predicate: () => boolean, options?: WaitOptions): Promise<void> {
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
  const interval = options?.interval ?? DEFAULT_INTERVAL;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    if (predicate()) return;
    await sleep(interval);
  }

  if (predicate()) return;

  throw new Error(`waitFor timed out after ${timeout}ms. Last error: Predicate returned false`);
}

/**
 * Wait for a text query to succeed (text to appear).
 * Returns the query result when found.
 */
export async function waitForText(queryFn: () => QueryResult, options?: WaitOptions): Promise<QueryResult> {
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
  const interval = options?.interval ?? DEFAULT_INTERVAL;
  const start = Date.now();
  let lastError: Error | undefined;

  while (Date.now() - start < timeout) {
    try {
      return queryFn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
    await sleep(interval);
  }

  // One final attempt
  try {
    return queryFn();
  } catch (err) {
    lastError = err instanceof Error ? err : new Error(String(err));
  }

  throw new Error(`waitForText timed out after ${timeout}ms. Last error: ${lastError?.message ?? 'unknown'}`);
}

/**
 * Wait for an element to be removed (query returns null).
 * The callback should return the element or null.
 */
export async function waitForElementToBeRemoved(callback: () => QueryResult | null, options?: WaitOptions): Promise<void> {
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
  const interval = options?.interval ?? DEFAULT_INTERVAL;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const result = callback();
    if (result === null) return;
    await sleep(interval);
  }

  // One final attempt
  const result = callback();
  if (result === null) return;

  throw new Error(`waitForElementToBeRemoved timed out after ${timeout}ms. ` + `Element is still present with text: '${result.text}'`);
}

export async function waitForAnnouncement(
  getAnnouncements: () => readonly AccessibilityAnnouncement[],
  matcher: TextMatch,
  options?: WaitOptions,
): Promise<AccessibilityAnnouncement> {
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
  const interval = options?.interval ?? DEFAULT_INTERVAL;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const match = getAnnouncements().find((item) => matchesText(matcher, item.message));
    if (match) return match;
    await sleep(interval);
  }

  const match = getAnnouncements().find((item) => matchesText(matcher, item.message));
  if (match) return match;

  throw new Error(`waitForAnnouncement timed out after ${timeout}ms. No announcement matched ${formatMatcher(matcher)}.`);
}

export async function waitForFocusChange(
  getFocusEvents: () => readonly FocusEventRecord[],
  matcher: string | RegExp | null,
  options?: WaitOptions,
): Promise<FocusEventRecord> {
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
  const interval = options?.interval ?? DEFAULT_INTERVAL;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const match = getFocusEvents().find((item) => matchesFocusTarget(matcher, item.focusedId));
    if (match) return match;
    await sleep(interval);
  }

  const match = getFocusEvents().find((item) => matchesFocusTarget(matcher, item.focusedId));
  if (match) return match;

  throw new Error(`waitForFocusChange timed out after ${timeout}ms. No focus event matched ${formatFocusMatcher(matcher)}.`);
}

function matchesText(matcher: TextMatch, text: string): boolean {
  return typeof matcher === 'string' ? text === matcher : matcher.test(text);
}

function matchesFocusTarget(matcher: string | RegExp | null, focusedId: string | null): boolean {
  if (matcher === null) {
    return focusedId === null;
  }

  if (focusedId === null) {
    return false;
  }

  return typeof matcher === 'string' ? focusedId === matcher : matcher.test(focusedId);
}

function formatMatcher(matcher: TextMatch): string {
  return typeof matcher === 'string' ? `'${matcher}'` : `${matcher}`;
}

function formatFocusMatcher(matcher: string | RegExp | null): string {
  if (matcher === null) return 'focus cleared';
  return typeof matcher === 'string' ? `'${matcher}'` : `${matcher}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
