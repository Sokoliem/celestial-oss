import { describe, expect, it } from 'vitest';
import {
  createHistory,
  createRouter,
  createScreenStack,
  currentLocation,
  currentScreen,
  goBack,
  type HistoryState,
  matchRoute,
  type ParsedUrl,
  parseUrl,
  pushHistory,
  type RouterModel,
  type ScreenStackModel,
  screenStackUpdate,
  serializeUrl,
} from '../index.js';

function accessor(target: object, key: string, value: unknown, calls: { count: number }): void {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    get() {
      calls.count += 1;
      return value;
    },
  });
}

function thrownMessage(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('Expected action to throw');
}

function customArrayPrototype(): object {
  return Object.create(Array.prototype) as object;
}

interface ProxyGuard {
  blocked: boolean;
  calls: number;
}

function guardedProxy<T extends object>(target: T, guard: ProxyGuard): T {
  const touch = (): void => {
    guard.calls += 1;
    if (guard.blocked) {
      throw new Error('A validated external Proxy was retained');
    }
  };

  return new Proxy(target, {
    get(current, key, receiver) {
      touch();
      return Reflect.get(current, key, receiver);
    },
    getOwnPropertyDescriptor(current, key) {
      touch();
      return Reflect.getOwnPropertyDescriptor(current, key);
    },
    getPrototypeOf(current) {
      touch();
      return Reflect.getPrototypeOf(current);
    },
    isExtensible(current) {
      touch();
      return Reflect.isExtensible(current);
    },
    ownKeys(current) {
      touch();
      return Reflect.ownKeys(current);
    },
  });
}

function frozenNullRecord(values: Record<string, unknown>): Record<string, unknown> {
  return Object.freeze(Object.assign(Object.create(null), values)) as Record<string, unknown>;
}

describe('hostile public-data boundaries', () => {
  it('rejects descriptor accessors without invoking them', () => {
    for (const [key, value] of [
      ['pathname', '/'],
      ['query', []],
      ['hash', null],
    ] as const) {
      const calls = { count: 0 };
      const descriptor: Record<string, unknown> = {
        pathname: '/',
        query: [],
        hash: null,
      };
      accessor(descriptor, key, value, calls);

      expect(() => serializeUrl(descriptor as never)).toThrow(/own data property/i);
      expect(calls.count).toBe(0);
    }
  });

  it('rejects sparse URL queries and pairs while ignoring attacker-owned array methods', () => {
    const sparseQuery = new Array<readonly [string, string]>(2);
    sparseQuery[1] = ['a', 'b'];
    expect(() => serializeUrl({ pathname: '/', query: sparseQuery })).toThrow(/dense.*index 0/i);

    const sparsePair = new Array<string>(2);
    sparsePair[0] = 'a';
    expect(() => serializeUrl({ pathname: '/', query: [sparsePair as never] })).toThrow(/dense.*index 1/i);

    const query: Array<readonly [string, string]> & { map?: unknown } = [['a', 'b']];
    Object.defineProperty(query, 'map', { value: () => ['bypass'] });
    expect(serializeUrl({ pathname: '/', query })).toBe('/?a=b');
    expect(currentLocation(createHistory({ pathname: '/', query })).href).toBe('/?a=b');
  });

  it('rejects impractically large public arrays before walking their indices', () => {
    const hugeQuery = new Array<readonly [string, string]>(100_001);
    expect(() => serializeUrl({ pathname: '/', query: hugeQuery })).toThrow(
      /length must not exceed 100000/i,
    );

    const rawQuery = `/?${'a=b&'.repeat(100_000)}a=b`;
    expect(() => parseUrl(rawQuery)).toThrow(/more than 100000 pairs/i);

    const location = currentLocation(createHistory('/'));
    const fullHistory: HistoryState = {
      entries: Array.from({ length: 100_000 }, () => location),
      index: 99_999,
    };
    expect(() => pushHistory(fullHistory, '/overflow')).toThrow(
      /history entries length must not exceed 100000/i,
    );

    const screen = currentScreen(createScreenStack({ id: 'home' }));
    const fullScreenStack: ScreenStackModel = {
      stack: Array.from({ length: 100_000 }, () => screen),
      lastDismissal: null,
    };
    expect(() =>
      screenStackUpdate({ type: 'screen:push', id: 'overflow' }, fullScreenStack),
    ).toThrow(/screen stack length must not exceed 100000/i);
  });

  it('rejects numeric array accessors without invoking them', () => {
    const queryCalls = { count: 0 };
    const query = new Array<readonly [string, string]>(1);
    accessor(query, '0', ['a', 'b'], queryCalls);
    expect(() => serializeUrl({ pathname: '/', query })).toThrow(/index 0.*own data property/i);
    expect(queryCalls.count).toBe(0);

    const pairCalls = { count: 0 };
    const pair = ['a', 'b'];
    accessor(pair, '0', 'a', pairCalls);
    expect(() => serializeUrl({ pathname: '/', query: [pair as never] })).toThrow(
      /index 0.*own data property/i,
    );
    expect(pairCalls.count).toBe(0);

    const location = currentLocation(createHistory('/safe'));
    const entryCalls = { count: 0 };
    const entries = new Array<ParsedUrl>(1);
    accessor(entries, '0', location, entryCalls);
    expect(() => currentLocation({ entries, index: 0 })).toThrow(/index 0.*own data property/i);
    expect(entryCalls.count).toBe(0);

    const screen = currentScreen(createScreenStack({ id: 'home' }));
    const screenCalls = { count: 0 };
    const stack = new Array<typeof screen>(1);
    accessor(stack, '0', screen, screenCalls);
    expect(() => currentScreen({ stack, lastDismissal: null })).toThrow(
      /index 0.*own data property/i,
    );
    expect(screenCalls.count).toBe(0);
  });

  it('rejects history accessors without invocation and never calls attacker-owned array methods', () => {
    const location = currentLocation(createHistory('/safe'));
    for (const [key, value] of [
      ['entries', [location]],
      ['index', 0],
    ] as const) {
      const calls = { count: 0 };
      const state: Record<string, unknown> = { entries: [location], index: 0 };
      accessor(state, key, value, calls);
      expect(() => goBack(state as unknown as HistoryState)).toThrow(/own data property/i);
      expect(calls.count).toBe(0);
    }

    for (const [key, value] of [
      ['href', '/safe'],
      ['pathname', '/safe'],
      ['query', []],
      ['hash', null],
    ] as const) {
      const calls = { count: 0 };
      const forgedLocation: Record<string, unknown> = {
        href: '/safe',
        pathname: '/safe',
        query: [],
        hash: null,
      };
      accessor(forgedLocation, key, value, calls);
      expect(() =>
        currentLocation({ entries: [forgedLocation as unknown as ParsedUrl], index: 0 }),
      ).toThrow(/own data property/i);
      expect(calls.count).toBe(0);
    }

    const entries: ParsedUrl[] & { entries?: unknown; every?: unknown; some?: unknown } = [location];
    Object.defineProperties(entries, {
      entries: { value: () => [] },
      every: { value: () => false },
      some: { value: () => true },
    });
    const normalized = goBack({ entries, index: 0 });
    expect(normalized.entries).toEqual([location]);
  });

  it('rejects sparse history arrays and canonicalizes all custom array prototypes', () => {
    const location = currentLocation(createHistory('/safe?mode=one'));
    const sparseEntries = new Array<ParsedUrl>(1);
    expect(() => currentLocation({ entries: sparseEntries, index: 0 })).toThrow(/dense.*index 0/i);

    const pair = ['mode', 'one'] as [string, string];
    Object.setPrototypeOf(pair, customArrayPrototype());
    Object.freeze(pair);
    const query = [pair] as Array<readonly [string, string]>;
    Object.setPrototypeOf(query, customArrayPrototype());
    Object.freeze(query);
    const forgedLocation = Object.freeze({
      pathname: '/safe',
      query,
      hash: null,
      href: '/safe?mode=one',
    });
    const entries = [forgedLocation as ParsedUrl];
    Object.setPrototypeOf(entries, customArrayPrototype());
    Object.freeze(entries);

    const normalized = goBack({ entries, index: 0 });
    expect(Object.getPrototypeOf(normalized.entries)).toBe(Array.prototype);
    expect(Object.getPrototypeOf(normalized.entries[0]!.query)).toBe(Array.prototype);
    expect(Object.getPrototypeOf(normalized.entries[0]!.query[0]!)).toBe(Array.prototype);
    expect(normalized.entries[0]).not.toBe(forgedLocation);
    expect(normalized.entries[0]?.href).toBe(location.href);
  });

  it('rejects sparse route definitions and definition accessors without invoking them', () => {
    const sparse = new Array<{ readonly id: string; readonly pattern: string }>(1);
    expect(() => matchRoute(sparse, '/')).toThrow(/dense.*index 0/i);

    for (const [key, value] of [
      ['id', 'home'],
      ['pattern', '/'],
    ] as const) {
      const calls = { count: 0 };
      const route: Record<string, unknown> = { id: 'home', pattern: '/' };
      accessor(route, key, value, calls);
      expect(() => matchRoute([route as never], '/')).toThrow(/own data property/i);
      expect(calls.count).toBe(0);
    }
  });

  it('snapshots route arrays without calling attacker methods and exposes stable route data', () => {
    const routes: Array<{ id: string; pattern: string }> & { map?: unknown } = [{ id: 'home', pattern: '/' }];
    Object.defineProperty(routes, 'map', { value: () => [] });
    const match = matchRoute(routes, '/');
    routes[0]!.id = 'mutated';

    expect(match?.route).toEqual({ id: 'home', pattern: '/' });
    expect(Object.isFrozen(match?.route)).toBe(true);
  });

  it('canonicalizes frozen forged router wrappers with custom prototypes or extra keys', () => {
    const router = createRouter({ routes: [{ id: 'home', pattern: '/' }] });
    const history = router.init().history;
    const customPrototype = Object.freeze({ inherited: true });
    const custom = Object.freeze(Object.assign(Object.create(customPrototype), { history }));
    const extra = Object.freeze({ history, extra: true });

    for (const forged of [custom, extra]) {
      const normalized = router.update({ type: 'router:back' }, forged as RouterModel);
      expect(normalized).not.toBe(forged);
      expect(Object.getPrototypeOf(normalized)).toBe(Object.prototype);
      expect(Reflect.ownKeys(normalized)).toEqual(['history']);
      expect(Object.isFrozen(normalized)).toBe(true);
    }
  });

  it('rebuilds frozen Proxy-backed history and parsed URL graphs', () => {
    const guard: ProxyGuard = { blocked: false, calls: 0 };
    const pair = guardedProxy(Object.freeze(['mode', 'safe'] as const), guard);
    const query = guardedProxy(Object.freeze([pair]), guard);
    const location = guardedProxy(
      Object.freeze({
        href: '/safe?mode=safe',
        pathname: '/safe',
        query,
        hash: null,
      }),
      guard,
    );
    const entries = guardedProxy(Object.freeze([location]), guard);
    const state = guardedProxy(
      Object.freeze({ entries, index: 0 }),
      guard,
    ) as unknown as HistoryState;

    const normalized = goBack(state);
    expect(normalized).not.toBe(state);
    expect(normalized.entries[0]).not.toBe(location);
    expect(normalized.entries[0]?.query).not.toBe(query);
    expect(normalized.entries[0]?.query[0]).not.toBe(pair);
    expect(guard.calls).toBeGreaterThan(0);

    guard.blocked = true;
    expect(() => {
      const exposed = currentLocation(normalized);
      expect(exposed.href).toBe('/safe?mode=safe');
      expect(exposed.query).toEqual([['mode', 'safe']]);
      expect(goBack(normalized)).toBe(normalized);
    }).not.toThrow();
  });

  it('rebuilds frozen Proxy-backed router models', () => {
    const guard: ProxyGuard = { blocked: false, calls: 0 };
    const router = createRouter({ routes: [{ id: 'home', pattern: '/' }] });
    const routerModel = guardedProxy(
      Object.freeze({ history: router.init().history }),
      guard,
    ) as RouterModel;
    const normalizedRouter = router.update({ type: 'router:back' }, routerModel);
    expect(normalizedRouter).not.toBe(routerModel);
    expect(guard.calls).toBeGreaterThan(0);

    guard.blocked = true;
    expect(() => router.resolve(normalizedRouter)).not.toThrow();
  });

  it('rebuilds frozen Proxy-backed screen, stack, entry, and params graphs', () => {
    const guard: ProxyGuard = { blocked: false, calls: 0 };
    const paramItem = guardedProxy(frozenNullRecord({ value: 1 }), guard);
    const paramItems = guardedProxy(Object.freeze([paramItem]), guard);
    const params = guardedProxy(
      frozenNullRecord({ nested: true, items: paramItems }),
      guard,
    );
    const entry = guardedProxy(Object.freeze({ id: 'home', params }), guard);
    const stack = guardedProxy(Object.freeze([entry]), guard);
    const screenModel = guardedProxy(
      Object.freeze({ stack, lastDismissal: null }),
      guard,
    ) as unknown as ScreenStackModel;
    const normalizedScreen = screenStackUpdate({ type: 'screen:pop' }, screenModel);
    expect(normalizedScreen).not.toBe(screenModel);
    expect(guard.calls).toBeGreaterThan(0);

    guard.blocked = true;
    expect(() => currentScreen(normalizedScreen)).not.toThrow();
    expect(currentScreen(normalizedScreen).params).toEqual({
      nested: true,
      items: [{ value: 1 }],
    });
  });

  it('rebuilds frozen Proxy-backed dismissal results', () => {
    const guard: ProxyGuard = { blocked: false, calls: 0 };
    let modalModel = createScreenStack<'home' | 'confirm'>({ id: 'home' });
    modalModel = screenStackUpdate(
      { type: 'screen:push', id: 'confirm', modal: true },
      modalModel,
    );
    const result = guardedProxy(frozenNullRecord({ accepted: true }), guard);
    const dismissed = screenStackUpdate(
      { type: 'screen:dismiss', result },
      modalModel,
    );
    expect(guard.calls).toBeGreaterThan(0);

    guard.blocked = true;
    expect(() =>
      (dismissed.lastDismissal?.result as { readonly accepted: boolean }).accepted,
    ).not.toThrow();
    expect(
      (dismissed.lastDismissal?.result as { readonly accepted: boolean }).accepted,
    ).toBe(true);
  });

  it('rejects router config, model, and message accessors without invoking them', () => {
    for (const [key, value] of [
      ['routes', [{ id: 'home', pattern: '/' }]],
      ['initialLocation', '/'],
    ] as const) {
      const configCalls = { count: 0 };
      const config = { routes: [{ id: 'home', pattern: '/' }] } as Record<string, unknown>;
      accessor(config, key, value, configCalls);
      expect(() => createRouter(config as never)).toThrow(/own data property/i);
      expect(configCalls.count).toBe(0);
    }

    const router = createRouter({ routes: [{ id: 'home', pattern: '/' }] });
    const modelCalls = { count: 0 };
    const model = {} as Record<string, unknown>;
    accessor(model, 'history', router.init().history, modelCalls);
    expect(() => router.resolve(model as unknown as RouterModel)).toThrow(/own data property/i);
    expect(modelCalls.count).toBe(0);

    for (const [key, value] of [
      ['type', 'router:navigate'],
      ['location', '/next'],
    ] as const) {
      const messageCalls = { count: 0 };
      const message: Record<string, unknown> = { type: 'router:navigate', location: '/next' };
      accessor(message, key, value, messageCalls);
      expect(() => router.update(message as never, router.init())).toThrow(/own data property/i);
      expect(messageCalls.count).toBe(0);
    }
  });

  it('sanitizes route and unknown-message diagnostics', () => {
    const routeMessage = thrownMessage(() =>
      matchRoute([{ id: 'bad', pattern: '/bad"\\segment' }], '/'),
    );
    expect(routeMessage).toContain('\\"');
    expect(routeMessage).toContain('\\\\');

    const router = createRouter({ routes: [{ id: 'home', pattern: '/' }] });
    const routerMessage = thrownMessage(() =>
      router.update({ type: 'router:\u001b\u202e\ud800' } as never, router.init()),
    );
    expect(routerMessage).not.toContain('\u001b');
    expect(routerMessage).not.toContain('\u202e');
    expect(routerMessage).not.toContain('\ud800');
    expect(routerMessage).toContain('\\u001b');
    expect(routerMessage.toLowerCase()).toContain('\\u202e');
    expect(routerMessage.toLowerCase()).toContain('\\ud800');

    for (const pattern of ['/bad\u009b', '/bad\udfff']) {
      const patternMessage = thrownMessage(() => matchRoute([{ id: 'bad', pattern }], '/'));
      expect(patternMessage).not.toContain('\u009b');
      expect(patternMessage).not.toContain('\udfff');
    }

    for (const code of [0x2028, 0x2029, 0x202e]) {
      const unsafe = String.fromCharCode(code);
      const patternMessage = thrownMessage(() =>
        matchRoute([{ id: 'bad', pattern: `/bad${unsafe}\\segment` }], '/'),
      );
      expect(patternMessage).not.toContain(unsafe);
      expect(patternMessage.toLowerCase()).toContain(
        `\\u${code.toString(16).padStart(4, '0')}`,
      );
    }

    const diagnosticFormatCodes = [
      0x061c,
      0x200e,
      0x200f,
      0x2028,
      0x2029,
      0x202a,
      0x202b,
      0x202c,
      0x202d,
      0x202e,
      0x2066,
      0x2067,
      0x2068,
      0x2069,
    ];
    for (const code of diagnosticFormatCodes) {
      const unsafe = String.fromCharCode(code);
      const message = thrownMessage(() =>
        router.update({ type: `router:${unsafe}` } as never, router.init()),
      );
      expect(message).not.toContain(unsafe);
      expect(message.toLowerCase()).toContain(`\\u${code.toString(16).padStart(4, '0')}`);
    }
  });

  it('rejects screen entry and model accessors without invoking them', () => {
    for (const [key, value] of [
      ['id', 'home'],
      ['params', { nested: true }],
      ['modal', false],
    ] as const) {
      const calls = { count: 0 };
      const entry: Record<string, unknown> = { id: 'home', params: { nested: true }, modal: false };
      accessor(entry, key, value, calls);
      expect(() => createScreenStack(entry as never)).toThrow(/own data property/i);
      expect(calls.count).toBe(0);
    }

    const root = currentScreen(createScreenStack({ id: 'home' }));
    for (const [key, value] of [
      ['stack', [root]],
      ['lastDismissal', null],
    ] as const) {
      const calls = { count: 0 };
      const model: Record<string, unknown> = { stack: [root], lastDismissal: null };
      accessor(model, key, value, calls);
      expect(() => currentScreen(model as unknown as ScreenStackModel)).toThrow(/own data property/i);
      expect(calls.count).toBe(0);
    }
  });

  it('rejects sparse screen stacks and canonicalizes custom prototypes and extra entry keys', () => {
    const sparseStack = new Array<{ readonly id: string }>(1);
    expect(() =>
      currentScreen({ stack: sparseStack, lastDismissal: null } as ScreenStackModel),
    ).toThrow(/dense.*index 0/i);

    const canonicalEntry = currentScreen(createScreenStack({ id: 'home' }));
    const hostileMethodsStack = [canonicalEntry];
    Object.defineProperties(hostileMethodsStack, {
      map: { value: () => {
        throw new Error('attacker-owned map must not run');
      } },
      some: { value: () => {
        throw new Error('attacker-owned some must not run');
      } },
    });
    expect(
      currentScreen({ stack: hostileMethodsStack, lastDismissal: null }),
    ).toBe(canonicalEntry);

    const customStack = [canonicalEntry];
    Object.setPrototypeOf(customStack, customArrayPrototype());
    Object.freeze(customStack);
    const customModel = Object.freeze({ stack: customStack, lastDismissal: null });
    const normalizedCustom = screenStackUpdate({ type: 'screen:pop' }, customModel);
    expect(normalizedCustom).not.toBe(customModel);
    expect(Object.getPrototypeOf(normalizedCustom.stack)).toBe(Array.prototype);

    const entry = Object.freeze(
      Object.assign(Object.create({ inherited: true }), { id: 'home', extra: true }),
    );
    const forged = Object.freeze({ stack: Object.freeze([entry]), lastDismissal: null });
    const normalized = screenStackUpdate({ type: 'screen:pop' }, forged as ScreenStackModel);

    expect(normalized).not.toBe(forged);
    expect(Object.getPrototypeOf(normalized.stack)).toBe(Array.prototype);
    expect(Reflect.ownKeys(normalized.stack[0]!)).toEqual(['id']);
    expect(Object.getPrototypeOf(normalized.stack[0]!)).toBe(Object.prototype);
  });

  it('deeply detaches and freezes screen params', () => {
    const params = {
      nested: {
        items: [{ id: 1 }],
      },
    };
    const model = createScreenStack({ id: 'home', params });
    const captured = currentScreen(model).params as {
      readonly nested: { readonly items: readonly { readonly id: number }[] };
    };

    params.nested.items[0]!.id = 9;
    params.nested.items.push({ id: 2 });
    expect(captured.nested.items).toEqual([{ id: 1 }]);
    expect(Object.isFrozen(captured)).toBe(true);
    expect(Object.isFrozen(captured.nested)).toBe(true);
    expect(Object.isFrozen(captured.nested.items)).toBe(true);
    expect(Object.isFrozen(captured.nested.items[0])).toBe(true);
    expect(screenStackUpdate({ type: 'screen:pop' }, model)).toBe(model);
  });

  it('rejects nested params and dismissal accessors without invoking them', () => {
    const paramsCalls = { count: 0 };
    const params: Record<string, unknown> = {};
    accessor(params, 'secret', true, paramsCalls);
    expect(() => createScreenStack({ id: 'home', params })).toThrow(/enumerable own data property/i);
    expect(paramsCalls.count).toBe(0);

    let model = createScreenStack<'home' | 'confirm'>({ id: 'home' });
    model = screenStackUpdate({ type: 'screen:push', id: 'confirm', modal: true }, model);
    const resultCalls = { count: 0 };
    const result: Record<string, unknown> = {};
    accessor(result, 'accepted', true, resultCalls);
    expect(() => screenStackUpdate({ type: 'screen:dismiss', result }, model)).toThrow(
      /enumerable own data property/i,
    );
    expect(resultCalls.count).toBe(0);

    const modal = currentScreen(model);
    for (const [key, value] of [
      ['screen', modal],
      ['result', true],
    ] as const) {
      const receiptCalls = { count: 0 };
      const receipt: Record<string, unknown> = { screen: modal, result: true };
      accessor(receipt, key, value, receiptCalls);
      expect(() =>
        currentScreen({
          stack: [model.stack[0]!],
          lastDismissal: receipt as never,
        }),
      ).toThrow(/own data property/i);
      expect(receiptCalls.count).toBe(0);
    }
  });

  it('deeply detaches dismissal results and rejects unsupported or circular data', () => {
    const result = { nested: { accepted: true }, values: [1, 2] };
    let model: ScreenStackModel<'home' | 'confirm', typeof result> = createScreenStack({
      id: 'home',
    });
    model = screenStackUpdate({ type: 'screen:push', id: 'confirm', modal: true }, model);
    model = screenStackUpdate({ type: 'screen:dismiss', result }, model);
    result.nested.accepted = false;
    result.values.push(3);

    expect(model.lastDismissal?.result).toEqual({
      nested: { accepted: true },
      values: [1, 2],
    });
    expect(Object.isFrozen(model.lastDismissal?.result)).toBe(true);
    expect(Object.isFrozen(model.lastDismissal?.result?.nested)).toBe(true);
    expect(Object.isFrozen(model.lastDismissal?.result?.values)).toBe(true);

    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => createScreenStack({ id: 'home', params: circular })).toThrow(/circular/i);
    expect(() => createScreenStack({ id: 'home', params: { date: new Date() } })).toThrow(/plain records/i);
    expect(() => createScreenStack({ id: 'home', params: { token: Symbol('secret') } })).toThrow(
      /immutable plain data/i,
    );
  });

  it('rejects screen message accessors and sanitizes unknown message types', () => {
    let model = createScreenStack<'home' | 'confirm'>({ id: 'home' });
    model = screenStackUpdate({ type: 'screen:push', id: 'confirm', modal: true }, model);
    const calls = { count: 0 };
    const message: Record<string, unknown> = { type: 'screen:dismiss', result: true };
    accessor(message, 'result', true, calls);
    expect(() => screenStackUpdate(message as never, model)).toThrow(/own data property/i);
    expect(calls.count).toBe(0);

    const unknownMessage = thrownMessage(() =>
      screenStackUpdate(
        { type: 'screen:\u009b\u2066\udfff' } as never,
        createScreenStack({ id: 'home' }),
      ),
    );
    expect(unknownMessage).not.toContain('\u009b');
    expect(unknownMessage).not.toContain('\u2066');
    expect(unknownMessage).not.toContain('\udfff');
    expect(unknownMessage).toContain('\\u009b');
    expect(unknownMessage.toLowerCase()).toContain('\\u2066');
    expect(unknownMessage.toLowerCase()).toContain('\\udfff');
  });
});
