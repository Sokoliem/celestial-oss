/**
 * Horizon Persistence Layer
 *
 * Serialize/restore all layout state, validate and migrate versions,
 * integrate with nebula's PersistenceConfig, and manage named presets.
 * All functions are pure — no side effects.
 */

import type { PaneConstraint } from './constraints.js';
import type { PipModel } from './pip.js';
import type { WindowBounds } from './primitives/geometry.js';
import { DEFAULT_RESTORE_POLICY } from './session.js';
import type { WorkspaceDescriptor, WorkspaceModel } from './workspace.js';

// We define a compatible PersistenceConfig type locally because nebula
// does not export it from its public index.ts barrel. This matches the
// shape in @celestial/core/nebula/src/persistence.ts.
export interface HorizonPersistenceConfig<Model> {
  key: string;
  version: number;
  select?: (model: Model) => unknown;
  merge?: (persisted: unknown, fresh: Model) => Model;
  migrations?: Record<number, (old: unknown) => unknown>;
  storagePath?: string;
}

// ---------------------------------------------------------------------------
// Serializable Types
// ---------------------------------------------------------------------------

export interface SerializedSplit {
  readonly splitId: string;
  readonly direction: 'horizontal' | 'vertical';
  readonly ratio: number;
}

export interface SerializedTabs {
  readonly tabbedId: string;
  readonly activeIndex: number;
  readonly tabOrder: string[];
}

export interface SerializedFloat {
  readonly floatId: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly minimized: boolean;
  readonly zIndex?: number;
  readonly maximized?: boolean;
  readonly fullscreen?: boolean;
  readonly hidden?: boolean;
  readonly closed?: boolean;
  readonly mode?: 'normal' | 'minimized' | 'maximized' | 'fullscreen' | 'hidden' | 'closed';
  readonly workspaceId?: string;
  readonly alwaysOnTop?: boolean;
  readonly modal?: boolean;
  readonly restoreBounds?: WindowBounds;
}

export interface SerializedTile {
  readonly tileId: string;
  readonly direction: 'horizontal' | 'vertical';
  readonly ratio: number;
  readonly firstId: string;
  readonly secondId: string;
}

export interface SerializedWorkspace {
  readonly activeIndex: number;
  readonly overviewMode: boolean;
  readonly activeWorkspaceId?: string;
  readonly workspaces?: readonly WorkspaceDescriptor[];
}

export interface SerializedFocus {
  readonly focusedPaneId: string | null;
}

export interface SerializedConstraints {
  readonly paneConstraints: Record<string, Partial<PaneConstraint>>;
}

export interface SerializedSessionPreview {
  readonly title: string;
  readonly panes: number;
}

export interface SerializedRestorePolicy {
  readonly restoreFocus: boolean;
  readonly restoreWorkspace: boolean;
}

export interface SerializedSessionState {
  readonly previews: Record<string, SerializedSessionPreview>;
  readonly restorePolicy: SerializedRestorePolicy;
}

export const DEFAULT_SESSION_STATE: SerializedSessionState = {
  previews: {},
  restorePolicy: DEFAULT_RESTORE_POLICY,
};

// ---------------------------------------------------------------------------
// HorizonLayoutState
// ---------------------------------------------------------------------------

export interface HorizonLayoutState {
  readonly version: number;
  readonly splits: SerializedSplit[];
  readonly tabs: SerializedTabs[];
  readonly floats: SerializedFloat[];
  readonly tiles: SerializedTile[];
  readonly workspace: SerializedWorkspace | null;
  readonly focus: SerializedFocus;
  readonly constraints: SerializedConstraints;
  readonly paneContent?: Record<string, unknown>;
  readonly session?: SerializedSessionState;
}

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

export const CURRENT_LAYOUT_VERSION = 3;

// ---------------------------------------------------------------------------
// PersistedData envelope (matches nebula's shape)
// ---------------------------------------------------------------------------

interface PersistedDataEnvelope {
  version: number;
  data: unknown;
  savedAt: number;
}

// ---------------------------------------------------------------------------
// Serialize / Deserialize
// ---------------------------------------------------------------------------

/**
 * Serialize a HorizonLayoutState into a JSON string wrapped in a
 * PersistedData envelope (version + timestamp + data).
 */
export function serializeLayout(state: HorizonLayoutState, savedAt?: number): string {
  const envelope: PersistedDataEnvelope = {
    version: state.version,
    data: state,
    savedAt: savedAt ?? Date.now(),
  };
  return JSON.stringify(envelope);
}

/**
 * Deserialize a JSON string back into a HorizonLayoutState.
 * Applies migrations if versions differ. Returns fallback (or null) on failure.
 */
export function deserializeLayout(json: string, fallback?: HorizonLayoutState): HorizonLayoutState | null {
  let envelope: PersistedDataEnvelope;
  try {
    envelope = JSON.parse(json) as PersistedDataEnvelope;
  } catch {
    return fallback ?? null;
  }

  let data = envelope.data as HorizonLayoutState | undefined;
  if (data === undefined || data === null) {
    return fallback ?? null;
  }

  // Apply migrations if version differs
  if (typeof data.version === 'number' && data.version !== CURRENT_LAYOUT_VERSION) {
    data = migrateLayout(data, data.version, CURRENT_LAYOUT_VERSION);
  }

  // Validate the structure
  if (!validateLayoutState(data)) {
    return fallback ?? null;
  }

  return data;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Type guard that validates all required fields of a HorizonLayoutState */
export function validateLayoutState(state: unknown): state is HorizonLayoutState {
  if (state === null || state === undefined || typeof state !== 'object') {
    return false;
  }

  const s = state as Record<string, unknown>;

  // version
  if (typeof s.version !== 'number') return false;

  // splits
  if (!Array.isArray(s.splits)) return false;
  for (const split of s.splits) {
    if (!validateSplit(split)) return false;
  }

  // tabs
  if (!Array.isArray(s.tabs)) return false;
  for (const tab of s.tabs) {
    if (!validateTab(tab)) return false;
  }

  // floats
  if (!Array.isArray(s.floats)) return false;
  for (const float of s.floats) {
    if (!validateFloat(float)) return false;
  }

  // tiles
  if (!Array.isArray(s.tiles)) return false;

  if (s.session !== undefined && !validateSession(s.session)) return false;

  return true;
}

function validateSplit(split: unknown): boolean {
  if (split === null || split === undefined || typeof split !== 'object') return false;
  const s = split as Record<string, unknown>;
  if (typeof s.splitId !== 'string') return false;
  if (s.direction !== 'horizontal' && s.direction !== 'vertical') return false;
  if (typeof s.ratio !== 'number') return false;
  if (s.ratio < 0 || s.ratio > 1) return false;
  return true;
}

function validateTab(tab: unknown): boolean {
  if (tab === null || tab === undefined || typeof tab !== 'object') return false;
  const t = tab as Record<string, unknown>;
  if (typeof t.tabbedId !== 'string') return false;
  if (typeof t.activeIndex !== 'number') return false;
  if (!Array.isArray(t.tabOrder)) return false;
  return true;
}

function validateFloat(float: unknown): boolean {
  if (float === null || float === undefined || typeof float !== 'object') return false;
  const f = float as Record<string, unknown>;
  if (typeof f.floatId !== 'string') return false;
  if (typeof f.x !== 'number') return false;
  if (typeof f.y !== 'number') return false;
  if (typeof f.width !== 'number') return false;
  if (typeof f.height !== 'number') return false;
  if (f.zIndex !== undefined && typeof f.zIndex !== 'number') return false;
  if (f.maximized !== undefined && typeof f.maximized !== 'boolean') return false;
  if (f.fullscreen !== undefined && typeof f.fullscreen !== 'boolean') return false;
  if (f.hidden !== undefined && typeof f.hidden !== 'boolean') return false;
  if (f.closed !== undefined && typeof f.closed !== 'boolean') return false;
  return true;
}

function validateSession(session: unknown): boolean {
  if (session === null || typeof session !== 'object') return false;
  const s = session as Record<string, unknown>;
  if (s.previews === null || typeof s.previews !== 'object') return false;
  if (s.restorePolicy === null || typeof s.restorePolicy !== 'object') return false;
  return true;
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

// Migration registry: version N -> function that transforms state from N-1 to N
const migrations: Record<number, (state: HorizonLayoutState) => HorizonLayoutState> = {
  2: (state) => ({
    ...state,
    floats: Array.isArray(state.floats)
      ? state.floats.map((float, index) => ({
          ...float,
          zIndex: float.zIndex ?? index + 1,
          maximized: float.maximized ?? false,
          restoreBounds: float.restoreBounds,
        }))
      : [],
    session: state.session ?? DEFAULT_SESSION_STATE,
    version: 2,
  }),
  3: (state) => ({
    ...state,
    floats: Array.isArray(state.floats)
      ? state.floats.map((float) => ({
          ...float,
          fullscreen: float.fullscreen ?? false,
          hidden: float.hidden ?? false,
          closed: float.closed ?? false,
          mode: float.mode ?? (float.minimized ? 'minimized' : float.maximized ? 'maximized' : 'normal'),
        }))
      : [],
    workspace: state.workspace
      ? {
          ...state.workspace,
          activeWorkspaceId: state.workspace.activeWorkspaceId ?? String(state.workspace.activeIndex),
          workspaces: state.workspace.workspaces ?? [],
        }
      : state.workspace,
    version: 3,
  }),
};

/**
 * Apply sequential migrations from fromVersion to toVersion.
 * Returns the state with version updated to toVersion.
 */
export function migrateLayout(state: HorizonLayoutState, fromVersion: number, toVersion: number): HorizonLayoutState {
  if (fromVersion >= toVersion) {
    return state;
  }

  let current = state;
  for (let v = fromVersion + 1; v <= toVersion; v++) {
    const migration = migrations[v];
    if (migration) {
      current = migration(current);
    }
  }

  // Ensure the version field reflects the target
  return { ...current, version: toVersion };
}

// ---------------------------------------------------------------------------
// Nebula PersistenceConfig integration
// ---------------------------------------------------------------------------

/**
 * Create a nebula-compatible PersistenceConfig for layout state.
 * The returned config can be used with nebula's serializeForStorage / deserializeFromStorage.
 */
export function createLayoutPersistenceConfig<Model>(opts: {
  select: (model: Model) => HorizonLayoutState;
  merge: (layout: HorizonLayoutState, fresh: Model) => Model;
  key?: string;
}): HorizonPersistenceConfig<Model> {
  return {
    key: opts.key ?? 'horizon-layout',
    version: CURRENT_LAYOUT_VERSION,
    select: opts.select,
    merge: (persisted: unknown, fresh: Model) => {
      // Validate that persisted data is a valid layout state
      if (validateLayoutState(persisted)) {
        return opts.merge(persisted, fresh);
      }
      return fresh;
    },
  };
}

// ---------------------------------------------------------------------------
// Preset Store
// ---------------------------------------------------------------------------

export interface LayoutPreset {
  readonly name: string;
  readonly description?: string;
  readonly state: HorizonLayoutState;
  readonly createdAt: number;
}

export interface PresetStore {
  readonly presets: Record<string, LayoutPreset>;
}

/** Create an empty preset store */
export function createPresetStore(): PresetStore {
  return { presets: {} };
}

/** Save a layout preset (creates or overwrites) */
export function savePreset(store: PresetStore, name: string, state: HorizonLayoutState, description?: string, createdAt?: number): PresetStore {
  const preset: LayoutPreset = {
    name,
    state,
    createdAt: createdAt ?? Date.now(),
    ...(description !== undefined ? { description } : {}),
  };
  return {
    presets: {
      ...store.presets,
      [name]: preset,
    },
  };
}

/** Load a layout preset by name, or null if not found */
export function loadPreset(store: PresetStore, name: string): HorizonLayoutState | null {
  const preset = store.presets[name];
  return preset?.state ?? null;
}

/** Delete a layout preset by name */
export function deletePreset(store: PresetStore, name: string): PresetStore {
  if (store.presets[name] === undefined) {
    return store;
  }
  const next = { ...store.presets };
  delete next[name];
  return { presets: next };
}

/** List all preset names */
export function listPresets(store: PresetStore): string[] {
  return Object.keys(store.presets);
}

/** Serialize a preset store to JSON */
export function serializePresets(store: PresetStore): string {
  return JSON.stringify(store);
}

/** Deserialize a preset store from JSON, returning empty store on failure */
export function deserializePresets(json: string): PresetStore {
  try {
    const parsed = JSON.parse(json) as PresetStore;
    if (parsed && typeof parsed === 'object' && parsed.presets && typeof parsed.presets === 'object') {
      return parsed;
    }
    return createPresetStore();
  } catch {
    return createPresetStore();
  }
}

// ---------------------------------------------------------------------------
// State Extraction Helpers
// ---------------------------------------------------------------------------

/** Extract SerializedSplit array from live split data */
export function extractSplitState(splits: Array<{ id: string; direction: 'horizontal' | 'vertical'; ratio: number }>): SerializedSplit[] {
  return splits.map((s) => ({
    splitId: s.id,
    direction: s.direction,
    ratio: s.ratio,
  }));
}

/** Extract SerializedTabs array from live tab data */
export function extractTabState(tabs: Array<{ id: string; activeIndex: number; tabIds: string[] }>): SerializedTabs[] {
  return tabs.map((t) => ({
    tabbedId: t.id,
    activeIndex: t.activeIndex,
    tabOrder: t.tabIds,
  }));
}

/** Extract SerializedFloat array from live floating window data (PipModel) */
export function extractFloatState(
  floats: Array<{
    id: string;
    model: PipModel & {
      zIndex?: number;
      maximized?: boolean;
      fullscreen?: boolean;
      hidden?: boolean;
      closed?: boolean;
      mode?: SerializedFloat['mode'];
      workspaceId?: string;
      alwaysOnTop?: boolean;
      modal?: boolean;
      restoreBounds?: { x: number; y: number; width: number; height: number };
    };
  }>,
): SerializedFloat[] {
  return floats.map((f) => ({
    floatId: f.id,
    x: f.model.x,
    y: f.model.y,
    width: f.model.width,
    height: f.model.height,
    minimized: f.model.minimized,
    zIndex: f.model.zIndex,
    maximized: f.model.maximized,
    fullscreen: f.model.fullscreen,
    hidden: f.model.hidden,
    closed: f.model.closed,
    mode: f.model.mode,
    workspaceId: f.model.workspaceId,
    alwaysOnTop: f.model.alwaysOnTop,
    modal: f.model.modal,
    restoreBounds: f.model.restoreBounds,
  }));
}

/** Extract SerializedWorkspace from a WorkspaceModel, or null */
export function extractWorkspaceState<M>(ws: WorkspaceModel<M> | null): SerializedWorkspace | null {
  if (ws === null) return null;
  const descriptors: WorkspaceDescriptor[] = [];
  for (const workspace of ws.workspaces) {
    if (isWorkspaceDescriptor(workspace)) {
      descriptors.push(workspace);
    }
  }
  return {
    activeIndex: ws.activeIndex,
    overviewMode: ws.overviewMode,
    ...(descriptors.length > 0
      ? {
          activeWorkspaceId: descriptors[Math.max(0, Math.min(ws.activeIndex, descriptors.length - 1))]?.id,
          workspaces: descriptors,
        }
      : {}),
  };
}

function isWorkspaceDescriptor(value: unknown): value is WorkspaceDescriptor {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as WorkspaceDescriptor).id === 'string' &&
    typeof (value as WorkspaceDescriptor).name === 'string'
  );
}

/** Build a complete HorizonLayoutState from live model data */
export function buildLayoutState(opts: {
  splits: Array<{ id: string; direction: 'horizontal' | 'vertical'; ratio: number }>;
  tabs: Array<{ id: string; activeIndex: number; tabIds: string[] }>;
  floats: Array<{
    id: string;
    model: PipModel & {
      zIndex?: number;
      maximized?: boolean;
      fullscreen?: boolean;
      hidden?: boolean;
      closed?: boolean;
      mode?: SerializedFloat['mode'];
      workspaceId?: string;
      alwaysOnTop?: boolean;
      modal?: boolean;
      restoreBounds?: { x: number; y: number; width: number; height: number };
    };
  }>;
  tiles?: Array<{ id: string; direction: 'horizontal' | 'vertical'; ratio: number; firstId: string; secondId: string }>;
  workspace: WorkspaceModel<unknown> | null;
  focusedPaneId: string | null;
  constraints?: SerializedConstraints;
  paneContent?: Record<string, unknown>;
  session?: SerializedSessionState;
}): HorizonLayoutState {
  const state: HorizonLayoutState = {
    version: CURRENT_LAYOUT_VERSION,
    splits: extractSplitState(opts.splits),
    tabs: extractTabState(opts.tabs),
    floats: extractFloatState(opts.floats),
    tiles: (opts.tiles ?? []).map((t) => ({
      tileId: t.id,
      direction: t.direction,
      ratio: t.ratio,
      firstId: t.firstId,
      secondId: t.secondId,
    })),
    workspace: extractWorkspaceState(opts.workspace),
    focus: { focusedPaneId: opts.focusedPaneId },
    constraints: opts.constraints ?? { paneConstraints: {} },
    session: opts.session ?? DEFAULT_SESSION_STATE,
    ...(opts.paneContent !== undefined ? { paneContent: opts.paneContent } : {}),
  };
  return state;
}
