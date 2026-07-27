import { describe, expect, it } from 'vitest';
import { canDismissScreen, canPopScreen, createScreenStack, currentScreen, type ScreenStackModel, screenStackUpdate } from '../screen-stack.js';

type ScreenId = 'home' | 'detail' | 'settings' | 'confirm';

describe('modal-safe screen stack', () => {
  it('creates a frozen, non-empty snapshot of the root screen', () => {
    const params = { tab: 'overview' };
    const model = createScreenStack<ScreenId>({ id: 'home', params });
    params.tab = 'mutated';

    expect(model).toEqual({
      stack: [{ id: 'home', params: { tab: 'overview' } }],
      lastDismissal: null,
    });
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model.stack)).toBe(true);
    expect(Object.isFrozen(currentScreen(model))).toBe(true);
    expect(Object.isFrozen(currentScreen(model).params)).toBe(true);
    expect(canPopScreen(model)).toBe(false);
    expect(canDismissScreen(model)).toBe(false);
  });

  it('pushes, replaces, and pops non-modal screens without emptying the stack', () => {
    let model = createScreenStack<ScreenId>({ id: 'home' });
    model = screenStackUpdate({ type: 'screen:push', id: 'detail', params: { id: 7 } }, model);
    expect(currentScreen(model)).toEqual({ id: 'detail', params: { id: 7 } });
    expect(canPopScreen(model)).toBe(true);

    model = screenStackUpdate({ type: 'screen:replace', id: 'settings' }, model);
    expect(model.stack).toEqual([{ id: 'home' }, { id: 'settings' }]);
    model = screenStackUpdate({ type: 'screen:pop' }, model);
    expect(model.stack).toEqual([{ id: 'home' }]);
    expect(screenStackUpdate({ type: 'screen:pop' }, model)).toBe(model);
  });

  it('dismisses a modal only through screen:dismiss and records its result', () => {
    let model: ScreenStackModel<ScreenId, boolean> = createScreenStack<ScreenId, boolean>({
      id: 'home',
    });
    model = screenStackUpdate({ type: 'screen:push', id: 'confirm', modal: true }, model);

    expect(canPopScreen(model)).toBe(false);
    expect(canDismissScreen(model)).toBe(true);
    model = screenStackUpdate({ type: 'screen:dismiss', result: true }, model);

    expect(model.stack).toEqual([{ id: 'home' }]);
    expect(model.lastDismissal).toEqual({
      screen: { id: 'confirm', modal: true },
      result: true,
    });
    expect(Object.isFrozen(model.lastDismissal)).toBe(true);
  });

  it.each([
    { type: 'screen:push', id: 'detail' },
    { type: 'screen:replace', id: 'settings' },
    { type: 'screen:pop' },
  ] as const)('rejects modal bypass via $type', (message) => {
    let model = createScreenStack<ScreenId>({ id: 'home' });
    model = screenStackUpdate({ type: 'screen:push', id: 'confirm', modal: true }, model);
    expect(() => screenStackUpdate(message, model)).toThrow(/cannot bypass.*screen:dismiss/i);
    expect(currentScreen(model).id).toBe('confirm');
  });

  it('rejects dismissal without a modal and rejects undismissible modal roots', () => {
    const model = createScreenStack<ScreenId>({ id: 'home' });
    expect(() => screenStackUpdate({ type: 'screen:dismiss' }, model)).toThrow(/requires.*modal/i);
    expect(() => createScreenStack<ScreenId>({ id: 'confirm', modal: true })).toThrow(/root.*modal/i);
    expect(() => screenStackUpdate({ type: 'screen:replace', id: 'confirm', modal: true }, model)).toThrow(/root.*modal/i);
  });

  it('clears an old dismissal receipt on the next successful navigation', () => {
    let model: ScreenStackModel<ScreenId, string> = createScreenStack<ScreenId, string>({
      id: 'home',
    });
    model = screenStackUpdate({ type: 'screen:push', id: 'confirm', modal: true }, model);
    model = screenStackUpdate({ type: 'screen:dismiss', result: 'yes' }, model);
    expect(model.lastDismissal).not.toBeNull();

    model = screenStackUpdate({ type: 'screen:push', id: 'detail' }, model);
    expect(model.lastDismissal).toBeNull();
  });

  it('rejects malformed screen entries and params', () => {
    expect(() => createScreenStack({ id: '' })).toThrow(/screen id/i);
    expect(() => createScreenStack({ id: ' padded ' })).toThrow(/screen id/i);
    expect(() => createScreenStack({ id: 'escape\u001b' })).toThrow(/screen id/i);
    expect(() => createScreenStack({ id: 'home', modal: 'yes' as never })).toThrow(/boolean/i);
    expect(() => createScreenStack({ id: 'home', params: [] as never })).toThrow(/plain record/i);
    expect(() => createScreenStack({ id: 'home', params: Object.create({ inherited: true }) as never })).toThrow(/plain record/i);
    expect(() => {
      const params = Object.create(null) as Record<string, unknown>;
      params.__proto__ = 'pollute';
      createScreenStack({ id: 'home', params });
    }).toThrow(/prototype/i);
  });

  it('rejects malformed messages and externally forged empty models', () => {
    const model = createScreenStack<ScreenId>({ id: 'home' });
    expect(() => screenStackUpdate(null as never, model)).toThrow(/message/i);
    expect(() => screenStackUpdate({ type: 'push', id: 'detail' } as never, model)).toThrow(/unknown/i);
    expect(() => screenStackUpdate({ type: 'screen:unknown' } as never, model)).toThrow(/unknown/i);
    expect(() => currentScreen({ stack: [], lastDismissal: null } as ScreenStackModel<ScreenId>)).toThrow(/at least one/i);
    expect(() => currentScreen(null as never)).toThrow(/stack array/i);
    expect(() =>
      currentScreen({
        stack: [{ id: 'home' }, { id: 'confirm', modal: true }, { id: 'detail' }],
        lastDismissal: null,
      }),
    ).toThrow(/modal.*top/i);
    expect(() =>
      currentScreen({
        stack: [{ id: 'home' }],
        lastDismissal: { screen: { id: 'detail' }, result: undefined },
      }),
    ).toThrow(/receipt.*modal/i);
  });

  it('canonicalizes accepted forged screen models before exposing or retaining them', () => {
    const params = { tab: 'overview' };
    const entry = { id: 'home' as const, params };
    const forged = {
      stack: [entry],
      lastDismissal: null,
    } as ScreenStackModel<ScreenId>;

    const exposed = currentScreen(forged);
    const normalized = screenStackUpdate({ type: 'screen:pop' }, forged);

    expect(exposed).not.toBe(entry);
    expect(normalized).not.toBe(forged);
    expect(normalized.stack[0]).toEqual(exposed);
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(Object.isFrozen(normalized.stack)).toBe(true);
    expect(Object.isFrozen(exposed)).toBe(true);
    expect(Object.isFrozen(exposed.params)).toBe(true);

    params.tab = 'mutated';
    expect(exposed.params).toEqual({ tab: 'overview' });
  });
});
