/**
 * Horizon Persistence Layer
 *
 * Serialize/restore all layout state, validate and migrate versions,
 * integrate with nebula's PersistenceConfig, and manage named presets.
 * All functions are pure — no side effects.
 */

import type { PaneConstraint } from './constraints.js';
import { isSafeRecordKey, MAX_SPLIT_PANES } from './internal.js';
import type { PipModel } from './pip.js';
import type { WindowBounds } from './primitives/geometry.js';
import { DEFAULT_RESTORE_POLICY } from './session.js';
import type { WindowRestoreMode } from './window-lifecycle.js';
import type { WorkspaceDescriptor, WorkspaceModel } from './workspace.js';

// We define a compatible PersistenceConfig type locally because nebula
// does not export it from its public index.ts barrel. This matches the
// shape in @celestial/core/nebula/src/persistence.ts.
/**
 * Storage is caller-owned — layouts serialize to and from strings and this
 * module never touches the filesystem. (A `storagePath` field used to be
 * declared here and was read by nothing.)
 */
export interface HorizonPersistenceConfig<Model> {
  key: string;
  version: number;
  select?: (model: Model) => unknown;
  merge?: (persisted: unknown, fresh: Model) => Model;
  migrations?: Record<number, (old: unknown) => unknown>;
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
  readonly restoreMode?: WindowRestoreMode;
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

export const CURRENT_LAYOUT_VERSION = 4;

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

  if (!isRecord(envelope) || !Object.hasOwn(envelope, 'data')) {
    return fallback ?? null;
  }
  let data = envelope.data as HorizonLayoutState | undefined;
  if (!isRecord(data) || !Number.isSafeInteger(data.version) || data.version < 1 || data.version > CURRENT_LAYOUT_VERSION) {
    return fallback ?? null;
  }
  if (!hasBoundedLayoutCollections(data)) return fallback ?? null;

  // Apply migrations if version differs
  if (data.version !== CURRENT_LAYOUT_VERSION) {
    try {
      data = migrateLayout(data, data.version, CURRENT_LAYOUT_VERSION);
    } catch {
      return fallback ?? null;
    }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isSafeId(value: unknown): value is string {
  return typeof value === 'string' && isSafeRecordKey(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isBoundedArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length <= MAX_SPLIT_PANES;
}

function hasBoundedLayoutCollections(value: Record<string, unknown>): boolean {
  for (const key of ['splits', 'tabs', 'floats', 'tiles'] as const) {
    const collection = value[key];
    if (collection !== undefined && (!Array.isArray(collection) || collection.length > MAX_SPLIT_PANES)) return false;
  }
  return true;
}

function hasUniqueIds(values: readonly unknown[], getId: (value: unknown) => unknown): boolean {
  const ids = new Set<string>();
  for (const value of values) {
    const id = getId(value);
    if (!isSafeId(id) || ids.has(id)) return false;
    ids.add(id);
  }
  return true;
}

/** Type guard that validates all required fields of a HorizonLayoutState */
export function validateLayoutState(state: unknown): state is HorizonLayoutState {
  if (!isRecord(state)) return false;

  const s = state;

  // version
  if (s.version !== CURRENT_LAYOUT_VERSION) return false;

  // splits
  if (!isBoundedArray(s.splits) || !hasUniqueIds(s.splits, (split) => (isRecord(split) ? split.splitId : undefined))) return false;
  for (const split of s.splits) {
    if (!validateSplit(split)) return false;
  }

  // tabs
  if (!isBoundedArray(s.tabs) || !hasUniqueIds(s.tabs, (tab) => (isRecord(tab) ? tab.tabbedId : undefined))) return false;
  for (const tab of s.tabs) {
    if (!validateTab(tab)) return false;
  }

  // floats
  if (!isBoundedArray(s.floats) || !hasUniqueIds(s.floats, (float) => (isRecord(float) ? float.floatId : undefined))) return false;
  for (const float of s.floats) {
    if (!validateFloat(float)) return false;
  }

  // tiles
  if (!isBoundedArray(s.tiles) || !hasUniqueIds(s.tiles, (tile) => (isRecord(tile) ? tile.tileId : undefined))) return false;
  for (const tile of s.tiles) {
    if (!validateTile(tile)) return false;
  }

  if (s.workspace !== null && !validateWorkspace(s.workspace)) return false;
  if (!validateFocus(s.focus)) return false;
  if (!validateConstraints(s.constraints)) return false;
  if (s.paneContent !== undefined && !validateSafeRecord(s.paneContent)) return false;

  if (s.session !== undefined && !validateSession(s.session)) return false;

  return true;
}

function validateSplit(split: unknown): boolean {
  if (!isRecord(split)) return false;
  const s = split;
  if (!isSafeId(s.splitId)) return false;
  if (s.direction !== 'horizontal' && s.direction !== 'vertical') return false;
  if (!isFiniteNumber(s.ratio)) return false;
  if (s.ratio < 0 || s.ratio > 1) return false;
  return true;
}

function validateTab(tab: unknown): boolean {
  if (!isRecord(tab)) return false;
  const t = tab;
  if (!isSafeId(t.tabbedId)) return false;
  if (!isNonNegativeInteger(t.activeIndex)) return false;
  if (!isBoundedArray(t.tabOrder) || !t.tabOrder.every(isSafeId) || new Set(t.tabOrder).size !== t.tabOrder.length) return false;
  if (t.tabOrder.length > 0 && t.activeIndex >= t.tabOrder.length) return false;
  if (t.tabOrder.length === 0 && t.activeIndex !== 0) return false;
  return true;
}

function validateFloat(float: unknown): boolean {
  if (!isRecord(float)) return false;
  const f = float;
  if (!isSafeId(f.floatId)) return false;
  if (!isFiniteNumber(f.x) || !isFiniteNumber(f.y)) return false;
  if (!isFiniteNumber(f.width) || f.width < 0 || !isFiniteNumber(f.height) || f.height < 0) return false;
  if (typeof f.minimized !== 'boolean') return false;
  if (f.zIndex !== undefined && !isFiniteNumber(f.zIndex)) return false;
  if (f.maximized !== undefined && typeof f.maximized !== 'boolean') return false;
  if (f.fullscreen !== undefined && typeof f.fullscreen !== 'boolean') return false;
  if (f.hidden !== undefined && typeof f.hidden !== 'boolean') return false;
  if (f.closed !== undefined && typeof f.closed !== 'boolean') return false;
  if (f.alwaysOnTop !== undefined && typeof f.alwaysOnTop !== 'boolean') return false;
  if (f.modal !== undefined && typeof f.modal !== 'boolean') return false;
  if (f.workspaceId !== undefined && !isSafeId(f.workspaceId)) return false;
  if (f.mode !== undefined && !['normal', 'minimized', 'maximized', 'fullscreen', 'hidden', 'closed'].includes(f.mode as string)) return false;
  if (f.restoreBounds !== undefined && !validateBounds(f.restoreBounds)) return false;
  if (f.restoreMode !== undefined && !['normal', 'maximized', 'fullscreen'].includes(f.restoreMode as string)) return false;
  return true;
}

function validateSession(session: unknown): boolean {
  if (!isRecord(session)) return false;
  const s = session;
  if (!validateSafeRecord(s.previews, (value) => isRecord(value) && typeof value.title === 'string' && isNonNegativeInteger(value.panes))) return false;
  if (!isRecord(s.restorePolicy)) return false;
  if (typeof s.restorePolicy.restoreFocus !== 'boolean' || typeof s.restorePolicy.restoreWorkspace !== 'boolean') return false;
  return true;
}

function validateBounds(value: unknown): boolean {
  return (
    isRecord(value) &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isFiniteNumber(value.width) &&
    value.width >= 0 &&
    isFiniteNumber(value.height) &&
    value.height >= 0
  );
}

function validateTile(value: unknown): boolean {
  return (
    isRecord(value) &&
    isSafeId(value.tileId) &&
    (value.direction === 'horizontal' || value.direction === 'vertical') &&
    isFiniteNumber(value.ratio) &&
    value.ratio >= 0 &&
    value.ratio <= 1 &&
    isSafeId(value.firstId) &&
    isSafeId(value.secondId)
  );
}

function validateWorkspace(value: unknown): boolean {
  if (!isRecord(value) || !isNonNegativeInteger(value.activeIndex) || typeof value.overviewMode !== 'boolean') return false;
  if (value.activeWorkspaceId !== undefined && !isSafeId(value.activeWorkspaceId)) return false;
  if (value.workspaces === undefined) return true;
  if (!isBoundedArray(value.workspaces)) return false;
  return hasUniqueIds(value.workspaces, (workspace) => (isRecord(workspace) ? workspace.id : undefined)) && value.workspaces.every(isWorkspaceDescriptor);
}

function validateFocus(value: unknown): boolean {
  return isRecord(value) && (value.focusedPaneId === null || isSafeId(value.focusedPaneId));
}

function validateConstraints(value: unknown): boolean {
  if (!isRecord(value) || !validateSafeRecord(value.paneConstraints)) return false;
  for (const constraint of Object.values(value.paneConstraints)) {
    if (!isRecord(constraint)) return false;
    for (const field of ['minWidth', 'maxWidth', 'minHeight', 'maxHeight', 'preferredRatio', 'priority'] as const) {
      if (constraint[field] !== undefined && !isFiniteNumber(constraint[field])) return false;
    }
    for (const field of ['locked', 'collapsible', 'collapsed'] as const) {
      if (constraint[field] !== undefined && typeof constraint[field] !== 'boolean') return false;
    }
  }
  return true;
}

function validateSafeRecord(value: unknown, validateValue: (value: unknown) => boolean = () => true): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const entries = Object.entries(value);
  return entries.length <= MAX_SPLIT_PANES && entries.every(([key, entry]) => isSafeRecordKey(key) && validateValue(entry));
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
  4: (state) => ({
    ...state,
    floats: Array.isArray(state.floats)
      ? state.floats.map((float) => ({
          ...float,
          // Layouts written before v4 did not retain the visible mode that
          // preceded minimization/hiding, so normal is the only honest default.
          restoreMode: float.restoreMode ?? (float.mode === 'maximized' || float.mode === 'fullscreen' ? float.mode : 'normal'),
        }))
      : [],
    version: 4,
  }),
};

/**
 * Apply sequential migrations from fromVersion to toVersion.
 * Returns the state with version updated to toVersion.
 */
export function migrateLayout(state: HorizonLayoutState, fromVersion: number, toVersion: number): HorizonLayoutState {
  if (!Number.isSafeInteger(fromVersion) || !Number.isSafeInteger(toVersion) || fromVersion < 0 || toVersion < 1 || toVersion > CURRENT_LAYOUT_VERSION) {
    throw new RangeError('Layout migration versions must be supported non-negative integers');
  }
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

function cloneLayoutState(state: HorizonLayoutState): HorizonLayoutState {
  const clone = JSON.parse(JSON.stringify(state)) as unknown;
  if (!validateLayoutState(clone)) throw new TypeError('Invalid layout state');
  return clone;
}

/** Save a layout preset (creates or overwrites) */
export function savePreset(store: PresetStore, name: string, state: HorizonLayoutState, description?: string, createdAt?: number): PresetStore {
  if (!isSafeRecordKey(name)) throw new TypeError('Preset name must be a non-empty safe key');
  if (!validateLayoutState(state)) throw new TypeError('Cannot save an invalid layout state');
  const alreadyExists = Object.hasOwn(store.presets, name);
  if (!alreadyExists && Object.keys(store.presets).length >= MAX_SPLIT_PANES) {
    throw new RangeError(`Preset stores support at most ${MAX_SPLIT_PANES} presets`);
  }
  const preset: LayoutPreset = {
    name,
    state: cloneLayoutState(state),
    createdAt: Number.isFinite(createdAt) ? createdAt! : Date.now(),
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
  if (!isSafeRecordKey(name) || !Object.hasOwn(store.presets, name)) return null;
  const preset = store.presets[name];
  return preset && validateLayoutState(preset.state) ? cloneLayoutState(preset.state) : null;
}

/** Delete a layout preset by name */
export function deletePreset(store: PresetStore, name: string): PresetStore {
  if (!isSafeRecordKey(name) || !Object.hasOwn(store.presets, name)) {
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
  return JSON.stringify(deserializePresets(JSON.stringify(store)));
}

/** Deserialize a preset store from JSON, returning empty store on failure */
export function deserializePresets(json: string): PresetStore {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!isRecord(parsed) || !validateSafeRecord(parsed.presets)) return createPresetStore();
    const presets: Record<string, LayoutPreset> = {};
    for (const [key, value] of Object.entries(parsed.presets)) {
      if (
        !isRecord(value) ||
        value.name !== key ||
        (value.description !== undefined && typeof value.description !== 'string') ||
        !isFiniteNumber(value.createdAt) ||
        !validateLayoutState(value.state)
      ) {
        return createPresetStore();
      }
      presets[key] = {
        name: key,
        state: cloneLayoutState(value.state),
        createdAt: value.createdAt,
        ...(value.description === undefined ? {} : { description: value.description }),
      };
    }
    return { presets };
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
      restoreMode?: WindowRestoreMode;
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
    restoreMode: f.model.restoreMode,
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
  if (!isRecord(value) || !isSafeId(value.id) || typeof value.name !== 'string' || !isFiniteNumber(value.order)) return false;
  for (const key of ['windowIds', 'tabIds', 'paneIds'] as const) {
    const ids = value[key];
    if (ids !== undefined && (!isBoundedArray(ids) || !ids.every(isSafeId) || new Set(ids).size !== ids.length)) return false;
  }
  if (value.activeWindowId !== undefined && !isSafeId(value.activeWindowId)) return false;
  if (value.focusedPaneId !== undefined && !isSafeId(value.focusedPaneId)) return false;
  return value.metadata === undefined || validateSafeRecord(value.metadata);
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
      restoreMode?: WindowRestoreMode;
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
