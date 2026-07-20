import { describe, expect, it } from 'vitest';
import {
  applyWindowCommand,
  constraintUpdate,
  createConstraintModel,
  createDesktopWindow,
  createPresetStore,
  createRatioAnimationModel,
  deserializeLayout,
  getAnimatedRatio,
  type HorizonLayoutState,
  loadPreset,
  ratioAnimationUpdate,
  resolveConstraints,
  savePreset,
  validateLayoutState,
  windowManagerMsgFromChromeEvent,
} from '../index.js';

const content = { kind: 'text' as const, content: 'window' };

function validLayout(): HorizonLayoutState {
  return {
    version: 3,
    splits: [],
    tabs: [],
    floats: [],
    tiles: [],
    workspace: null,
    focus: { focusedPaneId: null },
    constraints: { paneConstraints: {} },
  };
}

describe('numeric boundary hardening', () => {
  it('keeps constraint results finite, non-negative, and budget-balanced', () => {
    const result = resolveConstraints(
      [
        { id: 'a', ratio: Number.NaN, min: Number.POSITIVE_INFINITY, locked: false, collapsed: false, priority: Number.NaN },
        { id: 'b', ratio: -5, max: -1, locked: false, collapsed: false, priority: 0 },
      ],
      Number.POSITIVE_INFINITY,
      Number.NaN,
    );
    expect(result.sizes).toEqual([
      { id: 'a', size: 0 },
      { id: 'b', size: 0 },
    ]);
  });

  it('rejects duplicate and unsafe pane identifiers', () => {
    const duplicate = [
      { id: 'same', ratio: 1, locked: false, collapsed: false, priority: 0 },
      { id: 'same', ratio: 1, locked: false, collapsed: false, priority: 0 },
    ];
    expect(() => resolveConstraints(duplicate, 10, 2)).toThrow(/Duplicate pane id/);
    expect(() => createConstraintModel({ constraints: { constructor: {} } })).toThrow(/Invalid pane id/);
  });

  it('normalizes malformed reducer values without poisoning the model', () => {
    const model = constraintUpdate(
      { type: 'constraint-set', paneId: 'pane', constraint: { minWidth: Number.NaN, preferredRatio: 5, priority: Number.POSITIVE_INFINITY } },
      createConstraintModel(),
    );
    expect(model.constraints.pane?.minWidth).toBe(0);
    expect(model.constraints.pane?.preferredRatio).toBe(1);
    expect(model.constraints.pane?.priority).toBe(0);
  });

  it('clamps ratio animation inputs and outputs', () => {
    const initial = createRatioAnimationModel(Number.NaN);
    const updated = ratioAnimationUpdate({ type: 'set-ratio', ratio: 4 }, initial);
    expect(initial.ratio).toBe(0.5);
    expect(updated.ratio).toBe(1);
    expect(getAnimatedRatio(updated)).toBeGreaterThanOrEqual(0);
    expect(getAnimatedRatio(updated)).toBeLessThanOrEqual(1);
  });
});

describe('window lifecycle hardening', () => {
  it('normalizes geometry and keeps mode flags coherent', () => {
    const window = createDesktopWindow({ id: 'window', content, x: Number.NaN, y: Number.POSITIVE_INFINITY, width: -5, height: Number.NaN, mode: 'hidden' });
    expect(window.frame).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    expect(window.hidden).toBe(true);
    expect(window.minimized).toBe(false);
  });

  it('rejects duplicate creation and synchronizes marked-closed flags', () => {
    const window = createDesktopWindow({ id: 'window', content, x: 0, y: 0, width: 10, height: 4, focused: true });
    expect(applyWindowCommand({ type: 'create', window }, [window]).reason).toBe('window-id-exists');
    const closed = applyWindowCommand({ type: 'close', id: 'window' }, [window], { closePolicy: 'mark-closed' }).windows[0]!;
    expect(closed).toMatchObject({ mode: 'closed', closed: true, focused: false, minimized: false, maximized: false });
  });

  it('parses namespaced window ids while rejecting unknown chrome targets', () => {
    expect(windowManagerMsgFromChromeEvent({ handlerTag: 'window:tool:search:hover:resize:left' })).toEqual({
      type: 'hover-window-chrome',
      id: 'tool:search',
      target: 'resize:left',
    });
    expect(windowManagerMsgFromChromeEvent({ handlerTag: 'window:tool:hover:invented' })).toBeNull();
  });
});

describe('persistence trust boundaries', () => {
  it('rejects non-finite geometry and malformed tile records', () => {
    const state = validLayout();
    expect(validateLayoutState({ ...state, floats: [{ floatId: 'x', x: Number.NaN, y: 0, width: 1, height: 1, minimized: false }] })).toBe(false);
    expect(validateLayoutState({ ...state, tiles: [{ tileId: 'x', direction: 'horizontal', ratio: 0.5, firstId: '', secondId: 'b' }] })).toBe(false);
  });

  it('fails closed on hostile or future migration versions', () => {
    expect(deserializeLayout(JSON.stringify({ data: { ...validLayout(), version: -1e300 } }))).toBeNull();
    expect(deserializeLayout(JSON.stringify({ data: { ...validLayout(), version: 999 } }))).toBeNull();
  });

  it('snapshots preset state and rejects unsafe preset keys', () => {
    const state = validLayout();
    const store = savePreset(createPresetStore(), 'safe', state, undefined, 1);
    state.splits.push({ splitId: 'later', direction: 'horizontal', ratio: 0.5 });
    expect(loadPreset(store, 'safe')?.splits).toEqual([]);
    expect(() => savePreset(store, '__proto__', validLayout())).toThrow(/safe key/);
  });
});
