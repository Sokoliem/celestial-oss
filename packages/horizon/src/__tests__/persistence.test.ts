import { describe, expect, it } from 'vitest';
import type { HorizonLayoutState } from '../persistence.js';
import {
  buildLayoutState,
  CURRENT_LAYOUT_VERSION,
  createLayoutPersistenceConfig,
  createPresetStore,
  deletePreset,
  deserializeLayout,
  deserializePresets,
  extractFloatState,
  extractSplitState,
  extractTabState,
  extractWorkspaceState,
  listPresets,
  loadPreset,
  migrateLayout,
  savePreset,
  serializeLayout,
  serializePresets,
  validateLayoutState,
} from '../persistence.js';
import type { PipModel } from '../pip.js';
import type { WorkspaceModel } from '../workspace.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeValidState(overrides?: Partial<HorizonLayoutState>): HorizonLayoutState {
  return {
    version: CURRENT_LAYOUT_VERSION,
    splits: [],
    tabs: [],
    floats: [],
    tiles: [],
    workspace: null,
    focus: { focusedPaneId: null },
    constraints: { paneConstraints: {} },
    ...overrides,
  };
}

function makePopulatedState(): HorizonLayoutState {
  return {
    version: CURRENT_LAYOUT_VERSION,
    splits: [
      { splitId: 's1', direction: 'horizontal', ratio: 0.5 },
      { splitId: 's2', direction: 'vertical', ratio: 0.3 },
    ],
    tabs: [{ tabbedId: 't1', activeIndex: 0, tabOrder: ['tab-a', 'tab-b'] }],
    floats: [{ floatId: 'f1', x: 10, y: 5, width: 40, height: 20, minimized: false }],
    tiles: [{ tileId: 'tile1', direction: 'horizontal', ratio: 0.5, firstId: 'a', secondId: 'b' }],
    workspace: { activeIndex: 2, overviewMode: true },
    focus: { focusedPaneId: 'pane-main' },
    constraints: {
      paneConstraints: {
        'pane-main': { locked: true, minWidth: 20 },
      },
    },
    paneContent: { 'pane-main': { scrollY: 42 } },
  };
}

// ---------------------------------------------------------------------------
// CURRENT_LAYOUT_VERSION
// ---------------------------------------------------------------------------

describe('CURRENT_LAYOUT_VERSION', () => {
  it('is 4', () => {
    expect(CURRENT_LAYOUT_VERSION).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// serializeLayout
// ---------------------------------------------------------------------------

describe('serializeLayout', () => {
  it('produces valid JSON with version, data, and savedAt', () => {
    const state = makeValidState();
    const json = serializeLayout(state);
    const parsed = JSON.parse(json);

    expect(parsed).toHaveProperty('version', CURRENT_LAYOUT_VERSION);
    expect(parsed).toHaveProperty('data');
    expect(parsed).toHaveProperty('savedAt');
    expect(typeof parsed.savedAt).toBe('number');
  });

  it('wraps the state in a PersistedData envelope', () => {
    const state = makePopulatedState();
    const json = serializeLayout(state);
    const parsed = JSON.parse(json);

    expect(parsed.data).toEqual(state);
    expect(parsed.version).toBe(CURRENT_LAYOUT_VERSION);
  });

  it('preserves all fields through serialization', () => {
    const state = makePopulatedState();
    const json = serializeLayout(state);
    const parsed = JSON.parse(json);

    expect(parsed.data.splits).toEqual(state.splits);
    expect(parsed.data.tabs).toEqual(state.tabs);
    expect(parsed.data.floats).toEqual(state.floats);
    expect(parsed.data.tiles).toEqual(state.tiles);
    expect(parsed.data.workspace).toEqual(state.workspace);
    expect(parsed.data.focus).toEqual(state.focus);
    expect(parsed.data.constraints).toEqual(state.constraints);
    expect(parsed.data.paneContent).toEqual(state.paneContent);
  });
});

// ---------------------------------------------------------------------------
// deserializeLayout
// ---------------------------------------------------------------------------

describe('deserializeLayout', () => {
  it('round-trips a valid state', () => {
    const state = makePopulatedState();
    const json = serializeLayout(state);
    const result = deserializeLayout(json);
    expect(result).toEqual(state);
  });

  it('returns null for corrupted JSON without a fallback', () => {
    const result = deserializeLayout('not-json');
    expect(result).toBeNull();
  });

  it('returns fallback for corrupted JSON when fallback provided', () => {
    const fallback = makeValidState();
    const result = deserializeLayout('not-json', fallback);
    expect(result).toEqual(fallback);
  });

  it('returns fallback for JSON with missing required fields', () => {
    const fallback = makeValidState();
    const json = JSON.stringify({ version: 1, data: { version: 1 }, savedAt: Date.now() });
    const result = deserializeLayout(json, fallback);
    expect(result).toEqual(fallback);
  });

  it('returns fallback for empty string', () => {
    const fallback = makeValidState();
    const result = deserializeLayout('', fallback);
    expect(result).toEqual(fallback);
  });

  it('returns null for valid JSON that fails validation without a fallback', () => {
    const json = JSON.stringify({ version: 1, data: { version: 'bad' }, savedAt: Date.now() });
    const result = deserializeLayout(json);
    expect(result).toBeNull();
  });

  it('applies migration if versions differ', () => {
    const json = JSON.stringify({
      version: 1,
      data: {
        version: 1,
        splits: [],
        tabs: [],
        floats: [{ floatId: 'f1', x: 1, y: 2, width: 3, height: 4, minimized: false }],
        tiles: [],
        workspace: null,
        focus: { focusedPaneId: null },
        constraints: { paneConstraints: {} },
      },
      savedAt: Date.now(),
    });
    const result = deserializeLayout(json);
    expect(result?.version).toBe(CURRENT_LAYOUT_VERSION);
    expect(result?.session?.restorePolicy.restoreFocus).toBe(true);
    expect(result?.floats[0]?.zIndex).toBe(1);
    expect(result?.floats[0]?.mode).toBe('normal');
    expect(result?.floats[0]?.fullscreen).toBe(false);
  });

  it('migrates v2 desktop parity fields through the current schema', () => {
    const json = JSON.stringify({
      version: 2,
      data: {
        version: 2,
        splits: [],
        tabs: [],
        floats: [{ floatId: 'f1', x: 1, y: 2, width: 3, height: 4, minimized: true, zIndex: 1 }],
        tiles: [],
        workspace: { activeIndex: 0, overviewMode: false },
        focus: { focusedPaneId: null },
        constraints: { paneConstraints: {} },
      },
      savedAt: Date.now(),
    });

    const result = deserializeLayout(json);
    expect(result?.version).toBe(CURRENT_LAYOUT_VERSION);
    expect(result?.floats[0]?.mode).toBe('minimized');
    expect(result?.floats[0]?.restoreMode).toBe('normal');
    expect(result?.workspace?.activeWorkspaceId).toBe('0');
  });
});

// ---------------------------------------------------------------------------
// validateLayoutState
// ---------------------------------------------------------------------------

describe('validateLayoutState', () => {
  it('validates a minimal valid state', () => {
    expect(validateLayoutState(makeValidState())).toBe(true);
  });

  it('validates a populated state', () => {
    expect(validateLayoutState(makePopulatedState())).toBe(true);
  });

  it('rejects null', () => {
    expect(validateLayoutState(null)).toBe(false);
  });

  it('rejects undefined', () => {
    expect(validateLayoutState(undefined)).toBe(false);
  });

  it('rejects non-object', () => {
    expect(validateLayoutState('string')).toBe(false);
    expect(validateLayoutState(42)).toBe(false);
  });

  it('rejects missing version', () => {
    const state = { ...makeValidState() } as Record<string, unknown>;
    delete state.version;
    expect(validateLayoutState(state)).toBe(false);
  });

  it('rejects non-number version', () => {
    expect(validateLayoutState({ ...makeValidState(), version: 'bad' })).toBe(false);
  });

  it('rejects missing splits', () => {
    const state = { ...makeValidState() } as Record<string, unknown>;
    delete state.splits;
    expect(validateLayoutState(state)).toBe(false);
  });

  it('rejects non-array splits', () => {
    expect(validateLayoutState({ ...makeValidState(), splits: 'bad' })).toBe(false);
  });

  it('rejects missing tabs', () => {
    const state = { ...makeValidState() } as Record<string, unknown>;
    delete state.tabs;
    expect(validateLayoutState(state)).toBe(false);
  });

  it('rejects non-array tabs', () => {
    expect(validateLayoutState({ ...makeValidState(), tabs: {} })).toBe(false);
  });

  it('rejects missing floats', () => {
    const state = { ...makeValidState() } as Record<string, unknown>;
    delete state.floats;
    expect(validateLayoutState(state)).toBe(false);
  });

  it('rejects non-array floats', () => {
    expect(validateLayoutState({ ...makeValidState(), floats: null })).toBe(false);
  });

  it('rejects missing tiles', () => {
    const state = { ...makeValidState() } as Record<string, unknown>;
    delete state.tiles;
    expect(validateLayoutState(state)).toBe(false);
  });

  it('rejects non-array tiles', () => {
    expect(validateLayoutState({ ...makeValidState(), tiles: 123 })).toBe(false);
  });

  // --- Split validation ---
  it('rejects split with missing splitId', () => {
    expect(
      validateLayoutState({
        ...makeValidState(),
        splits: [{ direction: 'horizontal', ratio: 0.5 }],
      }),
    ).toBe(false);
  });

  it('rejects split with non-string splitId', () => {
    expect(
      validateLayoutState({
        ...makeValidState(),
        splits: [{ splitId: 123, direction: 'horizontal', ratio: 0.5 }],
      }),
    ).toBe(false);
  });

  it('rejects split with invalid direction', () => {
    expect(
      validateLayoutState({
        ...makeValidState(),
        splits: [{ splitId: 's1', direction: 'diagonal', ratio: 0.5 }],
      }),
    ).toBe(false);
  });

  it('rejects split with ratio out of range (negative)', () => {
    expect(
      validateLayoutState({
        ...makeValidState(),
        splits: [{ splitId: 's1', direction: 'horizontal', ratio: -0.1 }],
      }),
    ).toBe(false);
  });

  it('rejects split with ratio out of range (>1)', () => {
    expect(
      validateLayoutState({
        ...makeValidState(),
        splits: [{ splitId: 's1', direction: 'horizontal', ratio: 1.5 }],
      }),
    ).toBe(false);
  });

  it('accepts split with ratio exactly 0', () => {
    expect(
      validateLayoutState({
        ...makeValidState(),
        splits: [{ splitId: 's1', direction: 'horizontal', ratio: 0 }],
      }),
    ).toBe(true);
  });

  it('accepts split with ratio exactly 1', () => {
    expect(
      validateLayoutState({
        ...makeValidState(),
        splits: [{ splitId: 's1', direction: 'vertical', ratio: 1 }],
      }),
    ).toBe(true);
  });

  // --- Tab validation ---
  it('rejects tab group with missing tabbedId', () => {
    expect(
      validateLayoutState({
        ...makeValidState(),
        tabs: [{ activeIndex: 0, tabOrder: [] }],
      }),
    ).toBe(false);
  });

  it('rejects tab group with non-string tabbedId', () => {
    expect(
      validateLayoutState({
        ...makeValidState(),
        tabs: [{ tabbedId: 42, activeIndex: 0, tabOrder: [] }],
      }),
    ).toBe(false);
  });

  it('rejects tab group with non-number activeIndex', () => {
    expect(
      validateLayoutState({
        ...makeValidState(),
        tabs: [{ tabbedId: 't1', activeIndex: 'zero', tabOrder: [] }],
      }),
    ).toBe(false);
  });

  it('rejects tab group with non-array tabOrder', () => {
    expect(
      validateLayoutState({
        ...makeValidState(),
        tabs: [{ tabbedId: 't1', activeIndex: 0, tabOrder: 'bad' }],
      }),
    ).toBe(false);
  });

  // --- Float validation ---
  it('rejects float with missing floatId', () => {
    expect(
      validateLayoutState({
        ...makeValidState(),
        floats: [{ x: 0, y: 0, width: 10, height: 10, minimized: false }],
      }),
    ).toBe(false);
  });

  it('rejects float with non-string floatId', () => {
    expect(
      validateLayoutState({
        ...makeValidState(),
        floats: [{ floatId: 99, x: 0, y: 0, width: 10, height: 10, minimized: false }],
      }),
    ).toBe(false);
  });

  it('rejects float with non-numeric x', () => {
    expect(
      validateLayoutState({
        ...makeValidState(),
        floats: [{ floatId: 'f1', x: 'bad', y: 0, width: 10, height: 10, minimized: false }],
      }),
    ).toBe(false);
  });

  it('rejects float with non-numeric y', () => {
    expect(
      validateLayoutState({
        ...makeValidState(),
        floats: [{ floatId: 'f1', x: 0, y: null, width: 10, height: 10, minimized: false }],
      }),
    ).toBe(false);
  });

  it('rejects float with non-numeric width', () => {
    expect(
      validateLayoutState({
        ...makeValidState(),
        floats: [{ floatId: 'f1', x: 0, y: 0, width: 'wide', height: 10, minimized: false }],
      }),
    ).toBe(false);
  });

  it('rejects float with non-numeric height', () => {
    expect(
      validateLayoutState({
        ...makeValidState(),
        floats: [{ floatId: 'f1', x: 0, y: 0, width: 10, height: undefined, minimized: false }],
      }),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// migrateLayout
// ---------------------------------------------------------------------------

describe('migrateLayout', () => {
  it('returns state unchanged when from and to are the same', () => {
    const state = makeValidState();
    const result = migrateLayout(state, 1, 1);
    expect(result).toEqual(state);
  });

  it('returns state unchanged when from > to (downgrade not supported)', () => {
    const state = makeValidState();
    const result = migrateLayout(state, 2, 1);
    expect(result).toEqual(state);
  });

  it('infrastructure supports sequential version upgrades', () => {
    // Currently no migrations exist, but the function should still work
    const state = makeValidState();
    const result = migrateLayout(state, 0, 1);
    // No migration for v0->v1 registered, state returned as-is with version updated
    expect(result.version).toBe(1);
  });

  it('adds an honest restore mode when upgrading v3 window layouts', () => {
    const state = makeValidState({
      version: 3,
      floats: [
        { floatId: 'suspended', x: 1, y: 1, width: 20, height: 8, minimized: true, mode: 'minimized' },
        { floatId: 'maximized', x: 0, y: 0, width: 80, height: 24, minimized: false, mode: 'maximized' },
      ],
    });
    const result = migrateLayout(state, 3, CURRENT_LAYOUT_VERSION);

    expect(result.floats[0]?.restoreMode).toBe('normal');
    expect(result.floats[1]?.restoreMode).toBe('maximized');
  });
});

// ---------------------------------------------------------------------------
// Preset store
// ---------------------------------------------------------------------------

describe('createPresetStore', () => {
  it('creates an empty store', () => {
    const store = createPresetStore();
    expect(store.presets).toEqual({});
  });
});

describe('savePreset', () => {
  it('saves a preset with name and state', () => {
    const store = createPresetStore();
    const state = makePopulatedState();
    const updated = savePreset(store, 'my-layout', state);

    expect(updated.presets['my-layout']).toBeDefined();
    expect(updated.presets['my-layout']!.name).toBe('my-layout');
    expect(updated.presets['my-layout']!.state).toEqual(state);
    expect(typeof updated.presets['my-layout']!.createdAt).toBe('number');
  });

  it('saves a preset with optional description', () => {
    const store = createPresetStore();
    const state = makeValidState();
    const updated = savePreset(store, 'named', state, 'My favorite layout');

    expect(updated.presets['named']!.description).toBe('My favorite layout');
  });

  it('overwrites an existing preset with same name', () => {
    let store = createPresetStore();
    const state1 = makeValidState();
    const state2 = makePopulatedState();

    store = savePreset(store, 'layout', state1);
    store = savePreset(store, 'layout', state2);

    expect(store.presets['layout']!.state).toEqual(state2);
  });

  it('does not mutate original store', () => {
    const store = createPresetStore();
    const state = makeValidState();
    const updated = savePreset(store, 'test', state);

    expect(store.presets).toEqual({});
    expect(updated.presets['test']).toBeDefined();
  });
});

describe('loadPreset', () => {
  it('loads a saved preset', () => {
    const state = makePopulatedState();
    let store = createPresetStore();
    store = savePreset(store, 'saved', state);

    const loaded = loadPreset(store, 'saved');
    expect(loaded).toEqual(state);
  });

  it('returns null for missing preset', () => {
    const store = createPresetStore();
    expect(loadPreset(store, 'nonexistent')).toBeNull();
  });
});

describe('deletePreset', () => {
  it('removes a preset by name', () => {
    const state = makeValidState();
    let store = createPresetStore();
    store = savePreset(store, 'to-delete', state);
    store = deletePreset(store, 'to-delete');

    expect(store.presets['to-delete']).toBeUndefined();
  });

  it('returns store unchanged when deleting nonexistent preset', () => {
    const store = createPresetStore();
    const result = deletePreset(store, 'nope');
    expect(result.presets).toEqual({});
  });

  it('does not mutate original store', () => {
    const state = makeValidState();
    let store = createPresetStore();
    store = savePreset(store, 'keep', state);
    const original = store;
    const deleted = deletePreset(store, 'keep');

    expect(original.presets['keep']).toBeDefined();
    expect(deleted.presets['keep']).toBeUndefined();
  });
});

describe('listPresets', () => {
  it('returns empty array for empty store', () => {
    expect(listPresets(createPresetStore())).toEqual([]);
  });

  it('returns all preset names', () => {
    const state = makeValidState();
    let store = createPresetStore();
    store = savePreset(store, 'alpha', state);
    store = savePreset(store, 'beta', state);
    store = savePreset(store, 'gamma', state);

    const names = listPresets(store);
    expect(names).toHaveLength(3);
    expect(names).toContain('alpha');
    expect(names).toContain('beta');
    expect(names).toContain('gamma');
  });
});

describe('serializePresets / deserializePresets', () => {
  it('round-trips a preset store', () => {
    const state = makePopulatedState();
    let store = createPresetStore();
    store = savePreset(store, 'layout-a', state, 'Description A');
    store = savePreset(store, 'layout-b', makeValidState());

    const json = serializePresets(store);
    const restored = deserializePresets(json);

    expect(restored.presets['layout-a']!.name).toBe('layout-a');
    expect(restored.presets['layout-a']!.description).toBe('Description A');
    expect(restored.presets['layout-a']!.state).toEqual(state);
    expect(restored.presets['layout-b']).toBeDefined();
  });

  it('returns empty store for corrupted JSON', () => {
    const result = deserializePresets('not-json!!!');
    expect(result.presets).toEqual({});
  });

  it('returns empty store for empty string', () => {
    const result = deserializePresets('');
    expect(result.presets).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// State extraction helpers
// ---------------------------------------------------------------------------

describe('extractSplitState', () => {
  it('maps splits to SerializedSplit array', () => {
    const input = [
      { id: 's1', direction: 'horizontal' as const, ratio: 0.5 },
      { id: 's2', direction: 'vertical' as const, ratio: 0.3 },
    ];
    const result = extractSplitState(input);

    expect(result).toEqual([
      { splitId: 's1', direction: 'horizontal', ratio: 0.5 },
      { splitId: 's2', direction: 'vertical', ratio: 0.3 },
    ]);
  });

  it('returns empty array for empty input', () => {
    expect(extractSplitState([])).toEqual([]);
  });
});

describe('extractTabState', () => {
  it('maps tabs to SerializedTabs array', () => {
    const input = [{ id: 't1', activeIndex: 2, tabIds: ['a', 'b', 'c'] }];
    const result = extractTabState(input);

    expect(result).toEqual([{ tabbedId: 't1', activeIndex: 2, tabOrder: ['a', 'b', 'c'] }]);
  });

  it('returns empty array for empty input', () => {
    expect(extractTabState([])).toEqual([]);
  });
});

describe('extractFloatState', () => {
  it('maps floats with PipModel to SerializedFloat array', () => {
    const pip: PipModel = {
      minimized: true,
      x: 5,
      y: 10,
      width: 30,
      height: 15,
    };
    const input = [{ id: 'f1', model: pip }];
    const result = extractFloatState(input);

    expect(result).toEqual([{ floatId: 'f1', x: 5, y: 10, width: 30, height: 15, minimized: true }]);
  });

  it('returns empty array for empty input', () => {
    expect(extractFloatState([])).toEqual([]);
  });
});

describe('extractWorkspaceState', () => {
  it('extracts workspace model fields', () => {
    const ws: WorkspaceModel<string> = {
      workspaces: ['a', 'b', 'c'],
      activeIndex: 1,
      overviewMode: true,
    };
    const result = extractWorkspaceState(ws);

    expect(result).toEqual({ activeIndex: 1, overviewMode: true });
  });

  it('returns null for null workspace', () => {
    expect(extractWorkspaceState(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildLayoutState
// ---------------------------------------------------------------------------

describe('buildLayoutState', () => {
  it('assembles all pieces into a HorizonLayoutState', () => {
    const pip: PipModel = { minimized: false, x: 0, y: 0, width: 20, height: 10 };
    const ws: WorkspaceModel<string> = {
      workspaces: ['desk1'],
      activeIndex: 0,
      overviewMode: false,
    };

    const result = buildLayoutState({
      splits: [{ id: 's1', direction: 'horizontal', ratio: 0.6 }],
      tabs: [{ id: 't1', activeIndex: 0, tabIds: ['tab1'] }],
      floats: [{ id: 'f1', model: pip }],
      tiles: [{ id: 'tile1', direction: 'vertical', ratio: 0.5, firstId: 'a', secondId: 'b' }],
      workspace: ws,
      focusedPaneId: 'pane-x',
      constraints: { paneConstraints: { 'pane-x': { locked: true } } },
      paneContent: { 'pane-x': { scrollY: 100 } },
    });

    expect(result.version).toBe(CURRENT_LAYOUT_VERSION);
    expect(result.splits).toEqual([{ splitId: 's1', direction: 'horizontal', ratio: 0.6 }]);
    expect(result.tabs).toEqual([{ tabbedId: 't1', activeIndex: 0, tabOrder: ['tab1'] }]);
    expect(result.floats).toEqual([{ floatId: 'f1', x: 0, y: 0, width: 20, height: 10, minimized: false }]);
    expect(result.tiles).toEqual([{ tileId: 'tile1', direction: 'vertical', ratio: 0.5, firstId: 'a', secondId: 'b' }]);
    expect(result.workspace).toEqual({ activeIndex: 0, overviewMode: false });
    expect(result.focus).toEqual({ focusedPaneId: 'pane-x' });
    expect(result.constraints).toEqual({ paneConstraints: { 'pane-x': { locked: true } } });
    expect(result.paneContent).toEqual({ 'pane-x': { scrollY: 100 } });
  });

  it('handles minimal input with defaults', () => {
    const result = buildLayoutState({
      splits: [],
      tabs: [],
      floats: [],
      workspace: null,
      focusedPaneId: null,
    });

    expect(result.version).toBe(CURRENT_LAYOUT_VERSION);
    expect(result.splits).toEqual([]);
    expect(result.tabs).toEqual([]);
    expect(result.floats).toEqual([]);
    expect(result.tiles).toEqual([]);
    expect(result.workspace).toBeNull();
    expect(result.focus).toEqual({ focusedPaneId: null });
    expect(result.constraints).toEqual({ paneConstraints: {} });
    expect(result.paneContent).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// createLayoutPersistenceConfig
// ---------------------------------------------------------------------------

describe('createLayoutPersistenceConfig', () => {
  interface TestModel {
    layout: HorizonLayoutState;
    other: string;
  }

  const testState = makePopulatedState();
  const testModel: TestModel = { layout: testState, other: 'data' };

  it('returns a config with default key', () => {
    const config = createLayoutPersistenceConfig<TestModel>({
      select: (m) => m.layout,
      merge: (layout, fresh) => ({ ...fresh, layout }),
    });

    expect(config.key).toBe('horizon-layout');
    expect(config.version).toBe(CURRENT_LAYOUT_VERSION);
  });

  it('returns a config with custom key', () => {
    const config = createLayoutPersistenceConfig<TestModel>({
      select: (m) => m.layout,
      merge: (layout, fresh) => ({ ...fresh, layout }),
      key: 'my-custom-key',
    });

    expect(config.key).toBe('my-custom-key');
  });

  it('select extracts layout state from model', () => {
    const config = createLayoutPersistenceConfig<TestModel>({
      select: (m) => m.layout,
      merge: (layout, fresh) => ({ ...fresh, layout }),
    });

    const selected = config.select!(testModel);
    expect(selected).toEqual(testState);
  });

  it('merge applies layout state back into fresh model', () => {
    const config = createLayoutPersistenceConfig<TestModel>({
      select: (m) => m.layout,
      merge: (layout, fresh) => ({ ...fresh, layout }),
    });

    const freshModel: TestModel = { layout: makeValidState(), other: 'fresh' };
    const merged = config.merge!(testState, freshModel);

    expect(merged.layout).toEqual(testState);
    expect(merged.other).toBe('fresh');
  });
});
