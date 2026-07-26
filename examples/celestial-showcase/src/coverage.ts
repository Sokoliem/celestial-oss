export type ShowcaseEvidenceMode = 'live' | 'test';
export type BuilderEvidenceMode = 'interactive' | 'rendered';
export type BuilderConformanceCapability = 'theme' | 'pointer' | 'keyboard' | 'wheel' | 'states' | 'elevation' | 'a11y' | 'responsive';

export interface ShowcasePackageCoverage {
  packageName: string;
  lab: string;
  evidence: ShowcaseEvidenceMode;
  capabilities: readonly string[];
}

export interface ShowcaseBuilderCoverage {
  name: string;
  evidence: BuilderEvidenceMode;
  capabilities: readonly BuilderConformanceCapability[];
}

export const SHOWCASE_PACKAGE_COVERAGE = [
  { packageName: '@celestial/atlas', lab: 'Core', evidence: 'live', capabilities: ['capabilities', 'terminal size', 'motion policy'] },
  { packageName: '@celestial/aurora', lab: 'Core', evidence: 'live', capabilities: ['tween', 'spring', 'easing'] },
  { packageName: '@celestial/compass', lab: 'App shell', evidence: 'live', capabilities: ['local URLs', 'route matching', 'history', 'modal-safe screens'] },
  { packageName: '@celestial/core', lab: 'Core', evidence: 'live', capabilities: ['facade', 'Elm runtime', 'namespaces'] },
  { packageName: '@celestial/corona', lab: 'Core', evidence: 'live', capabilities: ['theme contrast', 'glyphs', 'terminal text'] },
  { packageName: '@celestial/gravity', lab: 'Core', evidence: 'live', capabilities: ['flex', 'responsive tiers', 'density'] },
  { packageName: '@celestial/horizon', lab: 'Windows', evidence: 'live', capabilities: ['workspaces', 'windows', 'shelf', 'snap', 'tiling', 'session'] },
  { packageName: '@celestial/mirage', lab: 'Visuals', evidence: 'live', capabilities: ['gradient', 'shimmer', 'effects'] },
  { packageName: '@celestial/nebula', lab: 'Core/Layers/App shell', evidence: 'live', capabilities: ['Elm loop', 'VDOM', 'signals', 'layers', 'explicit config loading', 'config diagnostics'] },
  { packageName: '@celestial/nexus', lab: 'Mouse', evidence: 'live', capabilities: ['HitMap', 'drag and drop', 'context routing'] },
  { packageName: '@celestial/nova', lab: 'Visuals', evidence: 'live', capabilities: ['fade', 'slide', 'morph'] },
  { packageName: '@celestial/orbit', lab: 'Workflows', evidence: 'live', capabilities: ['schema form', 'wizard', 'validation', 'schema parsing', 'prompts'] },
  { packageName: '@celestial/pulsar', lab: 'Visuals', evidence: 'live', capabilities: ['Markdown', 'streaming', 'search', 'TOC'] },
  { packageName: '@celestial/rosetta', lab: 'Core/Locale', evidence: 'live', capabilities: ['locale format', 'bidi', 'graphemes'] },
  { packageName: '@celestial/spectrum', lab: 'Visuals', evidence: 'live', capabilities: ['highlighting', 'language detection', 'tokenization'] },
  { packageName: '@celestial/stellar', lab: 'Visuals', evidence: 'live', capabilities: ['line', 'area', 'heatmap', 'sparkline'] },
  { packageName: '@celestial/test', lab: 'Smoke', evidence: 'test', capabilities: ['headless app', 'screen queries', 'PTY harness'] },
  {
    packageName: '@celestial/ui',
    lab: 'Components/Layers/App shell',
    evidence: 'live',
    capabilities: ['47 builders', 'context menu helper', 'responsive surfaces', 'headless app shell'],
  },
] as const satisfies readonly ShowcasePackageCoverage[];

export const UI_BUILDER_COVERAGE = [
  { name: 'button', evidence: 'interactive', capabilities: ['theme', 'pointer', 'keyboard', 'states', 'a11y', 'responsive'] },
  { name: 'textInput', evidence: 'interactive', capabilities: ['theme', 'pointer', 'keyboard', 'states', 'a11y', 'responsive'] },
  { name: 'textarea', evidence: 'interactive', capabilities: ['theme', 'pointer', 'keyboard', 'wheel', 'states', 'a11y', 'responsive'] },
  { name: 'checkbox', evidence: 'interactive', capabilities: ['theme', 'pointer', 'keyboard', 'states', 'a11y', 'responsive'] },
  { name: 'radioGroup', evidence: 'interactive', capabilities: ['theme', 'pointer', 'keyboard', 'states', 'a11y', 'responsive'] },
  { name: 'select', evidence: 'interactive', capabilities: ['theme', 'pointer', 'keyboard', 'wheel', 'states', 'elevation', 'a11y', 'responsive'] },
  { name: 'toggle', evidence: 'interactive', capabilities: ['theme', 'pointer', 'keyboard', 'states', 'a11y', 'responsive'] },
  { name: 'slider', evidence: 'interactive', capabilities: ['theme', 'pointer', 'keyboard', 'states', 'a11y', 'responsive'] },
  { name: 'checkboxGroup', evidence: 'interactive', capabilities: ['theme', 'pointer', 'keyboard', 'wheel', 'states', 'a11y', 'responsive'] },
  { name: 'toggleGroup', evidence: 'interactive', capabilities: ['theme', 'pointer', 'keyboard', 'states', 'a11y', 'responsive'] },
  { name: 'autocomplete', evidence: 'interactive', capabilities: ['theme', 'pointer', 'keyboard', 'wheel', 'states', 'elevation', 'a11y', 'responsive'] },
  { name: 'combobox', evidence: 'interactive', capabilities: ['theme', 'pointer', 'keyboard', 'wheel', 'states', 'elevation', 'a11y', 'responsive'] },
  { name: 'datePicker', evidence: 'interactive', capabilities: ['theme', 'pointer', 'keyboard', 'states', 'elevation', 'a11y', 'responsive'] },
  { name: 'multiSelect', evidence: 'interactive', capabilities: ['theme', 'pointer', 'keyboard', 'wheel', 'states', 'elevation', 'a11y', 'responsive'] },
  { name: 'numberInput', evidence: 'interactive', capabilities: ['theme', 'pointer', 'keyboard', 'states', 'a11y', 'responsive'] },
  { name: 'rangeSlider', evidence: 'interactive', capabilities: ['theme', 'pointer', 'keyboard', 'states', 'a11y', 'responsive'] },
  { name: 'rating', evidence: 'interactive', capabilities: ['theme', 'pointer', 'keyboard', 'states', 'a11y', 'responsive'] },
  { name: 'segmentedControl', evidence: 'interactive', capabilities: ['theme', 'pointer', 'keyboard', 'states', 'a11y', 'responsive'] },
  { name: 'tagInput', evidence: 'interactive', capabilities: ['theme', 'pointer', 'keyboard', 'wheel', 'states', 'a11y', 'responsive'] },
  { name: 'colorPicker', evidence: 'interactive', capabilities: ['theme', 'pointer', 'keyboard', 'states', 'elevation', 'a11y', 'responsive'] },
  { name: 'formField', evidence: 'rendered', capabilities: ['theme', 'states', 'a11y', 'responsive'] },
  { name: 'tabs', evidence: 'interactive', capabilities: ['theme', 'pointer', 'keyboard', 'states', 'a11y', 'responsive'] },
  { name: 'breadcrumb', evidence: 'interactive', capabilities: ['theme', 'pointer', 'keyboard', 'states', 'a11y', 'responsive'] },
  { name: 'pagination', evidence: 'interactive', capabilities: ['theme', 'pointer', 'keyboard', 'states', 'a11y', 'responsive'] },
  { name: 'commandPalette', evidence: 'interactive', capabilities: ['theme', 'pointer', 'keyboard', 'wheel', 'states', 'elevation', 'a11y', 'responsive'] },
  { name: 'optionListView', evidence: 'interactive', capabilities: ['theme', 'pointer', 'keyboard', 'wheel', 'states', 'a11y', 'responsive'] },
  { name: 'dataTable', evidence: 'interactive', capabilities: ['theme', 'pointer', 'keyboard', 'wheel', 'states', 'a11y', 'responsive'] },
  { name: 'tree', evidence: 'interactive', capabilities: ['theme', 'pointer', 'keyboard', 'wheel', 'states', 'a11y', 'responsive'] },
  { name: 'list', evidence: 'rendered', capabilities: ['theme', 'wheel', 'states', 'a11y', 'responsive'] },
  { name: 'progressBar', evidence: 'rendered', capabilities: ['theme', 'states', 'a11y', 'responsive'] },
  { name: 'indeterminateProgress', evidence: 'rendered', capabilities: ['theme', 'states', 'a11y', 'responsive'] },
  { name: 'spinner', evidence: 'rendered', capabilities: ['theme', 'states', 'a11y', 'responsive'] },
  { name: 'card', evidence: 'rendered', capabilities: ['theme', 'states', 'elevation', 'a11y', 'responsive'] },
  { name: 'cardGrid', evidence: 'interactive', capabilities: ['theme', 'pointer', 'keyboard', 'wheel', 'states', 'elevation', 'a11y', 'responsive'] },
  { name: 'divider', evidence: 'rendered', capabilities: ['theme', 'a11y', 'responsive'] },
  { name: 'emptyState', evidence: 'rendered', capabilities: ['theme', 'a11y', 'responsive'] },
  { name: 'badge', evidence: 'rendered', capabilities: ['theme', 'states', 'a11y', 'responsive'] },
  { name: 'alert', evidence: 'rendered', capabilities: ['theme', 'states', 'elevation', 'a11y', 'responsive'] },
  { name: 'tooltip', evidence: 'interactive', capabilities: ['theme', 'pointer', 'keyboard', 'states', 'elevation', 'a11y', 'responsive'] },
  { name: 'createToastManager', evidence: 'interactive', capabilities: ['theme', 'pointer', 'keyboard', 'states', 'elevation', 'a11y', 'responsive'] },
  { name: 'modal', evidence: 'interactive', capabilities: ['theme', 'pointer', 'keyboard', 'wheel', 'states', 'elevation', 'a11y', 'responsive'] },
  { name: 'confirmDialog', evidence: 'interactive', capabilities: ['theme', 'pointer', 'keyboard', 'states', 'elevation', 'a11y', 'responsive'] },
  { name: 'drawer', evidence: 'interactive', capabilities: ['theme', 'pointer', 'keyboard', 'wheel', 'states', 'elevation', 'a11y', 'responsive'] },
  { name: 'popover', evidence: 'interactive', capabilities: ['theme', 'pointer', 'keyboard', 'wheel', 'states', 'elevation', 'a11y', 'responsive'] },
  { name: 'popoverGroup', evidence: 'interactive', capabilities: ['theme', 'pointer', 'keyboard', 'wheel', 'states', 'elevation', 'a11y', 'responsive'] },
  { name: 'hovercard', evidence: 'interactive', capabilities: ['theme', 'pointer', 'keyboard', 'states', 'elevation', 'a11y', 'responsive'] },
  { name: 'statusBar', evidence: 'rendered', capabilities: ['theme', 'states', 'a11y', 'responsive'] },
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
  if ((UI_BUILDER_COVERAGE as readonly ShowcaseBuilderCoverage[]).some((entry) => !entry.capabilities.includes('theme'))) {
    issues.push('Every builder requires a theme conformance receipt.');
  }
  if ((UI_BUILDER_COVERAGE as readonly ShowcaseBuilderCoverage[]).some((entry) => !entry.capabilities.includes('a11y'))) {
    issues.push('Every builder requires an accessibility conformance receipt.');
  }
  if ((UI_BUILDER_COVERAGE as readonly ShowcaseBuilderCoverage[]).some((entry) => !entry.capabilities.includes('responsive'))) {
    issues.push('Every builder requires a responsive conformance receipt.');
  }
  if (
    (UI_BUILDER_COVERAGE as readonly ShowcaseBuilderCoverage[]).some(
      (entry) => entry.evidence === 'interactive' && (!entry.capabilities.includes('pointer') || !entry.capabilities.includes('keyboard')),
    )
  ) {
    issues.push('Every interactive builder requires pointer and keyboard conformance receipts.');
  }
  return issues;
}
