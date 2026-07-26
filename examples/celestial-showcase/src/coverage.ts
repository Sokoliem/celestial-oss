export type ShowcaseEvidenceMode = 'live' | 'test';
export type BuilderEvidenceMode = 'interactive' | 'rendered';

export interface ShowcasePackageCoverage {
  packageName: string;
  lab: string;
  evidence: ShowcaseEvidenceMode;
  capabilities: readonly string[];
}

export interface ShowcaseBuilderCoverage {
  name: string;
  evidence: BuilderEvidenceMode;
}

export const SHOWCASE_PACKAGE_COVERAGE = [
  { packageName: '@celestial/atlas', lab: 'Core', evidence: 'live', capabilities: ['capabilities', 'terminal size', 'motion policy'] },
  { packageName: '@celestial/aurora', lab: 'Core', evidence: 'live', capabilities: ['tween', 'spring', 'easing'] },
  { packageName: '@celestial/core', lab: 'Core', evidence: 'live', capabilities: ['facade', 'Elm runtime', 'namespaces'] },
  { packageName: '@celestial/corona', lab: 'Core', evidence: 'live', capabilities: ['theme contrast', 'glyphs', 'terminal text'] },
  { packageName: '@celestial/gravity', lab: 'Core', evidence: 'live', capabilities: ['flex', 'responsive tiers', 'density'] },
  { packageName: '@celestial/horizon', lab: 'Windows', evidence: 'live', capabilities: ['workspaces', 'windows', 'shelf', 'snap', 'tiling', 'session'] },
  { packageName: '@celestial/mirage', lab: 'Visuals', evidence: 'live', capabilities: ['gradient', 'shimmer', 'effects'] },
  { packageName: '@celestial/nebula', lab: 'Core/Layers', evidence: 'live', capabilities: ['Elm loop', 'VDOM', 'signals', 'layers'] },
  { packageName: '@celestial/nexus', lab: 'Mouse', evidence: 'live', capabilities: ['HitMap', 'drag and drop', 'context routing'] },
  { packageName: '@celestial/nova', lab: 'Visuals', evidence: 'live', capabilities: ['fade', 'slide', 'morph'] },
  { packageName: '@celestial/orbit', lab: 'Workflows', evidence: 'live', capabilities: ['schema form', 'wizard', 'validation', 'schema parsing', 'prompts'] },
  { packageName: '@celestial/pulsar', lab: 'Visuals', evidence: 'live', capabilities: ['Markdown', 'streaming', 'search', 'TOC'] },
  { packageName: '@celestial/rosetta', lab: 'Core/Locale', evidence: 'live', capabilities: ['locale format', 'bidi', 'graphemes'] },
  { packageName: '@celestial/spectrum', lab: 'Visuals', evidence: 'live', capabilities: ['highlighting', 'language detection', 'tokenization'] },
  { packageName: '@celestial/stellar', lab: 'Visuals', evidence: 'live', capabilities: ['line', 'area', 'heatmap', 'sparkline'] },
  { packageName: '@celestial/test', lab: 'Smoke', evidence: 'test', capabilities: ['headless app', 'screen queries', 'PTY harness'] },
  { packageName: '@celestial/ui', lab: 'Components/Layers', evidence: 'live', capabilities: ['47 builders', 'context menu helper', 'responsive surfaces'] },
] as const satisfies readonly ShowcasePackageCoverage[];

export const UI_BUILDER_COVERAGE = [
  { name: 'button', evidence: 'interactive' },
  { name: 'textInput', evidence: 'interactive' },
  { name: 'textarea', evidence: 'interactive' },
  { name: 'checkbox', evidence: 'interactive' },
  { name: 'radioGroup', evidence: 'interactive' },
  { name: 'select', evidence: 'interactive' },
  { name: 'toggle', evidence: 'interactive' },
  { name: 'slider', evidence: 'interactive' },
  { name: 'checkboxGroup', evidence: 'interactive' },
  { name: 'toggleGroup', evidence: 'interactive' },
  { name: 'autocomplete', evidence: 'interactive' },
  { name: 'combobox', evidence: 'interactive' },
  { name: 'datePicker', evidence: 'interactive' },
  { name: 'multiSelect', evidence: 'interactive' },
  { name: 'numberInput', evidence: 'interactive' },
  { name: 'rangeSlider', evidence: 'interactive' },
  { name: 'rating', evidence: 'interactive' },
  { name: 'segmentedControl', evidence: 'interactive' },
  { name: 'tagInput', evidence: 'interactive' },
  { name: 'colorPicker', evidence: 'interactive' },
  { name: 'formField', evidence: 'rendered' },
  { name: 'tabs', evidence: 'interactive' },
  { name: 'breadcrumb', evidence: 'interactive' },
  { name: 'pagination', evidence: 'interactive' },
  { name: 'commandPalette', evidence: 'interactive' },
  { name: 'optionListView', evidence: 'interactive' },
  { name: 'dataTable', evidence: 'interactive' },
  { name: 'tree', evidence: 'interactive' },
  { name: 'list', evidence: 'rendered' },
  { name: 'progressBar', evidence: 'rendered' },
  { name: 'indeterminateProgress', evidence: 'rendered' },
  { name: 'spinner', evidence: 'rendered' },
  { name: 'card', evidence: 'rendered' },
  { name: 'cardGrid', evidence: 'interactive' },
  { name: 'divider', evidence: 'rendered' },
  { name: 'emptyState', evidence: 'rendered' },
  { name: 'badge', evidence: 'rendered' },
  { name: 'alert', evidence: 'rendered' },
  { name: 'tooltip', evidence: 'interactive' },
  { name: 'createToastManager', evidence: 'interactive' },
  { name: 'modal', evidence: 'interactive' },
  { name: 'confirmDialog', evidence: 'interactive' },
  { name: 'drawer', evidence: 'interactive' },
  { name: 'popover', evidence: 'interactive' },
  { name: 'popoverGroup', evidence: 'interactive' },
  { name: 'hovercard', evidence: 'interactive' },
  { name: 'statusBar', evidence: 'rendered' },
] as const satisfies readonly ShowcaseBuilderCoverage[];

export const UI_BUILDER_NAMES = UI_BUILDER_COVERAGE.map((entry) => entry.name);
export const UI_BUILDER_COUNT = UI_BUILDER_COVERAGE.length;

/**
 * Structural self-checks only. The ledger's counts are verified against the workspace
 * packages on disk and the real `@celestial/ui` export surface in `app.test.ts`;
 * restating them as literals here would just add a second copy free to drift.
 */
export function validateShowcaseCoverage(): string[] {
  const issues: string[] = [];
  const packageNames = SHOWCASE_PACKAGE_COVERAGE.map((entry) => entry.packageName);
  const builderNames = UI_BUILDER_COVERAGE.map((entry) => entry.name);
  if (packageNames.length === 0) issues.push('Package coverage is empty.');
  if (new Set(packageNames).size !== packageNames.length) issues.push('Package coverage contains duplicate entries.');
  if (builderNames.length === 0) issues.push('Builder coverage is empty.');
  if (new Set(builderNames).size !== builderNames.length) issues.push('Builder coverage contains duplicate entries.');
  if ((SHOWCASE_PACKAGE_COVERAGE as readonly ShowcasePackageCoverage[]).some((entry) => entry.capabilities.length === 0)) {
    issues.push('Every package requires at least one capability receipt.');
  }
  return issues;
}
