// --- Detection ---
export {
  detectCapabilities,
  detectColorLevel,
  detectDarkBackground,
  detectReducedMotion,
  getCapabilities,
  getPreferredImageProtocol,
  getTerminalName,
  resetCapabilitiesCache,
  shouldAnimate,
} from './detect.js';
// pinCapabilities / unpinCapabilities are intentionally NOT re-exported here —
// they are test-only escape hatches. Import directly from `./detect.js`
// in tests if needed.
// --- Multiplexer ---
export { applyMultiplexerDowngrades, detectMultiplexer } from './multiplexer.js';
// --- Policy ---
export { canEmit, type EmitProtocol, hasUnicodeOctants, hasUnicodeSextants, resolveSurfaceCapabilities } from './policy.js';
export type { QueryOptions } from './query.js';
// --- Async query ---
export {
  detectCapabilitiesAsync,
  queryDeviceAttributes,
  querySecondaryAttributes,
} from './query.js';
export type {
  CapabilityDetector,
  CapabilityProfile,
  CapabilityRegistry,
  DetectAllOptions,
} from './registry.js';
// --- Capability Registry ---
export {
  createCapabilityRegistry,
  getDefaultCapabilityRegistry,
} from './registry.js';
// --- Size ---
export { getTerminalSize, onResize } from './size.js';
// setTerminalSizeOverride is intentionally NOT re-exported — test-only
// escape hatch. Import directly from `./size.js` in tests if needed.
export type {
  CapabilityCondition,
  PolicyRule,
  PolicySettings,
  PolicyWhen,
  RangeCondition,
  SurfacePolicy,
  SurfacePolicyChangeHandler,
} from './surface-policy.js';
// --- Surface Policy ---
export { createSurfacePolicy } from './surface-policy.js';
// --- Terminal database ---
export { DEFAULT_TERMINAL, lookupTerminal, TERMINAL_DB } from './terminal-db.js';
export { acquireTerminalLease, type TerminalInputStream, type TerminalLease } from './terminal-lease.js';
// --- Types ---
export type {
  AtlasCapabilities,
  AtlasColorLevel,
  AtlasImageProtocol,
  AtlasPerformanceClass,
  AtlasSurface,
  AtlasUnicodeLevel,
  DetectCapabilitiesOptions,
  DeviceAttributeResult,
  GetCapabilitiesOptions,
  MultiplexerInfo,
  MultiplexerType,
  SecondaryAttributeResult,
  TerminalRecord,
  TerminalSize,
} from './types.js';
export type {
  CapabilityChange,
  CapabilityChangeHandler,
  CapabilityWatcher,
  CapabilityWatcherOptions,
} from './watcher.js';
// --- Capability Watcher ---
export {
  capabilitySubHandler,
  createCapabilityWatcher,
} from './watcher.js';
