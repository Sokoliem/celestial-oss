import { describe, expect, it } from 'vitest';
import { canGoBack, canGoForward, createHistory, currentLocation, goBack, goForward, type HistoryState, pushHistory, replaceHistory } from '../history.js';

describe('immutable non-empty history', () => {
  it('starts at a frozen root location by default', () => {
    const history = createHistory();

    expect(currentLocation(history).href).toBe('/');
    expect(history.index).toBe(0);
    expect(history.entries).toHaveLength(1);
    expect(Object.isFrozen(history)).toBe(true);
    expect(Object.isFrozen(history.entries)).toBe(true);
    expect(Object.isFrozen(currentLocation(history))).toBe(true);
  });

  it('pushes locations and truncates forward history after going back', () => {
    let history = createHistory('/');
    history = pushHistory(history, '/a');
    history = pushHistory(history, '/b');
    history = goBack(history);
    expect(canGoForward(history)).toBe(true);

    history = pushHistory(history, '/c');
    expect(history.entries.map(({ href }) => href)).toEqual(['/', '/a', '/c']);
    expect(currentLocation(history).href).toBe('/c');
    expect(canGoForward(history)).toBe(false);
  });

  it('replaces only the current entry and preserves forward history', () => {
    let history = createHistory('/');
    history = pushHistory(history, '/a');
    history = pushHistory(history, '/b');
    history = goBack(history);
    history = replaceHistory(history, '/a?tab=replaced');

    expect(history.entries.map(({ href }) => href)).toEqual(['/', '/a?tab=replaced', '/b']);
    expect(history.index).toBe(1);
    expect(canGoBack(history)).toBe(true);
    expect(canGoForward(history)).toBe(true);
  });

  it('moves across boundaries without discarding entries', () => {
    let history = pushHistory(createHistory('/'), '/next');
    const atEnd = history;
    expect(goForward(atEnd)).toBe(atEnd);

    history = goBack(history);
    expect(currentLocation(history).href).toBe('/');
    expect(history.entries.map(({ href }) => href)).toEqual(['/', '/next']);
    const atStart = history;
    expect(goBack(atStart)).toBe(atStart);

    history = goForward(history);
    expect(currentLocation(history).href).toBe('/next');
  });

  it('snapshots descriptor query pairs supplied by callers', () => {
    const query: Array<readonly [string, string]> = [['tab', 'one']];
    const history = createHistory({ pathname: '/settings', query });
    query[0] = ['tab', 'mutated'];

    expect(currentLocation(history).href).toBe('/settings?tab=one');
  });

  it('rejects malformed and empty externally forged history states', () => {
    expect(() => currentLocation(null as never)).toThrow(/entries array/i);
    expect(() => currentLocation({ entries: [], index: 0 })).toThrow(/at least one/i);
    expect(() => currentLocation({ entries: [currentLocation(createHistory())], index: -1 })).toThrow(/index/i);
    expect(() => currentLocation({ entries: [currentLocation(createHistory())], index: 1 })).toThrow(/index/i);
    expect(() => currentLocation({ entries: [{ href: 42 } as never], index: 0 })).toThrow(/parsed location/i);
    expect(() =>
      currentLocation({
        entries: [{ href: '/', pathname: '/wrong', query: [], hash: null }],
        index: 0,
      }),
    ).toThrow(/canonical parsed location/i);
  });

  it('canonicalizes accepted forged history snapshots before exposing or retaining them', () => {
    const query: Array<[string, string]> = [['tab', 'one']];
    const location = {
      pathname: '/settings',
      query,
      hash: null,
      href: '/settings?tab=one',
    };
    const forged = { entries: [location], index: 0 } as unknown as HistoryState;

    const exposed = currentLocation(forged);
    const normalized = goBack(forged);

    expect(exposed).not.toBe(location);
    expect(normalized).not.toBe(forged);
    expect(normalized.entries[0]).toEqual(exposed);
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(Object.isFrozen(normalized.entries)).toBe(true);
    expect(Object.isFrozen(exposed)).toBe(true);
    expect(Object.isFrozen(exposed.query)).toBe(true);
    expect(Object.isFrozen(exposed.query[0])).toBe(true);

    query[0]![1] = 'mutated';
    location.pathname = '/mutated';
    expect(exposed.href).toBe('/settings?tab=one');
    expect(exposed.query).toEqual([['tab', 'one']]);
  });

  it('rejects invalid navigation targets instead of retaining a stale location', () => {
    const history = createHistory('/');
    expect(() => pushHistory(history, 'relative')).toThrow(/local/i);
    expect(() => replaceHistory(history, '//authority')).toThrow(/authority/i);
  });

  it('rejects non-safe-integer indices', () => {
    const location = currentLocation(createHistory());
    for (const index of [Number.NaN, Number.POSITIVE_INFINITY, 0.5]) {
      const hostile = { entries: [location], index } as HistoryState;
      expect(() => canGoBack(hostile)).toThrow(/index/i);
      expect(() => canGoForward(hostile)).toThrow(/index/i);
    }
  });
});
