import { afterEach, describe, expect, it } from 'vitest';
import { installFetchMocks, mockFetch } from '../mocks.js';

const restorers: Array<() => void> = [];

afterEach(() => {
  for (const restore of restorers.splice(0).reverse()) restore();
});

describe('fetch mocks', () => {
  it('reuses stateful regular-expression matchers without leaking lastIndex', () => {
    const matcher = /example\.test/gu;
    const mock = mockFetch(matcher, { json: { ok: true } });

    expect(mock.matches('https://example.test/one')).toBe(true);
    expect(mock.matches('https://example.test/two')).toBe(true);
    expect(matcher.lastIndex).toBe(0);
  });

  it('fails closed for unmatched requests by default', async () => {
    restorers.push(installFetchMocks([mockFetch('https://example.test/matched', { body: 'ok' })]));

    await expect(fetch('https://example.test/unmatched')).rejects.toThrow(/No fetch mock matched/);
  });

  it('supports nested installations and out-of-order cleanup', async () => {
    const originalFetch = globalThis.fetch;
    const restoreOuter = installFetchMocks([mockFetch('https://example.test/outer', { body: 'outer' })]);
    const restoreInner = installFetchMocks([mockFetch('https://example.test/inner', { body: 'inner' })], true);
    restorers.push(restoreOuter, restoreInner);

    await expect((await fetch('https://example.test/inner')).text()).resolves.toBe('inner');
    await expect((await fetch('https://example.test/outer')).text()).resolves.toBe('outer');

    restoreOuter();
    await expect((await fetch('https://example.test/inner')).text()).resolves.toBe('inner');
    restoreInner();
    expect(globalThis.fetch).toBe(originalFetch);
  });
});
