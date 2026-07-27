import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { previewPackageDirectories, previewPackageSet, previewPackages } from './preview-packages.mjs';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const keep = process.argv.includes('--keep');
const outputIndex = process.argv.indexOf('--out');
const requestedOutput = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
if (outputIndex >= 0 && !requestedOutput) throw new Error('--out requires a directory.');

const temporaryRoot = requestedOutput ? resolve(requestedOutput) : mkdtempSync(join(tmpdir(), 'celestial-preview-pack-'));
const ownsTemporaryRoot = requestedOutput === undefined;
const packDirectory = join(temporaryRoot, 'packs');
const fixtureDirectory = join(temporaryRoot, 'fixture');
mkdirSync(packDirectory, { recursive: true });

function executable(name) {
  return process.platform === 'win32' && (name === 'pnpm' || name === 'npm') ? `${name}.cmd` : name;
}

function run(name, args, options = {}) {
  const requiresWindowsShell = process.platform === 'win32' && (name === 'pnpm' || name === 'npm');
  const result = spawnSync(executable(name), args, {
    cwd: options.cwd ?? repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
    maxBuffer: 32 * 1024 * 1024,
    shell: requiresWindowsShell,
    windowsHide: true,
  });
  if (result.status !== 0) {
    const detail = [result.error?.stack, result.stdout, result.stderr].filter(Boolean).join('\n');
    const outcome = result.signal ? `signal ${result.signal}` : `exit code ${result.status}`;
    throw new Error(`${name} ${args.join(' ')} failed with ${outcome}.\n${detail}`);
  }
  return result.stdout.trim();
}

function parseJsonOutput(output, operation) {
  const normalize = (value) => {
    const result = Array.isArray(value) ? value[0] : value;
    return result && typeof result === 'object' ? result : null;
  };

  try {
    const result = normalize(JSON.parse(output.trim()));
    if (result) return result;
  } catch {
    // Some pnpm versions prefix their JSON result with a status line.
  }

  for (const line of output.split(/\r?\n/).reverse()) {
    try {
      const result = normalize(JSON.parse(line.trim()));
      if (result) return result;
    } catch {
      // Keep looking for the final machine-readable line.
    }
  }

  const start = output.indexOf('{');
  const end = output.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error(`${operation} did not return JSON.\n${output}`);
  const result = normalize(JSON.parse(output.slice(start, end + 1)));
  if (!result) throw new Error(`${operation} returned JSON without a package result.\n${output}`);
  return result;
}

function packedManifest(tarball) {
  return JSON.parse(run('tar', ['-xOf', tarball, 'package/package.json']));
}

function exportTargets(value) {
  if (typeof value === 'string') return [value];
  if (!value || typeof value !== 'object') return [];
  return Object.values(value).flatMap(exportTargets);
}

function exportSpecifiers(packageName, manifest) {
  return Object.keys(manifest.exports ?? { '.': manifest.main })
    .filter((subpath) => !subpath.includes('*') && subpath !== './package.json')
    .map((subpath) => (subpath === '.' ? packageName : `${packageName}/${subpath.slice(2)}`));
}

function assertPackedReferences(packageName, tarball, result) {
  const textArtifacts = result.files
    .map((file) => file.path.replaceAll('\\', '/'))
    .filter((path) => path.startsWith('dist/') && /(?:\.[cm]?js|\.d\.ts)$/.test(path));

  for (const path of textArtifacts) {
    const content = run('tar', ['-xOf', tarball, `package/${path}`]);
    let cursor = 0;
    while (cursor < content.length) {
      const start = content.indexOf('@celestial/', cursor);
      if (start < 0) break;
      const match = /^@celestial\/[a-z0-9_-]+/i.exec(content.slice(start));
      if (!match) throw new Error(`${packageName} ${path} contains an unresolved or computed Celestial package reference.`);
      if (!previewPackageSet.has(match[0])) throw new Error(`${packageName} ${path} leaks unpublished package ${match[0]}.`);
      cursor = start + match[0].length;
    }
  }
}

function assertPackedPackage(packageName, result, manifest) {
  const serialized = JSON.stringify(manifest);
  if (serialized.includes('workspace:')) throw new Error(`${packageName} packed manifest still contains workspace: ranges.`);
  if (manifest.private === true) throw new Error(`${packageName} packed manifest is private.`);
  if (manifest.publishConfig?.access !== 'public') throw new Error(`${packageName} packed manifest is not public.`);

  for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies']) {
    for (const dependencyName of Object.keys(manifest[section] ?? {})) {
      if (dependencyName.startsWith('@celestial/') && !previewPackageSet.has(dependencyName)) {
        throw new Error(`${packageName} ${section} leaks unpublished package ${dependencyName}.`);
      }
    }
  }

  const paths = new Set(result.files.map((file) => file.path.replaceAll('\\', '/')));
  for (const requiredPath of ['package.json', 'README.md', 'dist/index.js', 'dist/index.cjs', 'dist/index.d.ts']) {
    if (!paths.has(requiredPath)) throw new Error(`${packageName} tarball is missing ${requiredPath}.`);
  }

  for (const target of exportTargets(manifest.exports)) {
    if (!target.startsWith('./dist/')) continue;
    const path = target.slice(2);
    if (!paths.has(path)) throw new Error(`${packageName} export target ${target} is missing from its tarball.`);
  }
}

function uiGoldenPathRuntimeSmoke(format) {
  return `const packedFormat = ${JSON.stringify(format)};
const packedAssert = (condition, message) => {
  if (!condition) throw new Error(packedFormat + ' UI golden-path smoke test failed: ' + message);
};
const packedHostModel = Object.freeze({ ready: true });
const packedRegistry = nebula.createActionRegistry([
  {
    id: 'packed.action',
    title: 'Packed action',
    description: 'Exercise the packed UI action path',
    category: 'Packed',
    shortcuts: ['ctrl+k'],
    when: (model) => model.ready,
    run: () => ({ type: 'packed-action' }),
  },
]);
packedAssert(
  Object.isFrozen(packedRegistry) &&
    Object.isFrozen(packedRegistry.actions) &&
    packedRegistry.byId.get('packed.action')?.title === 'Packed action',
  'canonical action registry construction failed.',
);

const packedToMessage = (actionId) => ({ type: 'packed-action-request', actionId });
const packedCommands = ui.actionCommands(packedRegistry, packedHostModel, { toMsg: packedToMessage });
packedAssert(
  packedCommands.length === 1 &&
    packedCommands[0]?.id === 'packed.action' &&
    packedCommands[0]?.msg.actionId === 'packed.action',
  'action command projection failed.',
);
const packedActionBindings = ui.actionKeyBindings(packedRegistry, packedHostModel, { toMsg: packedToMessage });
packedAssert(
  packedActionBindings.length === 1 &&
    packedActionBindings[0]?.key === 'k' &&
    packedActionBindings[0]?.modifiers?.ctrl === true &&
    packedActionBindings[0]?.msg.actionId === 'packed.action',
  'action key-binding projection failed.',
);
const packedKeySubscription = ui.keyMap(packedActionBindings);
packedAssert(
  packedKeySubscription?._tag === 'sub' && nebula.subKind(packedKeySubscription).kind === 'batch',
  'key-map subscription projection failed.',
);
const packedHelpView = ui.helpView(packedActionBindings, { title: 'Packed help', width: 40 });
packedAssert(
  packedHelpView !== null && typeof packedHelpView === 'object' && typeof packedHelpView.kind === 'string',
  'help-view projection failed.',
);

const packedStore = ui.createNotificationStore({ now: () => 1_000 });
const packedInitialNotifications = packedStore.init();
const packedEnqueued = packedStore.enqueue(packedInitialNotifications, {
  message: 'Packed notification',
  level: 'info',
  delivery: 'both',
  durationMs: null,
  actionIds: ['packed.action'],
});
packedAssert(packedEnqueued.ok, 'notification store enqueue failed.');
const packedNotifications = packedEnqueued.value.model;
const packedNotificationId = packedEnqueued.value.entry.id;
packedAssert(
  Object.isFrozen(packedNotifications) &&
    packedNotifications.entries.length === 1 &&
    packedNotifications.visibleToastIds[0] === packedNotificationId,
  'notification store model projection failed.',
);
const packedCenter = ui.createNotificationCenter({
  store: packedStore,
  ownsToastEscape: false,
  initiallyOpen: true,
  formatTimestamp: (timestamp) => String(timestamp),
  resolveAction: (actionId) => ({ label: actionId }),
});
const packedCenterState = packedCenter.init(packedNotifications);
const packedCenterView = packedCenter.view(packedCenterState, packedNotifications, { cols: 80, rows: 24 });
packedAssert(
  packedCenterState.open === true &&
    packedCenterState.selectedId === packedNotificationId &&
    packedCenterView !== null &&
    typeof packedCenterView === 'object' &&
    typeof packedCenterView.kind === 'string',
  'notification-center construction or projection failed.',
);
const packedToastManager = ui.createToastManager({ store: packedStore, dismissalOwner: 'host' });
const packedToastProjection = packedToastManager.project(packedNotifications);
packedAssert(
  packedToastProjection.ok &&
    packedToastProjection.value.toasts.length === 1 &&
    packedToastProjection.value.toasts[0]?.id === packedNotificationId &&
    packedToastProjection.value.entries.length === 1,
  'toast-model projection failed.',
);

const packedShell = ui.createAppShell({
  registry: packedRegistry,
  notificationStore: packedStore,
  formatTimestamp: (timestamp) => String(timestamp),
  canUseGlobalShortcuts: () => true,
});
const packedShellModel = packedShell.init(packedHostModel);
packedAssert(
  Object.isFrozen(packedShellModel) && packedShell.validateModel(packedShellModel).length === 0,
  'app-shell initialization failed.',
);
const packedShellProjection = packedShell.project(packedShellModel, packedHostModel);
packedAssert(
  packedShellProjection.diagnostics.length === 0 &&
    packedShellProjection.commands.some((command) => command.id === 'packed.action') &&
    packedShellProjection.keyBindings.some(
      (binding) =>
        binding.key === 'k' &&
        binding.modifiers?.ctrl === true &&
        binding.msg.type === 'shell-request-action' &&
        binding.msg.actionId === 'packed.action',
    ) &&
    packedShellProjection.helpBindings.some(
      (binding) => binding.msg.type === 'shell-request-action' && binding.msg.actionId === 'packed.action',
    ),
  'app-shell action projection failed.',
);
const packedShellOpened = packedShell.update(
  { type: 'shell-open-palette' },
  packedShellModel,
  { hostModel: packedHostModel, viewport: { cols: 80, rows: 24 } },
);
packedAssert(
  packedShellOpened.diagnostics.length === 0 && packedShellOpened.model.palette.open === true,
  'app-shell state update failed.',
);
const packedShellRequested = packedShell.update(
  { type: 'shell-request-action', actionId: 'packed.action', source: 'shortcut' },
  packedShellModel,
  { hostModel: packedHostModel, viewport: { cols: 80, rows: 24 } },
);
packedAssert(
  packedShellRequested.diagnostics.length === 0 &&
    packedShellRequested.receipts.length === 1 &&
    packedShellRequested.receipts[0]?.type === 'action-requested' &&
    packedShellRequested.receipts[0]?.actionId === 'packed.action',
  'app-shell action update failed.',
);
const packedStatusSections = packedShell.status(packedShellRequested.model, {
  mode: 'PACKED',
  title: 'Packed shell',
  showShortcutHints: true,
});
packedAssert(
  packedStatusSections.left[0]?.text === 'PACKED' &&
    packedStatusSections.center[0]?.text === 'Packed shell' &&
    packedStatusSections.right.some((section) => section.text.startsWith('Palette ')),
  'app-shell status projection failed.',
);
const packedStatusBar = ui.statusBar({ width: 80, ...packedStatusSections });
const [packedStatusModel] = packedStatusBar.init();
const packedStatusView = packedStatusBar.view(packedStatusModel);
packedAssert(
  packedStatusModel.width === 80 &&
    packedStatusModel.left[0]?.text === 'PACKED' &&
    packedStatusView !== null &&
    typeof packedStatusView === 'object' &&
    typeof packedStatusView.kind === 'string',
  'status-bar construction or projection failed.',
);
`;
}

try {
  run('node', ['scripts/check-preview-boundary.mjs']);

  const packedPackages = [];
  for (const packageName of previewPackages) {
    const packageDirectory = previewPackageDirectories[packageName];
    const sourceManifest = JSON.parse(readFileSync(join(repositoryRoot, packageDirectory, 'package.json'), 'utf8'));
    if (sourceManifest.private === true) continue;

    const output = run('pnpm', ['--dir', packageDirectory, 'pack', '--pack-destination', packDirectory, '--json']);
    const result = parseJsonOutput(output, `packing ${packageName}`);
    if (result.name !== packageName) throw new Error(`Packed ${result.name} from ${packageDirectory}; expected ${packageName}.`);
    const manifest = packedManifest(result.filename);
    assertPackedPackage(packageName, result, manifest);
    assertPackedReferences(packageName, result.filename, result);
    packedPackages.push({ manifest, name: packageName, tarball: result.filename });
  }

  if (packedPackages.length === 0) throw new Error('No preview packages were packed.');
  const tarballs = packedPackages.map(({ tarball }) => tarball);
  const moduleSpecifiers = packedPackages.flatMap(({ manifest, name }) => exportSpecifiers(name, manifest));
  const runtimeModuleSpecifiers = moduleSpecifiers.filter((specifier) => specifier !== '@celestial/test/vitest');

  mkdirSync(fixtureDirectory, { recursive: true });
  writeFileSync(
    join(fixtureDirectory, 'package.json'),
    `${JSON.stringify({ name: 'celestial-preview-smoke', private: true, type: 'module', version: '0.0.0' }, null, 2)}\n`,
  );
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', ...tarballs, '@types/node@25', 'vitest@2.1.9'], {
    cwd: fixtureDirectory,
  });

  writeFileSync(
    join(fixtureDirectory, 'smoke.mjs'),
    `for (const specifier of ${JSON.stringify(runtimeModuleSpecifiers)}) await import(specifier);
const core = await import('@celestial/core');
const compass = await import('@celestial/compass');
const nebula = await import('@celestial/nebula');
const gravity = await import('@celestial/gravity');
const ui = await import('@celestial/ui');
const test = await import('@celestial/test');
const horizon = await import('@celestial/horizon');
await import('@celestial/core/atlas');
await import('@celestial/core/corona');
await import('@celestial/core/aurora');
await import('@celestial/core/nebula');
await import('@celestial/core/gravity');
await import('@celestial/core/nexus');
await import('@celestial/test/pty');
const esmExports = {
  'core.app': core.app,
  'compass.createHistory': compass.createHistory,
  'compass.createRouter': compass.createRouter,
  'compass.createScreenStack': compass.createScreenStack,
  'compass.matchRoute': compass.matchRoute,
  'compass.parseUrl': compass.parseUrl,
  'nebula.createActionRegistry': nebula.createActionRegistry,
  'nebula.loadConfig': nebula.loadConfig,
  'nebula.subKind': nebula.subKind,
  'nebula.encodePointerCursor': nebula.encodePointerCursor,
  'gravity.resizeSplitterSeam': gravity.resizeSplitterSeam,
  'ui.actionKeyBindings': ui.actionKeyBindings,
  'ui.actionCommands': ui.actionCommands,
  'ui.createAppShell': ui.createAppShell,
  'ui.createNotificationCenter': ui.createNotificationCenter,
  'ui.createNotificationStore': ui.createNotificationStore,
  'ui.createToastManager': ui.createToastManager,
  'ui.helpView': ui.helpView,
  'ui.keyMap': ui.keyMap,
  'ui.modal': ui.modal,
  'ui.statusBar': ui.statusBar,
  'ui.dataTable': ui.dataTable,
  'test.createTestApp': test.createTestApp,
  'horizon.splitPane': horizon.splitPane,
  'horizon.createWindowManagerPointerState': horizon.createWindowManagerPointerState,
  'horizon.windowManagerPointerUpdate': horizon.windowManagerPointerUpdate,
};
for (const [name, value] of Object.entries(esmExports)) {
  if (typeof value !== 'function') throw new Error('ESM preview smoke test could not find ' + name + '.');
}
const esmInferredRegion = nebula.event('packed-action', nebula.text('Packed action'), { onClick: 'activate' });
if (esmInferredRegion.metadata?.cursor !== 'pointer' || !esmInferredRegion.metadata.affordances?.includes('click')) {
  throw new Error('ESM Nebula event metadata inference was not preserved in the packed package.');
}
const esmRouter = compass.createRouter({ routes: [{ id: 'home', pattern: '/' }, { id: 'user', pattern: '/users/:id' }] });
const esmResolution = esmRouter.resolve(esmRouter.init('/users/packed'));
if (esmResolution.status !== 'matched' || esmResolution.match.params.id !== 'packed') {
  throw new Error('ESM Compass router smoke test did not resolve the packed route.');
}
const esmHistory = compass.createHistory('/start');
if (compass.currentLocation(esmHistory).href !== '/start') throw new Error('ESM Compass history smoke test failed.');
const esmScreens = compass.screenStackUpdate(
  { type: 'screen:push', id: 'confirm', modal: true },
  compass.createScreenStack({ id: 'home' }),
);
if (compass.currentScreen(esmScreens).id !== 'confirm') throw new Error('ESM Compass screen-stack smoke test failed.');
const esmConfig = await nebula.loadConfig({
  precedence: 'first-listed-wins',
  sources: [{ id: 'packed', read: () => '{"ready":true}' }],
  parse: (contents) => JSON.parse(contents),
  validate: (candidate) =>
    candidate && candidate.ready === true
      ? { valid: true, value: { ready: true } }
      : { valid: false, issues: ['ready must be true'] },
  stageTimeoutMs: 1_000,
});
if (!esmConfig.ok || esmConfig.value.ready !== true || !Object.isFrozen(esmConfig.value)) {
  throw new Error('ESM Nebula config-loader smoke test failed.');
}
${uiGoldenPathRuntimeSmoke('ESM')}
`,
  );
  writeFileSync(
    join(fixtureDirectory, 'smoke.cjs'),
    `for (const specifier of ${JSON.stringify(runtimeModuleSpecifiers)}) require(specifier);
const core = require('@celestial/core');
const compass = require('@celestial/compass');
const nebula = require('@celestial/nebula');
const gravity = require('@celestial/gravity');
const ui = require('@celestial/ui');
const test = require('@celestial/test');
const horizon = require('@celestial/horizon');
require('@celestial/core/nebula');
require('@celestial/test/pty');
const cjsExports = {
  'core.app': core.app,
  'compass.createHistory': compass.createHistory,
  'compass.createRouter': compass.createRouter,
  'compass.createScreenStack': compass.createScreenStack,
  'compass.matchRoute': compass.matchRoute,
  'compass.parseUrl': compass.parseUrl,
  'nebula.createActionRegistry': nebula.createActionRegistry,
  'nebula.loadConfig': nebula.loadConfig,
  'nebula.subKind': nebula.subKind,
  'nebula.encodePointerCursor': nebula.encodePointerCursor,
  'gravity.resizeSplitterSeam': gravity.resizeSplitterSeam,
  'ui.actionKeyBindings': ui.actionKeyBindings,
  'ui.actionCommands': ui.actionCommands,
  'ui.createAppShell': ui.createAppShell,
  'ui.createNotificationCenter': ui.createNotificationCenter,
  'ui.createNotificationStore': ui.createNotificationStore,
  'ui.createToastManager': ui.createToastManager,
  'ui.helpView': ui.helpView,
  'ui.keyMap': ui.keyMap,
  'ui.modal': ui.modal,
  'ui.statusBar': ui.statusBar,
  'ui.dataTable': ui.dataTable,
  'test.createTestApp': test.createTestApp,
  'horizon.splitPane': horizon.splitPane,
  'horizon.createWindowManagerPointerState': horizon.createWindowManagerPointerState,
  'horizon.windowManagerPointerUpdate': horizon.windowManagerPointerUpdate,
};
for (const [name, value] of Object.entries(cjsExports)) {
  if (typeof value !== 'function') throw new Error('CommonJS preview smoke test could not find ' + name + '.');
}
const cjsInferredRegion = nebula.event('packed-action', nebula.text('Packed action'), { onClick: 'activate' });
if (cjsInferredRegion.metadata?.cursor !== 'pointer' || !cjsInferredRegion.metadata.affordances?.includes('click')) {
  throw new Error('CommonJS Nebula event metadata inference was not preserved in the packed package.');
}
const cjsRouter = compass.createRouter({ routes: [{ id: 'home', pattern: '/' }, { id: 'user', pattern: '/users/:id' }] });
const cjsResolution = cjsRouter.resolve(cjsRouter.init('/users/packed'));
if (cjsResolution.status !== 'matched' || cjsResolution.match.params.id !== 'packed') {
  throw new Error('CommonJS Compass router smoke test did not resolve the packed route.');
}
const cjsHistory = compass.createHistory('/start');
if (compass.currentLocation(cjsHistory).href !== '/start') throw new Error('CommonJS Compass history smoke test failed.');
const cjsScreens = compass.screenStackUpdate(
  { type: 'screen:push', id: 'confirm', modal: true },
  compass.createScreenStack({ id: 'home' }),
);
if (compass.currentScreen(cjsScreens).id !== 'confirm') throw new Error('CommonJS Compass screen-stack smoke test failed.');
void nebula.loadConfig({
  precedence: 'first-listed-wins',
  sources: [{ id: 'packed', read: () => '{"ready":true}' }],
  parse: (contents) => JSON.parse(contents),
  validate: (candidate) =>
    candidate && candidate.ready === true
      ? { valid: true, value: { ready: true } }
      : { valid: false, issues: ['ready must be true'] },
  stageTimeoutMs: 1_000,
}).then((result) => {
  if (!result.ok || result.value.ready !== true || !Object.isFrozen(result.value)) {
    throw new Error('CommonJS Nebula config-loader smoke test failed.');
  }
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
${uiGoldenPathRuntimeSmoke('CommonJS')}
`,
  );
  writeFileSync(
    join(fixtureDirectory, 'smoke.ts'),
    `${moduleSpecifiers.map((specifier, index) => `import * as packedModule${index} from '${specifier}';`).join('\n')}
import { type AppConfig, Cmd, Sub, text } from '@celestial/core';
import { type AriaAttrs, createActionRegistry } from '@celestial/core/nebula';
import {
  createHistory,
  createRouter,
  createScreenStack,
  currentLocation,
  currentScreen as currentCompassScreen,
  parseUrl,
  screenStackUpdate,
  type RouterConfig,
} from '@celestial/compass';
import { loadConfig, type ConfigValidation } from '@celestial/nebula';
import {
  actionCommands,
  actionKeyBindings,
  createAppShell,
  createNotificationCenter,
  createNotificationStore,
  createToastManager,
  helpView,
  keyMap,
  modal,
  statusBar,
  type KeyBinding,
} from '@celestial/ui';
import { createTestApp } from '@celestial/test';
import '@celestial/test/vitest';
import * as horizon from '@celestial/horizon';

type Message = { type: 'quit' };
const config: AppConfig<null, Message> = {
  init: () => [null, Cmd.none()],
  update: (_message, model) => [model, Cmd.none()],
  view: () => text('ready'),
  subscriptions: () => Sub.key('q', { type: 'quit' }),
};
const surface = modal({ title: 'Ready', content: text('ready') });
const binding: KeyBinding<Message> = { key: 'q', msg: { type: 'quit' }, description: 'Quit' };
const mappedKeys = keyMap([binding]);
const keyboardHelp = helpView([binding]);
const status = statusBar({ left: [{ text: 'READY', mode: true }] });
const compassConfig = {
  routes: [
    { id: 'home', pattern: '/' },
    { id: 'user', pattern: '/users/:id' },
  ],
  initialLocation: '/',
} as const satisfies RouterConfig<'home' | 'user'>;
const compassRouter = createRouter(compassConfig);
const compassResolution = compassRouter.resolve(compassRouter.init('/users/packed'));
const compassHistory = createHistory(parseUrl('/packed?source=tarball'));
const compassLocation = currentLocation(compassHistory);
let compassScreens = createScreenStack<'home' | 'confirm'>({ id: 'home' });
compassScreens = screenStackUpdate({ type: 'screen:push', id: 'confirm', modal: true }, compassScreens);
const compassScreen = currentCompassScreen(compassScreens);
const notificationStore = createNotificationStore();
const notifications = notificationStore.init();
const notificationCenter = createNotificationCenter({
  store: notificationStore,
  ownsToastEscape: false,
  formatTimestamp: (timestamp) => String(timestamp),
  resolveAction: (actionId) => ({ label: actionId }),
});
const notificationCenterState = notificationCenter.init(notifications);
const shellRegistry = createActionRegistry<{ readonly ready: boolean }, { readonly type: 'packed-action' }>([
  {
    id: 'packed.action',
    title: 'Packed action',
    when: (model) => model.ready,
    run: () => ({ type: 'packed-action' }),
  },
]);
const packedActionBindings = actionKeyBindings(shellRegistry, { ready: true }, {
  toMsg: (actionId) => ({ type: 'packed-action-request' as const, actionId }),
});
const toastManager = createToastManager({ store: notificationStore, dismissalOwner: 'host' });
const toastProjection = toastManager.project(notifications);
const appShell = createAppShell({
  registry: shellRegistry,
  notificationStore,
  formatTimestamp: (timestamp) => String(timestamp),
  canUseGlobalShortcuts: () => true,
});
const appShellModel = appShell.init({ ready: true });
interface PackedConfig {
  readonly ready: boolean;
}
const packedConfigLoad = loadConfig<PackedConfig>({
  precedence: 'first-listed-wins',
  sources: [{ id: 'packed', read: () => '{"ready":true}' }],
  parse: (contents) => JSON.parse(contents) as unknown,
  validate: (candidate): ConfigValidation<PackedConfig> =>
    candidate !== null &&
    typeof candidate === 'object' &&
    'ready' in candidate &&
    candidate.ready === true
      ? { valid: true, value: { ready: true } }
      : { valid: false, issues: ['ready must be true'] },
  stageTimeoutMs: 1_000,
});
const disabledMenuitem: AriaAttrs = { role: 'menuitem', label: 'Unavailable', disabled: true };
const handle = createTestApp(config);
handle.stop();
void surface;
void actionCommands;
void mappedKeys;
void keyboardHelp;
void status;
void compassResolution;
void compassLocation;
void compassScreen;
void notifications;
void notificationCenterState;
void packedActionBindings;
void toastProjection;
void appShellModel;
void packedConfigLoad;
void disabledMenuitem;
void horizon;
void [${moduleSpecifiers.map((_specifier, index) => `packedModule${index}`).join(', ')}];
`,
  );
  writeFileSync(
    join(fixtureDirectory, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          skipLibCheck: false,
          noEmit: true,
        },
        include: ['smoke.ts'],
      },
      null,
      2,
    )}\n`,
  );

  run('node', ['smoke.mjs'], { cwd: fixtureDirectory });
  run('node', ['smoke.cjs'], { cwd: fixtureDirectory });
  run('pnpm', ['exec', 'tsc', '--noEmit', '-p', join(fixtureDirectory, 'tsconfig.json')]);

  console.log(`Preview package smoke test passed for ${tarballs.length} tarballs and ${moduleSpecifiers.length} export surfaces.`);
  if (keep || requestedOutput) console.log(`Artifacts: ${temporaryRoot}`);
} finally {
  if (ownsTemporaryRoot && !keep) rmSync(temporaryRoot, { recursive: true, force: true });
}
