import { describe, expect, it } from 'vitest';
import { createRouter, type RouterMsg } from '../router.js';

describe('headless router', () => {
  const routeConfig = {
    routes: [
      { id: 'user', pattern: '/users/:id' },
      { id: 'home', pattern: '/' },
      { id: 'admin', pattern: '/users/admin' },
    ],
  } as const;

  it('exposes only init, resolve, and update and defaults to root', () => {
    const router = createRouter(routeConfig);
    const model = router.init();

    expect(Object.keys(router)).toEqual(['init', 'resolve', 'update']);
    expect(router.resolve(model)).toMatchObject({
      status: 'matched',
      match: { route: { id: 'home', pattern: '/' } },
      diagnostic: null,
    });
    expect(Object.isFrozen(router)).toBe(true);
    expect(Object.isFrozen(model)).toBe(true);
  });

  it('processes namespaced navigation, replacement, back, and forward messages', () => {
    const router = createRouter(routeConfig);
    let model = router.init();
    model = router.update({ type: 'router:navigate', location: '/users/alice' }, model);
    expect(router.resolve(model)).toMatchObject({
      status: 'matched',
      match: { route: { id: 'user' }, params: { id: 'alice' } },
    });

    model = router.update({ type: 'router:replace', location: '/users/admin' }, model);
    expect(router.resolve(model)).toMatchObject({
      status: 'matched',
      match: { route: { id: 'admin' } },
    });

    model = router.update({ type: 'router:back' }, model);
    expect(router.resolve(model)).toMatchObject({ match: { route: { id: 'home' } } });
    model = router.update({ type: 'router:forward' }, model);
    expect(router.resolve(model)).toMatchObject({ match: { route: { id: 'admin' } } });
  });

  it('allows a configured initial location and an explicit init override', () => {
    const router = createRouter({ ...routeConfig, initialLocation: '/users/configured' });
    expect(router.resolve(router.init())).toMatchObject({
      match: { params: { id: 'configured' } },
    });
    expect(router.resolve(router.init('/users/override'))).toMatchObject({
      match: { params: { id: 'override' } },
    });
  });

  it('rejects an explicit null configured location instead of silently defaulting to root', () => {
    expect(() => createRouter({ ...routeConfig, initialLocation: null as never })).toThrow(/descriptor/i);
  });

  it('returns an explicit not-found diagnostic without fabricating a view', () => {
    const router = createRouter(routeConfig);
    const model = router.update({ type: 'router:navigate', location: '/missing' }, router.init());
    const resolution = router.resolve(model);

    expect(resolution).toEqual({
      status: 'not-found',
      location: expect.objectContaining({ href: '/missing' }),
      match: null,
      diagnostic: {
        code: 'route-not-found',
        message: 'No route matches "/missing"',
        href: '/missing',
      },
    });
    expect('view' in router).toBe(false);
    expect(Object.isFrozen(resolution)).toBe(true);
    expect(Object.isFrozen(resolution.diagnostic)).toBe(true);
  });

  it('snapshots route configuration at creation', () => {
    const routes = [{ id: 'home', pattern: '/' }];
    const router = createRouter({ routes });
    routes[0]!.id = 'mutated';
    routes.push({ id: 'unexpected', pattern: '/unexpected' });

    expect(router.resolve(router.init()).status).toBe('matched');
    expect(router.resolve(router.init('/unexpected')).status).toBe('not-found');
  });

  it('validates configuration and the configured initial location eagerly', () => {
    expect(() => createRouter({ routes: null as never })).toThrow(/array/i);
    expect(() =>
      createRouter({
        routes: [
          { id: 'one', pattern: '/users/:id' },
          { id: 'two', pattern: '/users/:name' },
        ],
      }),
    ).toThrow(/ambiguous/i);
    expect(() => createRouter({ routes: [], initialLocation: 'relative' })).toThrow(/local/i);
  });

  it('rejects unnamespaced, unknown, malformed, and invalid-target messages', () => {
    const router = createRouter(routeConfig);
    const model = router.init();

    expect(() => router.update({ type: 'navigate', location: '/' } as never, model)).toThrow(/unknown/i);
    expect(() => router.update({ type: 'router:missing' } as never, model)).toThrow(/unknown/i);
    expect(() => router.update(null as never, model)).toThrow(/message/i);
    expect(() => router.update({ type: 'router:navigate', location: '//authority' }, model)).toThrow(/authority/i);
    expect(() => router.update({ type: 'router:navigate' } as RouterMsg, model)).toThrow(/descriptor/i);
    expect(() => router.update({ type: 'router:back' }, null as never)).toThrow(/model/i);
    expect(() => router.resolve(null as never)).toThrow(/model/i);
  });

  it('canonicalizes the outer wrapper of an accepted forged router model', () => {
    const router = createRouter(routeConfig);
    const forged = { history: router.init().history };
    const normalized = router.update({ type: 'router:back' }, forged);

    expect(normalized).not.toBe(forged);
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(normalized.history).toBe(forged.history);
  });
});
