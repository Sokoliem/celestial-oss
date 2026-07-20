/** @celestial/test — deterministic headless testing for Celestial TUIs. */

export { auditA11y } from './a11y-audit.js';
export {
  waitFor,
  waitForAnnouncement,
  waitForElementToBeRemoved,
  waitForFocusChange,
  waitForPredicate,
  waitForText,
} from './async.js';
export {
  assertNodeCount,
  assertRenderWithinBudget,
  type NodeCountResult,
  type RenderBudgetOptions,
  type RenderBudgetResult,
} from './budget-assertions.js';
export { CAPABILITY_PRESETS, type CapabilityPreset, createCapabilityFixture } from './capability-fixtures.js';
export { analyzeMessageCoverage, type MessageCoverageReport } from './coverage.js';
export { fireKey, fireMouse, firePaste, fireResize } from './events.js';
export { createFixture, type TelescopeFixture, terminals } from './fixtures.js';
export { createInteractionRecorder, type InteractionRecorder } from './interactions.js';
export { MockTerminal, type MockTerminalOptions } from './mock-terminal.js';
export { type FetchMockDefinition, mockFetch, mockSubprocess, type SubprocessMockDefinition } from './mocks.js';
export {
  assertFinalFramesMatchAcrossMotionModes,
  type FinalFrameMatchOptions,
  type MotionModeRunner,
  renderInBothMotionModes,
} from './motion-modes.js';
export { assertMouseKeyboardParity, type ParityAction } from './parity.js';
export type { FrameProfile, Profiler, ProfilerOptions, ProfilerStats, ProfileSample, RenderTracer, RenderTraceSpan } from './profiler.js';
export { createProfiler, createRenderTracer, measureDiff, measureLayout, measureRender, profilerPlugin } from './profiler.js';
export {
  a11y,
  createQueryEngine,
  type LabelQueryOptions,
  type QueryEngine,
  type RoleQueryOptions,
  type Selector,
  testId,
} from './queries.js';
export { profileRender, type RenderOptions, type RenderProfileDescriptor, type RenderProfileResult, renderToLines, renderToText } from './render.js';
export { createScreen, type Screen } from './screen.js';
export { normalizeSnapshot, renderToSnapshot, type SnapshotOptions } from './snapshots.js';
export { createTestApp, keyToBuffer, type TestAppHandle, type TestAppOptions } from './test-app.js';
export type {
  A11yAuditResult,
  A11yRuleName,
  A11yViolation,
  AccessibilityAnnouncement,
  FocusEventRecord,
  InteractionRecording,
  InteractionStep,
  KeyModifiers,
  MessageCoverage,
  MouseEventOptions,
  QueryResult,
  RecordedDispatchEvent,
  RecordedInteractionEvent,
  RecordedKeyEvent,
  TerminalPreset,
  TextMatch,
  WaitOptions,
} from './types.js';
