import { describe, expect, it } from 'vitest';
import { parseUrl, serializeUrl } from '../url.js';

describe('local URL parsing and serialization', () => {
  it('preserves ordered repeated query pairs and canonicalizes encoding', () => {
    const parsed = parseUrl('/caf%C3%A9/%7euser/?tag=one&tag=two&q=hello%20world#r%C3%A9cent');

    expect(parsed).toEqual({
      pathname: '/caf%C3%A9/~user',
      query: [
        ['tag', 'one'],
        ['tag', 'two'],
        ['q', 'hello world'],
      ],
      hash: 'récent',
      href: '/caf%C3%A9/~user?tag=one&tag=two&q=hello%20world#r%C3%A9cent',
    });
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.query)).toBe(true);
    expect(parsed.query.every(Object.isFrozen)).toBe(true);
  });

  it('serializes descriptor snapshots without object-key reordering', () => {
    const query: Array<readonly [string, string]> = [
      ['z', 'last'],
      ['a', 'first'],
      ['z', 'again'],
    ];
    const descriptor = { pathname: '/search/', query, hash: 'results' };

    expect(serializeUrl(descriptor)).toBe('/search?z=last&a=first&z=again#results');
    query[0] = ['mutated', 'yes'];
    expect(serializeUrl('/search?z=last&a=first&z=again#results')).toBe('/search?z=last&a=first&z=again#results');
  });

  it('round-trips reserved characters through canonical components', () => {
    const href = serializeUrl({
      pathname: '/files/report #1',
      query: [
        ['literal+plus', 'a+b'],
        ['separator', 'a&b=c'],
      ],
      hash: 'part#2',
    });

    expect(href).toBe('/files/report%20%231?literal%2Bplus=a%2Bb&separator=a%26b%3Dc#part%232');
    expect(parseUrl(href)).toMatchObject({
      pathname: '/files/report%20%231',
      query: [
        ['literal+plus', 'a+b'],
        ['separator', 'a&b=c'],
      ],
      hash: 'part#2',
    });
  });

  it.each([
    '',
    'users/alice',
    '//example.com/path',
    '/\\example.com/path',
    '/users//alice',
    '/users///',
    '/users/./alice',
    '/users/../alice',
    '/users/%2e%2e/alice',
    '/users/%2Falice',
    '/users/%5calice',
  ])('rejects non-local or ambiguous pathname %j', (input) => {
    expect(() => parseUrl(input)).toThrow(/local|authority|backslash|empty interior|dot segments|separator/i);
  });

  it.each([
    '/ok/%',
    '/ok/%GG',
    '/ok?x=%',
    '/ok#%',
    '/ok?=value',
    '/ok?a=1&&b=2',
    '/ok?__proto__=pollute',
    '/ok?%63onstructor=pollute',
    '/ok?prototype=pollute',
  ])('rejects malformed encodings, empty pairs, and prototype hazards in %j', (input) => {
    expect(() => parseUrl(input)).toThrow(/percent|empty|prototype/i);
  });

  it.each(['/ok\u0000bad', '/ok?x=line\u000afeed', '/ok#escape\u001b'])('rejects terminal controls in %j', (input) => {
    expect(() => parseUrl(input)).toThrow(/control/i);
  });

  it('rejects malformed descriptor shapes instead of fabricating defaults', () => {
    expect(() => serializeUrl(null as never)).toThrow(/descriptor/i);
    expect(() => serializeUrl({ pathname: 42 } as never)).toThrow(/string/i);
    expect(() => serializeUrl({ pathname: '/', query: {} } as never)).toThrow(/array/i);
    expect(() => serializeUrl({ pathname: '/', query: [['only-key']] } as never)).toThrow(/exactly/i);
    expect(() => serializeUrl({ pathname: '/', query: [[1, 'value']] } as never)).toThrow(/string/i);
  });
});
