import { describe, expect, it } from 'vitest';
import { matchRoute } from '../match.js';

describe('deterministic route matching', () => {
  const routes = [
    { id: 'everything', pattern: '/*rest' },
    { id: 'user-files', pattern: '/users/:id/*path' },
    { id: 'user', pattern: '/users/:id' },
    { id: 'admin', pattern: '/users/admin' },
  ] as const;

  it('ranks static, parameter, and terminal catch-all routes independent of declaration order', () => {
    expect(matchRoute(routes, '/users/admin')?.route.id).toBe('admin');
    expect(matchRoute([...routes].reverse(), '/users/admin')?.route.id).toBe('admin');
    expect(matchRoute(routes, '/users/alice')?.route.id).toBe('user');
    expect(matchRoute(routes, '/users/alice/docs/readme')?.route.id).toBe('user-files');
    expect(matchRoute(routes, '/elsewhere')?.route.id).toBe('everything');
  });

  it('extracts decoded params and a named catch-all remainder', () => {
    const match = matchRoute(routes, '/users/alice%20smith/docs/r%C3%A9sum%C3%A9?tab=raw#top');

    expect(match).toMatchObject({
      route: { id: 'user-files', pattern: '/users/:id/*path' },
      params: { id: 'alice smith', path: 'docs/résumé' },
      location: {
        href: '/users/alice%20smith/docs/r%C3%A9sum%C3%A9?tab=raw#top',
      },
    });
    expect(Object.getPrototypeOf(match?.params)).toBeNull();
    expect(Object.isFrozen(match?.params)).toBe(true);
  });

  it('lets a terminal named catch-all match an empty remainder behind an exact prefix', () => {
    const match = matchRoute([{ id: 'files', pattern: '/files/*path' }], '/files');
    expect(match?.params).toEqual({ path: '' });
  });

  it('returns null without fabricating a match', () => {
    expect(matchRoute([{ id: 'settings', pattern: '/settings' }], '/users')).toBeNull();
    expect(matchRoute([], '/')).toBeNull();
  });

  it('snapshots route definitions before exposing the match', () => {
    const route = { id: 'user', pattern: '/users/:id' };
    const definitions = [route];
    const match = matchRoute(definitions, '/users/7');

    route.id = 'mutated';
    route.pattern = '/wrong';
    definitions.push({ id: 'other', pattern: '/other' });
    expect(match?.route).toEqual({ id: 'user', pattern: '/users/:id' });
    expect(Object.isFrozen(match?.route)).toBe(true);
  });

  it.each([
    [[{ id: 'x', pattern: 'relative' }], /local path/i],
    [[{ id: 'x', pattern: '//authority' }], /local path/i],
    [[{ id: 'x', pattern: '/a//b' }], /empty interior/i],
    [[{ id: 'x', pattern: '/a?b' }], /forbidden/i],
    [[{ id: 'x', pattern: '/a#b' }], /forbidden/i],
    [[{ id: 'x', pattern: '/a\\b' }], /forbidden/i],
    [[{ id: 'x', pattern: '/users/:' }], /parameter name/i],
    [[{ id: 'x', pattern: '/users/:9id' }], /parameter name/i],
    [[{ id: 'x', pattern: '/users/:__proto__' }], /prototype/i],
    [[{ id: 'x', pattern: '/users/:id/:id' }], /repeats/i],
    [[{ id: 'x', pattern: '/files/*' }], /parameter name/i],
    [[{ id: 'x', pattern: '/files/*path/edit' }], /terminal/i],
  ] as const)('rejects malformed route config %#', (definitions, expected) => {
    expect(() => matchRoute(definitions, '/')).toThrow(expected);
  });

  it('rejects duplicate IDs and ambiguous duplicate structures', () => {
    expect(() =>
      matchRoute(
        [
          { id: 'same', pattern: '/a' },
          { id: 'same', pattern: '/b' },
        ],
        '/a',
      ),
    ).toThrow(/unique/i);
    expect(() =>
      matchRoute(
        [
          { id: 'by-id', pattern: '/users/:id' },
          { id: 'by-name', pattern: '/users/:name' },
        ],
        '/users/a',
      ),
    ).toThrow(/ambiguous/i);
    expect(() =>
      matchRoute(
        [
          { id: 'one', pattern: '/files/*path' },
          { id: 'two', pattern: '/files/*rest' },
        ],
        '/files/a',
      ),
    ).toThrow(/ambiguous/i);
  });

  it('rejects hostile definition and location values explicitly', () => {
    expect(() => matchRoute(null as never, '/')).toThrow(/array/i);
    expect(() => matchRoute([null] as never, '/')).toThrow(/object/i);
    expect(() => matchRoute([{ id: '', pattern: '/' }], '/')).toThrow(/id/i);
    expect(() => matchRoute([{ id: 'root', pattern: 1 as never }], '/')).toThrow(/string/i);
    expect(() => matchRoute([{ id: 'root', pattern: '/' }], 'https://example.com')).toThrow(/local/i);
  });
});
