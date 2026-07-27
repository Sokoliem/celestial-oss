import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { currentScreen } from '@celestial/compass';
import { createSessionStore, saveSession } from '@celestial/horizon';
import { createScreen, createTestApp, fireMouse, renderToLines, type TestAppHandle } from '@celestial/test';
import * as ui from '@celestial/ui';
import { applyVariant, defaultTheme, validateThemeContrast } from '@celestial/core/corona';
import { createThemeContext } from '@celestial/core/nebula';
import { afterEach, describe, expect, it } from 'vitest';
import { createCelestialShowcaseApp, SHOWCASE_MIN_COLS, SHOWCASE_MIN_ROWS } from '../app.js';
import {
  appShellLabPaletteWindow,
  loadAppShellLabConfig,
  projectAppShellLabToasts,
} from '../app-shell-lab.js';
import {
  createShowcaseComponents,
  GALLERY_PAGE_COUNT,
  initialComponentModels,
  renderComponentGallery,
  UI_BUILDER_COUNT,
  UI_BUILDER_NAMES,
} from '../components.js';
import { SHOWCASE_PACKAGE_COVERAGE, UI_BUILDER_COVERAGE, validateShowcaseCoverage } from '../coverage.js';
import {
  describeLocaleSupport,
  LOCALE_SAMPLE_COUNT,
  roundTripSession,
  VISUAL_PAGE_LABELS,
  viewportTier,
  WINDOW_PAGE_LABELS,
  WORKFLOW_PAGE_LABELS,
} from '../labs.js';
import type { CelestialShowcaseModel, CelestialShowcaseMsg, ShowcaseGalleryComponentMsg } from '../types.js';
import { SHOWCASE_LAB_THEMES } from '../themes.js';

function findText(frame: string, needle: string): { col: number; row: number } {
  const lines = frame.split('\n');
  const row = lines.findIndex((line) => line.includes(needle));
  if (row < 0) throw new Error(`Could not find ${needle} in frame:\n${frame}`);
  return { row, col: lines[row]!.indexOf(needle) };
}

function findLastText(frame: string, needle: string): { col: number; row: number } {
  const lines = frame.split('\n');
  let row = -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (!lines[index]!.includes(needle)) continue;
    row = index;
    break;
  }
  if (row < 0) throw new Error(`Could not find ${needle} in frame:\n${frame}`);
  return { row, col: lines[row]!.indexOf(needle) };
}

function timerIntervals(subscription: unknown): number[] {
  if (!subscription || typeof subscription !== 'object') return [];
  const kind = (subscription as { _kind?: { kind?: string; ms?: number; subs?: unknown[]; sub?: unknown } })._kind;
  if (!kind) return [];
  if (kind.kind === 'timer' && typeof kind.ms === 'number') return [kind.ms];
  if (kind.kind === 'batch') return (kind.subs ?? []).flatMap(timerIntervals);
  if (kind.sub) return timerIntervals(kind.sub);
  return [];
}

describe('Celestial Flight Deck', () => {
  const handles: Array<TestAppHandle<CelestialShowcaseModel, CelestialShowcaseMsg>> = [];

  function flightDeck(cols: number, rows: number) {
    const size = { cols, rows };
    const handle = createTestApp(createCelestialShowcaseApp({ initialSize: size, fast: true }), size);
    handles.push(handle);
    return handle;
  }

  afterEach(() => {
    for (const handle of handles.splice(0)) handle.stop();
  });

  it('keeps the public package and curated builder coverage ledger complete and unique', () => {
    expect(validateShowcaseCoverage()).toEqual([]);
    expect(new Set(SHOWCASE_PACKAGE_COVERAGE.map((entry) => entry.packageName)).size).toBe(SHOWCASE_PACKAGE_COVERAGE.length);
    expect(UI_BUILDER_COVERAGE.map((entry) => entry.name)).toEqual(UI_BUILDER_NAMES);
    expect(UI_BUILDER_COVERAGE.filter((entry) => entry.evidence === 'interactive').length).toBeGreaterThan(30);
  });

  it('assigns every lab a distinct, contrast-safe tokenized theme and exposes the active theme', async () => {
    const entries = Object.entries(SHOWCASE_LAB_THEMES);
    expect(entries).toHaveLength(9);
    expect(new Set(entries.map(([, entry]) => entry.variant.name)).size).toBe(entries.length);

    const accentColors = entries.map(([, entry]) => {
      const theme = applyVariant(defaultTheme, entry.variant);
      expect(validateThemeContrast(theme).pass, entry.label).toBe(true);
      return theme.colors.tones.accent.rgb?.join(',') ?? theme.colors.tones.accent.fg();
    });
    expect(new Set(accentColors).size).toBe(entries.length);

    const handle = flightDeck(140, 42);
    for (const [lab, entry] of entries) {
      handle.dispatch({ type: 'switch-lab', lab: lab as keyof typeof SHOWCASE_LAB_THEMES });
      await handle.waitForUpdate();
      expect(handle.lastFrame()).toContain(`${entry.label} theme`);
      expect(handle.snapshot().audit.violations.filter((violation) => violation.rule === 'color-contrast'), entry.label).toEqual([]);
    }
  });

  it('renders every curated builder through every Flight Deck theme at compact and wide widths', () => {
    const seed = flightDeck(140, 48).model;

    for (const [, entry] of Object.entries(SHOWCASE_LAB_THEMES)) {
      const themeCtx = createThemeContext();
      themeCtx.setVariant(entry.variant);
      const components = createShowcaseComponents(themeCtx);
      const componentModels = initialComponentModels(components);

      for (const width of [SHOWCASE_MIN_COLS, 140]) {
        const renderedPages: string[] = [];
        for (let componentPage = 0; componentPage < GALLERY_PAGE_COUNT; componentPage += 1) {
          const model = {
            ...seed,
            ...componentModels,
            galleryContextMenu: { ...componentModels.galleryContextMenu, open: false },
            cols: width,
            rows: 48,
            componentPage,
          };
          const frame = renderToLines(renderComponentGallery(components, model), { width, height: 48 }).join('\n');
          expect(frame.length, `${entry.label} page ${componentPage + 1} at ${width} columns`).toBeGreaterThan(0);
          renderedPages.push(frame);
        }

        const completeGallery = renderedPages.join('\n');
        for (const builder of UI_BUILDER_NAMES) {
          expect(completeGallery, `${builder} under ${entry.label} at ${width} columns`).toContain(builder);
        }
      }
    }
  });

  it('loads the deterministic app-shell config with an explicit source receipt', async () => {
    const result = await loadAppShellLabConfig();

    expect(result).toMatchObject({
      ok: true,
      sourceId: 'workspace-config',
      checkedSources: ['project-config', 'workspace-config'],
      value: {
        profile: 'preview',
        verificationChecks: 2,
      },
    });
  });

  it('treats a malformed highest-priority app-shell config as terminal', async () => {
    let lowerReads = 0;
    const result = await loadAppShellLabConfig([
      {
        id: 'project-config',
        read: () => '{"profile":',
      },
      {
        id: 'workspace-config',
        read: () => {
          lowerReads += 1;
          return '{"profile":"preview","verificationChecks":2}';
        },
      },
    ]);

    expect(result).toMatchObject({
      ok: false,
      sourceId: 'project-config',
      checkedSources: ['project-config'],
      diagnostics: [{ code: 'config-parse-failed' }],
    });
    expect(lowerReads).toBe(0);
  });

  // The ledger exists to prove coverage, so it has to be checked against the repo
  // rather than against itself. These two tests are what make the 18/47 counts in
  // coverage.ts derived facts instead of restated ones.
  it('matches the ledger against the public packages actually present in the workspace', () => {
    const packagesDir = fileURLToPath(new URL('../../../../packages/', import.meta.url));
    const onDisk = readdirSync(packagesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => JSON.parse(readFileSync(`${packagesDir}${entry.name}/package.json`, 'utf8')) as { name: string; private?: boolean })
      .filter((manifest) => manifest.private !== true)
      .map((manifest) => manifest.name);

    // Set equality both ways: a package added to the repo, removed from it, or renamed
    // must fail here rather than silently drifting from the ledger the demo renders.
    expect([...SHOWCASE_PACKAGE_COVERAGE.map((entry) => entry.packageName)].sort()).toEqual([...onDisk].sort());
  });

  it('matches every curated builder name against the real @celestial/ui export surface', () => {
    const exported = new Set(
      Object.entries(ui)
        .filter(([, value]) => typeof value === 'function')
        .map(([name]) => name),
    );
    for (const name of UI_BUILDER_NAMES) expect(exported).toContain(name);

    // contextMenuView is a real export that is deliberately kept out of the curated
    // builder count and covered instead by the '@celestial/ui' capability receipt
    // named 'context menu helper'. Pinning both halves keeps that intentional, so a
    // future builder cannot be dropped from the ledger by simply forgetting it.
    expect(exported).toContain('contextMenuView');
    expect([...UI_BUILDER_NAMES]).not.toContain('contextMenuView');
    expect(SHOWCASE_PACKAGE_COVERAGE.find((entry) => entry.packageName === '@celestial/ui')?.capabilities).toContain('context menu helper');
  });

  it('detects whether the runtime actually carries locale data for a sample', () => {
    expect(describeLocaleSupport('en-US').supported).toBe(true);

    // A well-formed tag with no data behaves exactly like the small-ICU failure mode:
    // Intl resolves it to the default locale and formats English while the panel still
    // claims the requested locale. The demo has to be able to say so.
    expect(describeLocaleSupport('xx-XX').supported).toBe(false);
  });

  it('reports runtime locale data availability in the Rosetta instrument', async () => {
    const handle = flightDeck(140, 48);
    handle.pressKey('1');
    await handle.waitForUpdate();
    handle.pressKey('l');
    await handle.waitForUpdate();

    // The receipt has to name the runtime's locale-data state either way, so an
    // English-only build is visibly distinguishable from working Rosetta output.
    expect(handle.lastFrame()).toContain('locale data');
    expect(handle.lastFrame()).toContain('full ICU data');
  });

  it('proves the Horizon session survived serialization rather than a same-tick read', async () => {
    const handle = flightDeck(140, 48);
    handle.pressKey('7');
    await handle.waitForUpdate();
    handle.pressKey(']');
    await handle.waitForUpdate();

    expect(handle.lastFrame()).toContain('session round trip');
    expect(handle.lastFrame()).toContain('restored via JSON');
  });

  it('round trips a saved workspace session through serialization', () => {
    const store = saveSession(createSessionStore(), {
      name: 'flight-deck',
      workspace: { layout: { tileAxis: 'columns' }, activeIndex: 0 },
      preview: { title: 'Flight Deck instruments', panes: 3 },
      savedAt: 1,
    });

    const restored = roundTripSession(store, 'flight-deck');
    expect(restored?.preview.panes).toBe(3);
    expect(restored?.workspace.activeIndex).toBe(0);

    // Equal in value but a distinct object: that gap is the proof it travelled through
    // serialization rather than being handed back from the same in-memory store. A
    // direct loadSession would return the identical reference and fail this.
    expect(restored).toEqual(store.sessions['flight-deck']);
    expect(restored).not.toBe(store.sessions['flight-deck']);

    // The failure path the same-tick save/load could never reach.
    expect(roundTripSession(store, 'missing')).toBeNull();
  });

  for (const size of [
    { cols: 70, rows: 32, marker: 'COMPACT / single' },
    { cols: 79, rows: 36, marker: 'COMPACT / single' },
    { cols: 80, rows: 36, marker: 'MEDIUM / split' },
    { cols: 100, rows: 36, marker: 'MEDIUM / split' },
    { cols: 119, rows: 36, marker: 'MEDIUM / split' },
    { cols: 120, rows: 42, marker: 'WIDE / floating' },
    { cols: 140, rows: 42, marker: 'WIDE / floating' },
  ]) {
    it(`renders an accessible ${viewportTier(size.cols)} shell at ${size.cols}x${size.rows}`, () => {
      const handle = flightDeck(size.cols, size.rows);
      const frame = handle.lastFrame();

      expect(frame).toContain('CELESTIAL FLIGHT DECK');
      expect(frame).toContain(size.marker);
      expect(frame).toContain('Atlas + Corona');
      expect(frame).toContain('Aurora + Nebula');
      expect(frame).toContain('Gravity + Nexus');
      expect(frame).toContain('9 App shell');
      expect(handle.snapshot().audit.violations.filter((violation) => violation.severity === 'error')).toEqual([]);
      expect(handle.snapshot().audit.violations.filter((violation) => violation.rule === 'color-contrast')).toEqual([]);
    });
  }

  it('shows a resize-required view below the supported viewport and restores preserved state', async () => {
    const handle = flightDeck(SHOWCASE_MIN_COLS, SHOWCASE_MIN_ROWS);
    const screen = createScreen(handle);
    handle.pressKey('2');
    await handle.waitForUpdate();
    handle.dispatch({ type: 'component-page', page: 6 });

    screen.fireResize(SHOWCASE_MIN_COLS - 10, SHOWCASE_MIN_ROWS - 8);
    expect(handle.lastFrame()).toContain('Resize required');
    expect(handle.lastFrame()).toContain(`minimum ${SHOWCASE_MIN_COLS}x${SHOWCASE_MIN_ROWS}`);
    expect(handle.model.activeLab).toBe('components');
    expect(handle.model.componentPage).toBe(6);

    screen.fireResize(SHOWCASE_MIN_COLS, SHOWCASE_MIN_ROWS);
    expect(handle.lastFrame()).toContain('Feedback and layers - 8 builders');
    expect(handle.model.activeLab).toBe('components');
    expect(handle.model.componentPage).toBe(6);
  });

  it('keeps long lab and status copy complete at the minimum width', async () => {
    const handle = flightDeck(SHOWCASE_MIN_COLS, 40);

    expect(handle.lastFrame()).toContain('namespaces.');
    for (const [lab, tail] of [
      ['workflows', 'model.'],
      ['visuals', 'lane.'],
      ['mouse', 'propagation.'],
      ['layers', 'surface.'],
      ['windows', 'windows.'],
      ['smoke', 'Help button.'],
      ['app-shell', 'Diagnostics: none'],
    ] as const) {
      handle.dispatch({ type: 'switch-lab', lab });
      await handle.waitForUpdate();
      expect(handle.lastFrame()).toContain(tail);
    }

    handle.dispatch({ type: 'window-action', id: 'telemetry', action: 'maximize' });
    expect(handle.lastFrame()).toContain('telemetry.');
  });

  it('keeps every paged capability instrument reachable at the minimum viewport', () => {
    const handle = flightDeck(SHOWCASE_MIN_COLS, SHOWCASE_MIN_ROWS);
    const expectReachable = (needle: string) => {
      expect(handle.lastFrame()).toContain(needle);
      expect(handle.snapshot().audit.violations.filter((violation) => violation.severity === 'error')).toEqual([]);
    };

    handle.dispatch({ type: 'core-page', page: 'locale' });
    expectReachable('Next locale');
    handle.dispatch({ type: 'core-page', page: 'ledger' });
    expectReachable('Next ledger');

    handle.dispatch({ type: 'switch-lab', lab: 'workflows' });
    handle.dispatch({ type: 'workflow-page', delta: 1 });
    expectReachable('Cycle validation sample');
    handle.dispatch({ type: 'workflow-page', delta: 1 });
    expectReachable('Cycle prompt outcome');

    handle.dispatch({ type: 'switch-lab', lab: 'visuals' });
    handle.dispatch({ type: 'visual-page', delta: 1 });
    expectReachable('Cycle transition and effects');
    handle.dispatch({ type: 'visual-page', delta: 1 });
    expectReachable('Shift live dataset');
    handle.dispatch({ type: 'visual-page', delta: 1 });
    expectReachable('PULSAR DOCUMENT INSTRUMENT');

    handle.dispatch({ type: 'switch-lab', lab: 'windows' });
    handle.dispatch({ type: 'window-page', delta: 1 });
    expectReachable('Cycle snap zone and tile axis');
  });

  it.each([
    ['modal', 'boundary.'],
    ['confirm', 'verified?'],
    ['tooltip', 'dismissible.'],
    ['palette', 'close'],
    ['toast', 'base.'],
    ['drawer', 'dismissal'],
  ] as const)('retains the complete %s surface after resizing to the minimum viewport', async (surface, tail) => {
    const handle = flightDeck(100, 36);
    const screen = createScreen(handle);
    handle.dispatch({ type: 'open-surface', surface });
    await handle.waitForUpdate();

    screen.fireResize(SHOWCASE_MIN_COLS, SHOWCASE_MIN_ROWS);
    expect(handle.lastFrame()).toContain(tail);
    expect(handle.model.cols).toBe(SHOWCASE_MIN_COLS);
    expect(handle.model.rows).toBe(SHOWCASE_MIN_ROWS);
  });

  it('drives real Compass history and screen state through the coordinated app shell', async () => {
    const handle = flightDeck(100, 40);
    handle.pressKey('9');
    await handle.waitForUpdate();

    expect(handle.model.activeLab).toBe('app-shell');
    expect(handle.lastFrame()).toContain('Route receipt: /overview -> overview');
    expect(handle.lastFrame()).toContain('Diagnostics: none');
    expect(handle.model.appShellLab.router.history.entries).toHaveLength(1);
    expect(currentScreen(handle.model.appShellLab.screens).id).toBe('overview');

    handle.pressKey('j');
    await handle.waitForUpdate();
    expect(handle.model.appShellLab.router.history.entries).toHaveLength(2);
    expect(
      handle.model.appShellLab.router.history.entries[
        handle.model.appShellLab.router.history.index
      ]?.href,
    ).toBe('/jobs/flight-42?view=queue');
    expect(currentScreen(handle.model.appShellLab.screens)).toMatchObject({
      id: 'jobs',
      params: { href: '/jobs/flight-42?view=queue' },
    });
    expect(handle.model.completed.has('app-shell')).toBe(true);

    handle.pressKey('b');
    await handle.waitForUpdate();
    expect(
      handle.model.appShellLab.router.history.entries[
        handle.model.appShellLab.router.history.index
      ]?.href,
    ).toBe('/overview');
    expect(currentScreen(handle.model.appShellLab.screens).id).toBe('overview');
  });

  it('projects live shell status and supports an enabled Jobs and Back pointer round trip', async () => {
    const handle = flightDeck(100, 40);
    handle.pressKey('9');
    await handle.waitForUpdate();

    const statusLabel = () =>
      handle.snapshot().elements.find(
        (element) =>
          element.role === 'status'
          && element.a11y?.label?.startsWith('Status: APP SHELL'),
      )?.a11y?.label;

    expect(statusLabel()).toContain('/overview');
    expect(statusLabel()).toContain('1 idle');
    expect(statusLabel()).toContain('1 unread');

    const jobs = findText(handle.lastFrame(), '[Jobs]');
    handle.click(jobs.col + 1, jobs.row);
    await handle.waitForUpdate();
    expect(currentScreen(handle.model.appShellLab.screens).id).toBe('jobs');
    expect(statusLabel()).toContain('/jobs/flight-42?view=queue');

    const back = findText(handle.lastFrame(), '[Back]');
    handle.click(back.col + 1, back.row);
    await handle.waitForUpdate();
    expect(currentScreen(handle.model.appShellLab.screens).id).toBe('overview');
    expect(statusLabel()).toContain('/overview');
  });

  it.each([
    ['compact', SHOWCASE_MIN_COLS, SHOWCASE_MIN_ROWS],
    ['medium', 100, 40],
    ['wide', 140, 42],
  ] as const)(
    'keeps the app-shell base and blocking surfaces accessible at the %s breakpoint',
    async (_tier, cols, rows) => {
      const handle = flightDeck(cols, rows);
      handle.pressKey('9');
      await handle.waitForUpdate();

      const expectAccessible = (dialogLabel?: string) => {
        const snapshot = handle.snapshot();
        if (dialogLabel !== undefined) {
          expect(
            snapshot.elements.some(
              (element) =>
                element.role === 'dialog'
                && element.a11y?.label === dialogLabel,
            ),
          ).toBe(true);
        }
        expect(
          snapshot.audit.violations.filter(
            (violation) => violation.severity === 'error',
          ),
        ).toEqual([]);
        expect(
          snapshot.audit.violations.filter(
            (violation) => violation.rule === 'color-contrast',
          ),
        ).toEqual([]);
      };

      expectAccessible();
      handle.pressKey('i');
      await handle.waitForUpdate();
      expectAccessible('Shared notification center');
      handle.pressKey('escape');
      await handle.waitForUpdate();

      handle.pressKey('?');
      await handle.waitForUpdate();
      expectAccessible('CANONICAL KEYBOARD HELP');
      handle.pressKey('escape');
      await handle.waitForUpdate();

      handle.pressKey('p', { ctrl: true });
      await handle.waitForUpdate();
      expectAccessible('ACTION PALETTE');
      handle.pressKey('escape');
      await handle.waitForUpdate();

      handle.pressKey('x');
      await handle.waitForUpdate();
      expectAccessible('MODAL CONFIRMATION');
    },
  );

  it('projects one shell registry into palette, canonical help, modal receipts, status, inbox, and toasts', async () => {
    const handle = flightDeck(100, 40);
    handle.pressKey('9');
    await handle.waitForUpdate();

    handle.pressKey('p', { ctrl: true });
    await handle.waitForUpdate();
    expect(handle.model.appShellLab.shell.palette.open).toBe(true);
    expect(handle.lastFrame()).toContain('Type to filter; use the wheel or arrow keys to navigate.');
    handle.pressKey('escape');
    await handle.waitForUpdate();
    expect(handle.model.appShellLab.shell.palette.open).toBe(false);

    handle.pressKey('?');
    await handle.waitForUpdate();
    expect(handle.model.appShellLab.shell.helpOpen).toBe(true);
    expect(handle.lastFrame()).toContain('CANONICAL KEYBOARD HELP');
    expect(handle.lastFrame()).toContain('Open job queue');
    handle.pressKey('escape');
    await handle.waitForUpdate();
    expect(handle.model.appShellLab.shell.helpOpen).toBe(false);

    handle.pressKey('x');
    await handle.waitForUpdate();
    expect(handle.model.appShellLab.shell.confirm?.id).toBe('release-preview');
    expect(currentScreen(handle.model.appShellLab.screens)).toMatchObject({
      id: 'release-confirm',
      modal: true,
    });
    expect(handle.lastFrame()).toContain('Use Tab or arrow keys to move');

    handle.pressKey('enter');
    await handle.waitForUpdate();
    expect(handle.model.appShellLab.shell.confirm).toBeNull();
    expect(handle.model.appShellLab.releaseApproved).toBe(true);
    expect(handle.model.appShellLab.screens.lastDismissal).toMatchObject({
      screen: { id: 'release-confirm', modal: true },
      result: true,
    });

    const projected = projectAppShellLabToasts(handle.model.appShellLab);
    expect(projected.entries.map((entry) => entry.id)).toEqual(
      handle.model.appShellLab.shell.notifications.entries.map(
        (entry) => entry.id,
      ),
    );
    expect(
      projected.toasts.some(
        (entry) =>
          entry.message === 'Release approved from the modal receipt.',
      ),
    ).toBe(true);

    handle.pressKey('i');
    await handle.waitForUpdate();
    expect(handle.model.appShellLab.shell.notificationCenter.open).toBe(true);
    expect(handle.lastFrame()).toContain('Shared notification center');
    expect(handle.lastFrame()).toContain('Release approved from');
    handle.pressKey('escape');
    await handle.waitForUpdate();
    expect(handle.model.appShellLab.shell.notificationCenter.open).toBe(false);
  });

  it('records only truthful app-shell interaction receipts and rejects hidden palette dispatch', async () => {
    const handle = flightDeck(100, 40);
    handle.pressKey('9');
    await handle.waitForUpdate();

    expect(handle.model.evidence.appShellActions).toBe(0);
    expect(handle.model.appShellLab.evidenceVersion).toBe(0);
    expect(handle.model.lastAction).toBe('Opened app-shell lab.');

    handle.pressKey('escape');
    await handle.waitForUpdate();
    expect(handle.model.appShellLab.shell.notifications.visibleToastIds).toEqual([]);
    expect(handle.model.evidence.appShellActions).toBe(1);
    expect(handle.model.lastAction).toBe('Dismissed the latest shared toast.');

    const afterDismiss = handle.model.evidence.appShellActions;
    handle.pressKey('escape');
    await handle.waitForUpdate();
    expect(handle.model.evidence.appShellActions).toBe(afterDismiss);
    expect(handle.model.lastAction).toBe('Dismissed the latest shared toast.');

    handle.pressKey('p', { ctrl: true });
    await handle.waitForUpdate();
    const afterOpen = handle.model.evidence.appShellActions;
    const filteredIds = handle.model.appShellLab.shell.palette.filteredIds;
    expect(filteredIds.length).toBeGreaterThan(0);

    handle.dispatch({
      type: 'app-shell-lab',
      msg: {
        type: 'shell',
        msg: {
          type: 'shell-palette-select-at',
          index: filteredIds.length + 10,
        },
      },
    });
    await handle.waitForUpdate();

    expect(handle.model.appShellLab.shell.palette.open).toBe(true);
    expect(currentScreen(handle.model.appShellLab.screens).id).toBe('overview');
    expect(handle.model.evidence.appShellActions).toBe(afterOpen);
    expect(handle.model.lastAction).toBe('Opened the coordinated action palette.');
  });

  it('keeps the palette selection visible and gives palette and help real pointer close controls', async () => {
    const handle = flightDeck(100, 40);
    handle.pressKey('9');
    await handle.waitForUpdate();

    const overview = findText(handle.lastFrame(), '[Overview]');
    handle.pressKey('p', { ctrl: true });
    await handle.waitForUpdate();

    const paletteSnapshot = handle.snapshot();
    expect(
      paletteSnapshot.actions.some((action) => action.label === 'Overview'),
    ).toBe(false);
    expect(
      paletteSnapshot.actions.some((action) => action.label === 'Close'),
    ).toBe(true);

    handle.click(overview.col + 1, overview.row);
    await handle.waitForUpdate();
    expect(handle.model.appShellLab.shell.palette.open).toBe(false);
    expect(currentScreen(handle.model.appShellLab.screens).id).toBe('overview');

    handle.pressKey('p', { ctrl: true });
    await handle.waitForUpdate();
    for (let index = 0; index < 8; index += 1) {
      handle.pressKey('down');
      await handle.waitForUpdate();
    }
    const window = appShellLabPaletteWindow(handle.model.appShellLab);
    expect(handle.model.appShellLab.shell.palette.selectedIndex).toBe(8);
    expect(window).toEqual({ start: 1, end: 9 });
    expect(handle.lastFrame()).toContain('Showing 2-9 of 10 | selected 9');
    expect(handle.lastFrame()).not.toContain('Open overview screen');

    const paletteClose = findText(handle.lastFrame(), '[Close]');
    handle.click(paletteClose.col + 1, paletteClose.row);
    await handle.waitForUpdate();
    expect(handle.model.appShellLab.shell.palette.open).toBe(false);

    handle.pressKey('p', { ctrl: true });
    await handle.waitForUpdate();
    const jobs = findText(handle.lastFrame(), 'Open job queue');
    fireMouse(handle.terminal, {
      type: 'move',
      col: jobs.col + 1,
      row: jobs.row,
    });
    await handle.waitForUpdate();
    expect(handle.model.appShellLab.shell.palette.selectedIndex).toBe(1);
    handle.click(jobs.col + 1, jobs.row);
    await handle.waitForUpdate();
    expect(handle.model.appShellLab.shell.palette.open).toBe(false);
    expect(currentScreen(handle.model.appShellLab.screens).id).toBe('jobs');

    handle.pressKey('?');
    await handle.waitForUpdate();
    expect(handle.model.appShellLab.shell.helpOpen).toBe(true);
    const helpClose = findText(handle.lastFrame(), '[Close]');
    handle.click(helpClose.col + 1, helpClose.row);
    await handle.waitForUpdate();
    expect(handle.model.appShellLab.shell.helpOpen).toBe(false);
  });

  it('removes toast roles and pointer targets beneath every blocking app-shell dialog at 70x32', async () => {
    const handle = flightDeck(SHOWCASE_MIN_COLS, SHOWCASE_MIN_ROWS);
    handle.pressKey('9');
    await handle.waitForUpdate();

    const initial = handle.snapshot();
    const toastClose = initial.elements.find(
      (element) =>
        element.role === 'button'
        && element.a11y?.label?.startsWith('Dismiss App shell ready'),
    );
    const toastAction = initial.elements.find(
      (element) =>
        element.role === 'button'
        && element.a11y?.label === 'Open job queue',
    );
    expect(toastClose).toBeDefined();
    expect(toastAction).toBeDefined();
    const expectBlockedDialog = (
      label: string,
      expectedJobActions: number,
    ) => {
      const snapshot = handle.snapshot();
      const dialog = snapshot.elements.find(
        (element) =>
          element.role === 'dialog'
          && element.a11y?.label === label,
      );
      expect(dialog).toBeDefined();
      expect(
        snapshot.elements.some(
          (element) =>
            element.role === 'status'
            && element.a11y?.label?.startsWith('info: App shell ready'),
        ),
      ).toBe(false);
      expect(
        snapshot.elements.some(
          (element) =>
            element.role === 'button'
            && element.a11y?.label?.startsWith('Dismiss App shell ready'),
        ),
      ).toBe(false);
      expect(
        snapshot.actions.some((action) => action.label === '[x]'),
      ).toBe(false);

      const jobActions = snapshot.elements.filter(
        (element) =>
          (element.role === 'button' || element.role === 'menuitem')
          && element.a11y?.label === 'Open job queue',
      );
      expect(jobActions).toHaveLength(expectedJobActions);
      for (const action of jobActions) {
        expect(action.col).toBeGreaterThanOrEqual(dialog!.col);
        expect(action.col + action.width).toBeLessThanOrEqual(
          dialog!.col + dialog!.width,
        );
        expect(action.row).toBeGreaterThanOrEqual(dialog!.row);
        expect(action.row + action.height).toBeLessThanOrEqual(
          dialog!.row + dialog!.height,
        );
      }
    };

    const clickSuppressedToastTargets = async (
      expectedScreen: 'overview' | 'release-confirm',
    ) => {
      expect(currentScreen(handle.model.appShellLab.screens).id).toBe(
        expectedScreen,
      );
    };

    handle.pressKey('p', { ctrl: true });
    await handle.waitForUpdate();
    expectBlockedDialog('ACTION PALETTE', 1);
    await clickSuppressedToastTargets('overview');
    expect(handle.model.appShellLab.shell.palette.open).toBe(true);
    handle.pressKey('escape');
    await handle.waitForUpdate();

    handle.pressKey('?');
    await handle.waitForUpdate();
    expectBlockedDialog('CANONICAL KEYBOARD HELP', 0);
    await clickSuppressedToastTargets('overview');
    expect(handle.model.appShellLab.shell.helpOpen).toBe(true);
    handle.pressKey('escape');
    await handle.waitForUpdate();

    handle.pressKey('i');
    await handle.waitForUpdate();
    expectBlockedDialog('Shared notification center', 0);
    await clickSuppressedToastTargets('overview');
    expect(handle.model.appShellLab.shell.notificationCenter.open).toBe(true);
    handle.pressKey('escape');
    await handle.waitForUpdate();

    handle.pressKey('x');
    await handle.waitForUpdate();
    expectBlockedDialog('MODAL CONFIRMATION', 0);
    await clickSuppressedToastTargets('release-confirm');
    expect(handle.model.appShellLab.shell.confirm?.id).toBe('release-preview');
  });

  it('makes the persistent 70x32 toast close and action pointer-operable without covering controls', async () => {
    const handle = flightDeck(SHOWCASE_MIN_COLS, SHOWCASE_MIN_ROWS);
    handle.pressKey('9');
    await handle.waitForUpdate();

    const snapshot = handle.snapshot();
    const toastStatus = snapshot.elements.find(
      (element) =>
        element.role === 'status'
        && element.a11y?.label?.startsWith('info: App shell ready'),
    );
    expect(toastStatus).toBeDefined();
    for (const label of ['Overview', 'Jobs', 'Confirm', 'Start task', 'Notify', 'Inbox', 'Keys', 'Palette']) {
      const control = snapshot.elements.find(
        (element) => element.role === 'button' && element.a11y?.label === label,
      );
      expect(control).toBeDefined();
      expect(
        control!.col < toastStatus!.col + toastStatus!.width
        && control!.col + control!.width > toastStatus!.col
        && control!.row < toastStatus!.row + toastStatus!.height
        && control!.row + control!.height > toastStatus!.row,
      ).toBe(false);
    }
    expect(
      snapshot.elements.some(
        (element) =>
          element.role === 'button'
          && element.a11y?.label?.startsWith('Dismiss App shell ready'),
      ),
    ).toBe(true);
    expect(
      snapshot.actions.some((action) => action.label === '[x]'),
    ).toBe(true);
    expect(
      snapshot.actions.some((action) => action.label === 'Open job queue'),
    ).toBe(true);

    const action = findText(handle.lastFrame(), '[Open job queue]');
    handle.click(action.col + 1, action.row);
    await handle.waitForUpdate();
    expect(currentScreen(handle.model.appShellLab.screens).id).toBe('jobs');
    expect(handle.model.appShellLab.shell.notifications.visibleToastIds).toEqual([]);
    expect(handle.model.appShellLab.shell.notifications.entries).toHaveLength(1);

    handle.pressKey('n');
    await handle.waitForUpdate();
    const entryCount = handle.model.appShellLab.shell.notifications.entries.length;
    const close = findText(handle.lastFrame(), '[x]');
    handle.click(close.col + 1, close.row);
    await handle.waitForUpdate();
    expect(handle.model.appShellLab.shell.notifications.visibleToastIds).toEqual([]);
    expect(handle.model.appShellLab.shell.notifications.entries).toHaveLength(entryCount);
    expect(handle.model.lastAction).toBe('Dismissed the latest shared toast.');
  });

  it('keeps disabled Back and Cancel controls inert and unavailable to automation', async () => {
    const handle = flightDeck(SHOWCASE_MIN_COLS, SHOWCASE_MIN_ROWS);
    handle.pressKey('9');
    await handle.waitForUpdate();

    const initial = handle.snapshot();
    for (const label of ['Back', 'Cancel task']) {
      const element = initial.elements.find(
        (candidate) =>
          candidate.role === 'button'
          && candidate.a11y?.label === label,
      );
      expect(element).toMatchObject({ disabled: true });
      expect(initial.actions.some((action) => action.label === label)).toBe(false);
    }

    const evidence = handle.model.evidence.appShellActions;
    const back = findText(handle.lastFrame(), '[Back disabled]');
    handle.click(back.col + 1, back.row);
    await handle.waitForUpdate();
    handle.pressKey('b');
    await handle.waitForUpdate();
    expect(currentScreen(handle.model.appShellLab.screens).id).toBe('overview');
    expect(handle.model.evidence.appShellActions).toBe(evidence);

    const cancel = findText(handle.lastFrame(), '[Cancel task disabled]');
    handle.click(cancel.col + 1, cancel.row);
    await handle.waitForUpdate();
    handle.pressKey('c');
    await handle.waitForUpdate();
    expect(
      handle.model.appShellLab.shell.tasks.find(
        (task) => task.id === 'app-shell-preview-validation',
      )?.state.status,
    ).toBe('idle');
    expect(handle.model.evidence.appShellActions).toBe(evidence);

    handle.pressKey('j');
    await handle.waitForUpdate();
    expect(
      handle.snapshot().actions.some((action) => action.label === 'Back'),
    ).toBe(true);
    handle.pressKey('s');
    await handle.waitForUpdate();
    expect(
      handle.snapshot().actions.some((action) => action.label === 'Cancel task'),
    ).toBe(true);
  });

  it('starts and cancels an actual background task without breaking the 70x32 surface', async () => {
    const handle = flightDeck(SHOWCASE_MIN_COLS, SHOWCASE_MIN_ROWS);
    handle.pressKey('9');
    await handle.waitForUpdate();

    expect(handle.lastFrame()).toContain('App shell ready: one entry powers');
    expect(handle.lastFrame()).toContain('[9 App shell]');
    expect(
      handle.snapshot().audit.violations.filter(
        (violation) => violation.severity === 'error',
      ),
    ).toEqual([]);

    handle.pressKey('escape');
    await handle.waitForUpdate();
    expect(handle.lastFrame()).toContain('Background task: idle');
    expect(
      handle.lastFrame().split('\n').find((line) => line.includes('completion')),
    ).toMatch(/completion \[░+\]/u);

    handle.pressKey('s');
    expect(
      handle.model.appShellLab.shell.tasks.find(
        (task) => task.id === 'app-shell-preview-validation',
      )?.state.status,
    ).toBe('running');
    handle.pressKey('escape');
    await handle.waitForUpdate();
    expect(handle.lastFrame()).toContain('Background task: running');
    expect(
      handle.lastFrame().split('\n').find((line) => line.includes('completion')),
    ).toMatch(/completion \[░+\]/u);

    handle.pressKey('c');
    await handle.waitForUpdate();
    expect(
      handle.model.appShellLab.shell.tasks.find(
        (task) => task.id === 'app-shell-preview-validation',
      )?.state.status,
    ).toBe('cancelled');
    handle.pressKey('escape');
    await handle.waitForUpdate();
    expect(handle.lastFrame()).toContain('Background task: cancelled');
    expect(handle.lastFrame()).toContain('Diagnostics: none');
  });

  it('applies workflow density to spacing and responsive composition', async () => {
    const handle = flightDeck(90, 42);
    handle.dispatch({ type: 'switch-lab', lab: 'workflows' });
    await handle.waitForUpdate();

    const balanced = handle.lastFrame();
    expect(balanced).toContain('Balanced density');
    expect(balanced).toContain('adds panel padding');

    const compactOption = findText(balanced, 'Compact');
    handle.click(compactOption.col + 1, compactOption.row);
    await handle.waitForUpdate();

    const compact = handle.lastFrame();
    expect(handle.model.schemaForm.values['density']).toBe('compact');
    expect(compact).toContain('Compact density');
    expect(compact).toContain('removes spacer rows');
    expect(compact).not.toBe(balanced);
  });

  it('exposes functional actions inside the drawer instead of placeholder rows', async () => {
    const handle = flightDeck(100, 40);
    handle.dispatch({ type: 'open-surface', surface: 'drawer' });
    await handle.waitForUpdate();

    expect(handle.lastFrame()).toContain('Interactive layer actions');
    const motion = findText(handle.lastFrame(), 'Toggle reduced motion');
    fireMouse(handle.terminal, { type: 'move', col: motion.col + 1, row: motion.row });
    expect(handle.model.drawer.hoveredActionId).toBe('workflow-toggle-motion');
    handle.click(motion.col + 1, motion.row);
    await handle.waitForUpdate();
    expect(handle.model.schemaForm.values['reducedMotion']).toBe(true);
    expect(handle.model.drawer.open).toBe(true);

    const modal = findText(handle.lastFrame(), 'Stack modal above drawer');
    handle.click(modal.col + 1, modal.row);
    await handle.waitForUpdate();
    expect(handle.model.modal.open).toBe(true);
    const modalLines = handle.lastFrame().split('\n');
    const modalTitleRow = modalLines.findIndex((line) => line.includes('Layer telemetry'));
    const modalTitle = modalLines[modalTitleRow];
    expect(modalTitle).toContain('[x]');
    handle.click(modalTitle!.lastIndexOf('[x]') + 1, modalTitleRow);
    await handle.waitForUpdate();
    expect(handle.model.modal.open).toBe(false);
    expect(handle.model.drawer.open).toBe(true);

    const confirm = findText(handle.lastFrame(), 'Stack confirmation above');
    handle.click(confirm.col + 1, confirm.row);
    await handle.waitForUpdate();
    expect(handle.model.drawer.open).toBe(true);
    expect(handle.model.confirm.open).toBe(true);
  });

  it.each([
    [SHOWCASE_MIN_COLS, SHOWCASE_MIN_ROWS],
    [140, 48],
  ] as const)('shows every curated UI builder and changes a component through its mouse region at %ix%i', async (cols, rows) => {
    const handle = flightDeck(cols, rows);
    handle.pressKey('2');
    await handle.waitForUpdate();

    expect(UI_BUILDER_COUNT).toBe(47);
    expect([...UI_BUILDER_NAMES]).toEqual(expect.arrayContaining(['indeterminateProgress', 'cardGrid', 'popoverGroup']));

    const builders = new Set<string>();
    for (let page = 0; page < GALLERY_PAGE_COUNT; page += 1) {
      const frame = handle.lastFrame();
      for (const builder of UI_BUILDER_NAMES) {
        if (frame.includes(`${builder}()`)) builders.add(builder);
      }
      expect(handle.snapshot().audit.violations.filter((violation) => violation.severity === 'error')).toEqual([]);
      if (page < GALLERY_PAGE_COUNT - 1) {
        handle.pressKey(']');
        await handle.waitForUpdate();
      }
    }
    expect([...builders].sort()).toEqual([...UI_BUILDER_NAMES].sort());

    handle.dispatch({ type: 'component-page', page: 0 });
    await handle.waitForUpdate();
    const checkbox = findText(handle.lastFrame(), 'Run headless checks');
    const checkedBefore = handle.model.checkbox.checked;
    handle.click(checkbox.col, checkbox.row);

    expect(handle.model.checkbox.checked).toBe(!checkedBefore);
    expect(handle.model.completed.has('component')).toBe(true);
  });

  it('persists state changes from every previously staged gallery descriptor', () => {
    const handle = flightDeck(140, 48);
    const dispatchGallery = (component: ShowcaseGalleryComponentMsg) => handle.dispatch({ type: 'gallery-component', component });
    const changesBefore = handle.model.evidence.componentChanges;

    dispatchGallery({ id: 'checkboxGroup', msg: { type: 'toggle-at', index: 1 } });
    dispatchGallery({ id: 'toggleGroup', msg: { type: 'toggle-at', index: 0 } });
    dispatchGallery({ id: 'autocomplete', msg: { type: 'select-at', index: 1 } });
    dispatchGallery({ id: 'combobox', msg: { type: 'char', char: '!' } });
    dispatchGallery({ id: 'datePicker', msg: { type: 'next-month' } });
    dispatchGallery({ id: 'multiSelect', msg: { type: 'toggle-at', index: 2 } });
    dispatchGallery({ id: 'numberInput', msg: { type: 'increment' } });
    dispatchGallery({ id: 'rangeSlider', msg: { type: 'set-low', value: 80 } });
    dispatchGallery({ id: 'rating', msg: { type: 'click', index: 1 } });
    dispatchGallery({ id: 'segmentedControl', msg: { type: 'select', index: 0 } });
    dispatchGallery({ id: 'tagInput', msg: { type: 'remove-tag', index: 0 } });
    dispatchGallery({ id: 'colorPicker', msg: { type: 'set-slider', field: 'hue', value: 200 } });
    dispatchGallery({ id: 'optionList', msg: { type: 'opt-click', id: 'beta' } });
    dispatchGallery({ id: 'cardGrid', msg: { type: 'hover-card', index: 0 } });
    dispatchGallery({ id: 'popover', msg: { type: 'toggle' } });
    dispatchGallery({ id: 'popoverGroup', msg: { type: 'toggle-at', index: 0 } });
    dispatchGallery({ id: 'hovercard', msg: { type: 'hover-enter' } });

    expect(handle.model.galleryModels.checkboxGroup.checked.has('pty')).toBe(true);
    expect(handle.model.galleryModels.toggleGroup.checked.has('mouse')).toBe(false);
    expect(handle.model.galleryModels.autocomplete.query).toBe('resize');
    expect(handle.model.galleryModels.combobox.inputBuffer).toBe('Stellar!');
    expect(handle.model.galleryModels.datePicker.viewMonth).toBe(8);
    expect(handle.model.galleryModels.multiSelect.selected.has(2)).toBe(true);
    expect(handle.model.galleryModels.numberInput.value).toBe(UI_BUILDER_COUNT + 1);
    expect(handle.model.galleryModels.rangeSlider.low).toBe(80);
    expect(handle.model.galleryModels.rating.value).toBe(2);
    expect(handle.model.galleryModels.segmentedControl.selected).toBe(0);
    expect(handle.model.galleryModels.tagInput.tags).toEqual(['mouse']);
    expect(handle.model.galleryModels.colorPicker.hsl.h).toBe(200);
    expect(handle.model.galleryModels.optionList.highlightedIndex).toBe(1);
    expect(handle.model.galleryModels.cardGrid.hoveredIndex).toBe(0);
    expect(handle.model.galleryModels.popover.visible).toBe(true);
    expect(handle.model.galleryModels.popoverGroup.activeIndex).toBe(0);
    expect(handle.model.galleryModels.hovercard.state).toBe('pending-show');
    expect(handle.model.evidence.componentChanges).toBe(changesBefore + 17);
    expect(handle.model.completed.has('component')).toBe(true);
  });

  it('routes hover, direct radio selection, slider positioning, and table multi-select through source regions', async () => {
    const handle = flightDeck(140, 48);
    handle.pressKey('2');
    await handle.waitForUpdate();

    const checkbox = findText(handle.lastFrame(), 'Run headless checks');
    fireMouse(handle.terminal, { type: 'move', col: checkbox.col, row: checkbox.row });
    expect(handle.model.checkbox.hovered).toBe(true);

    const textareaLine = findText(handle.lastFrame(), 'Adaptive by default');
    fireMouse(handle.terminal, { type: 'scroll', direction: 'up', col: textareaLine.col, row: textareaLine.row });
    expect(handle.model.textarea.manualScroll).toBe(true);
    expect(handle.lastFrame()).toContain('Mouse-first');

    const dense = findText(handle.lastFrame(), 'Dense');
    handle.click(dense.col, dense.row);
    expect(handle.model.radio.selected).toBe(2);

    const sliderElement = handle.snapshot().elements.find((element) => element.testId === 'Density');
    expect(sliderElement).toBeDefined();
    handle.click(sliderElement!.col + 'Density '.length, sliderElement!.row);
    expect(handle.model.slider.value).toBe(0);

    handle.dispatch({ type: 'component-page', page: 1 });
    await handle.waitForUpdate();
    const calendarDay = handle.snapshot().elements.find((element) => element.testId === 'date-2026-7-19');
    expect(calendarDay).toBeDefined();
    fireMouse(handle.terminal, { type: 'move', col: calendarDay!.col, row: calendarDay!.row });
    expect(handle.model.galleryModels.datePicker.hovered).toBe('day:19');

    handle.dispatch({ type: 'component-page', page: 2 });
    await handle.waitForUpdate();
    const compact = findText(handle.lastFrame(), 'Compact');
    fireMouse(handle.terminal, { type: 'move', col: compact.col, row: compact.row });
    expect(handle.model.galleryModels.segmentedControl.hovered).toBe(0);
    const unicodeTag = findText(handle.lastFrame(), 'unicode');
    fireMouse(handle.terminal, { type: 'move', col: unicodeTag.col, row: unicodeTag.row });
    expect(handle.model.galleryModels.tagInput.hoveredTag).toBe(0);

    handle.dispatch({ type: 'component-page', page: 3 });
    await handle.waitForUpdate();
    const previewCrumb = findText(handle.lastFrame(), 'Preview');
    fireMouse(handle.terminal, { type: 'move', col: previewCrumb.col, row: previewCrumb.row });
    expect(handle.model.breadcrumb.hoveredIndex).toBe(1);
    const celestialCrumb = findText(handle.lastFrame(), 'Celestial');
    handle.click(celestialCrumb.col, celestialCrumb.row);
    expect(handle.model.breadcrumb.selectedIndex).toBe(0);

    handle.dispatch({ type: 'component-page', page: 4 });
    await handle.waitForUpdate();
    const runtimeRow = findText(handle.lastFrame(), 'Elm runtime');
    const uiRow = findText(handle.lastFrame(), 'Curated UI');
    handle.click(runtimeRow.col, runtimeRow.row);
    handle.click(uiRow.col, uiRow.row);
    expect(handle.model.table.selectedKeys).toEqual(new Set(['runtime', 'components']));

    const testingRow = findText(handle.lastFrame(), 'Headless + PTY');
    handle.click(testingRow.col, testingRow.row, 'left', { shift: true });
    expect(handle.model.table.selectedKeys).toEqual(new Set(['components', 'windows', 'testing']));
    expect(handle.model.table.rangeSelectionKeys).toEqual(new Set(['components', 'windows', 'testing']));
    expect(handle.lastFrame()).toContain('range 2-4');

    const capabilityWidth = handle.model.table.columnWidths[0]!;
    const resizeHandle = handle.snapshot().elements.find(
      (element) => element.a11y?.role === 'separator' && element.a11y.label === 'Resize Capability',
    );
    expect(resizeHandle).toBeDefined();
    handle.drag(resizeHandle!.col, resizeHandle!.row, resizeHandle!.col + 4, resizeHandle!.row);
    await handle.waitForUpdate();
    expect(handle.model.table.columnWidths[0]).toBe(capabilityWidth + 4);
    expect(handle.model.table.columnResize).toBeNull();
  });

  it('routes live mouse coordinates through raw and semantic hit regions after a lab switch', async () => {
    const handle = flightDeck(70, 36);
    handle.pressKey('5');
    await handle.waitForUpdate();
    const target = findText(handle.lastFrame(), 'MOUSE TARGET');

    handle.click(target.col + 2, target.row + 2);

    expect(handle.model.pointer.clicks).toBe(1);
    expect(handle.model.pointer.target).toBe('click');
    expect(handle.model.completed.has('mouse-click')).toBe(true);
    expect(handle.messageCoverage().byType['raw-mouse']).toBeGreaterThan(0);
    expect(handle.messageCoverage().byType['element-mouse']).toBeGreaterThan(0);

    const source = findText(handle.lastFrame(), 'verification receipt');
    const dropTarget = findText(handle.lastFrame(), 'Drag the receipt here.');
    handle.drag(source.col + 2, source.row, dropTarget.col + 2, dropTarget.row);
    await handle.waitForUpdate();

    expect(handle.model.droppedReceipts).toBe(1);
    expect(handle.model.lastDroppedReceipt).toBe('verification receipt accepted');
    expect(handle.model.completed.has('mouse-drag')).toBe(true);
  });

  it('opens target-specific right-click menus with keyboard navigation, resize clamping, and click-away shielding', async () => {
    const handle = flightDeck(140, 42);
    const screen = createScreen(handle);
    const coreTab = findText(handle.lastFrame(), '1 Core');

    const componentsTab = findText(handle.lastFrame(), '2 Components');
    handle.click(componentsTab.col + 2, componentsTab.row, 'right');
    await handle.waitForUpdate();
    expect(handle.model.contextMenuSource).toBe('lab:components');
    expect(handle.lastFrame()).toContain('Open Components lab');
    handle.pressKey('escape');
    await handle.waitForUpdate();

    handle.click(coreTab.col + 2, coreTab.row, 'right');
    await handle.waitForUpdate();
    expect(handle.model.contextMenu.open).toBe(true);
    expect(handle.model.contextMenuSource).toBe('lab:core');
    expect(handle.model.completed.has('context-menu')).toBe(true);
    expect(handle.lastFrame()).toContain('Open Core help');
    expect(handle.lastFrame()).toContain('Switch lab');
    expect(handle.lastFrame()).toContain('Close menu');

    screen.fireResize(SHOWCASE_MIN_COLS, SHOWCASE_MIN_ROWS);
    expect(handle.model.contextMenu.open).toBe(false);
    expect(handle.model.contextMenuSource).toBeNull();
    expect(handle.lastFrame()).not.toContain('Open Core help');

    const outside = findText(handle.lastFrame(), 'CELESTIAL FLIGHT DECK');
    handle.click(outside.col, outside.row);
    await handle.waitForUpdate();
    expect(handle.model.contextMenu.open).toBe(false);
    expect(handle.model.activeLab).toBe('core');

    const compactCoreTab = findText(handle.lastFrame(), '1 Core');
    handle.click(compactCoreTab.col + 2, compactCoreTab.row, 'right');
    await handle.waitForUpdate();
    expect(handle.model.contextMenuSource).toBe('lab:core');
    handle.pressKey('down');
    handle.pressKey('right');
    expect(handle.lastFrame()).toContain('Components');
    handle.pressKey('enter');
    await handle.waitForUpdate();
    expect(handle.model.contextMenu.open).toBe(false);
    expect(handle.model.activeLab).toBe('components');

    handle.pressKey('f10', { shift: true });
    await handle.waitForUpdate();
    expect(handle.model.contextMenu.open).toBe(true);
    expect(handle.model.contextMenuSource).toBe('lab:components');
    expect(handle.lastFrame()).toContain('Open Components help');
    handle.pressKey('escape');

    screen.fireResize(140, 42);
    handle.pressKey('1');
    await handle.waitForUpdate();
    handle.click(100, 30, 'right');
    await handle.waitForUpdate();
    expect(handle.model.contextMenuSource).toBe('lab:core');
    expect(handle.lastFrame()).toContain('Open Core help');
    handle.pressKey('escape');
    await handle.waitForUpdate();

    const commands = findText(handle.lastFrame(), 'Commands');
    handle.click(commands.col + 2, commands.row, 'right');
    await handle.waitForUpdate();
    expect(handle.model.contextMenuSource).toBe('action:palette');
    expect(handle.lastFrame()).toContain('Open command palette');
  });

  it('maps pointer activation through the visible window of a vertically clipped context menu', async () => {
    const handle = flightDeck(SHOWCASE_MIN_COLS, SHOWCASE_MIN_ROWS);
    const items = Array.from({ length: 40 }, (_, index) => ({
      label: `Windowed action ${index}`,
      msg: { type: 'switch-lab' as const, lab: index === 35 ? ('visuals' as const) : ('core' as const) },
    }));

    handle.dispatch({ type: 'context-menu', msg: { type: 'ctx-open', x: 2, y: 2, items } });
    for (let index = 0; index < 35; index += 1) {
      handle.dispatch({ type: 'context-menu', msg: { type: 'ctx-down' } });
    }
    await handle.waitForUpdate();

    expect(handle.model.contextMenu.selectedIndex).toBe(35);
    expect(handle.lastFrame()).not.toContain('Windowed action 0');
    const visibleSelection = findText(handle.lastFrame(), 'Windowed action 35');
    handle.click(visibleSelection.col + 1, visibleSelection.row);
    await handle.waitForUpdate();

    expect(handle.model.contextMenu.open).toBe(false);
    expect(handle.model.activeLab).toBe('visuals');
  });

  it('routes a window context-menu action by mouse without clicking through to the window canvas', async () => {
    const handle = flightDeck(140, 42);
    handle.pressKey('7');
    await handle.waitForUpdate();
    const instrumentBody = findText(handle.lastFrame(), 'Live instrument bus');

    handle.click(instrumentBody.col, instrumentBody.row, 'right');
    await handle.waitForUpdate();
    expect(handle.model.contextMenuSource).toBe('window:telemetry');
    expect(handle.lastFrame()).toContain('Focus Telemetry instrument');
    expect(handle.lastFrame()).toContain('Minimize window');
    expect(handle.lastFrame()).toContain('Close window');

    const minimize = findText(handle.lastFrame(), 'Minimize window');
    handle.click(minimize.col, minimize.row);
    await handle.waitForUpdate();
    expect(handle.model.contextMenu.open).toBe(false);
    expect(handle.model.windows.windows.find((window) => window.id === 'telemetry')?.minimized).toBe(true);
    expect(handle.model.windowPointer.mouse.active).toEqual({ kind: 'none' });
  });

  it('advances an Orbit workflow and renders the rich visual stack', async () => {
    const handle = flightDeck(140, 48);

    handle.pressKey('3');
    await handle.waitForUpdate();
    expect(handle.lastFrame()).toContain('ORBIT WORKFLOWS');
    expect(handle.lastFrame()).toContain('Release preferences');
    expect(handle.lastFrame()).toContain('Step 1 of 3: Scope');

    const next = findText(handle.lastFrame(), 'Advance step');
    handle.click(next.col, next.row);
    await handle.waitForUpdate();
    expect(handle.model.wizard.currentStep).toBe(1);
    expect(handle.model.completed.has('workflow')).toBe(true);
    expect(handle.lastFrame()).toContain('Step 2 of 3: Verify');

    handle.pressKey('4');
    await handle.waitForUpdate();
    expect(handle.lastFrame()).toContain('RICH TERMINAL RENDERING');
    expect(handle.lastFrame()).toContain('Spectrum / TypeScript');
    expect(handle.lastFrame()).toContain('Stellar line chart');
    expect(handle.lastFrame()).toContain('Pulsar');
    expect(handle.model.completed.has('visual')).toBe(true);
  });

  it('pages through Rosetta and the complete machine-backed capability ledger', async () => {
    const handle = flightDeck(140, 48);

    handle.pressKey('l');
    await handle.waitForUpdate();
    expect(handle.model.corePage).toBe('locale');
    expect(handle.lastFrame()).toContain('ROSETTA LOCALE LAB');
    expect(handle.lastFrame()).toContain('Bidi + grapheme terminal lane');
    const localeFrame = handle.lastFrame();
    handle.dispatch({ type: 'locale-cycle', delta: 1 });
    expect(handle.model.localeIndex).toBe(1);
    expect(handle.model.evidence.localeChanges).toBe(1);
    expect(handle.lastFrame()).not.toBe(localeFrame);

    handle.pressKey('g');
    await handle.waitForUpdate();
    expect(handle.model.corePage).toBe('ledger');
    const visiblePackages = new Set<string>();
    for (let page = 0; page < 3; page += 1) {
      const frame = handle.lastFrame();
      for (const entry of SHOWCASE_PACKAGE_COVERAGE) {
        if (frame.includes(entry.packageName)) visiblePackages.add(entry.packageName);
      }
      handle.dispatch({ type: 'ledger-cycle', delta: 1 });
    }
    expect([...visiblePackages].sort()).toEqual(SHOWCASE_PACKAGE_COVERAGE.map((entry) => entry.packageName).sort());
  });

  it('exercises every Visuals and Workflows instrument with live variants', async () => {
    const handle = flightDeck(140, 48);

    handle.pressKey('4');
    await handle.waitForUpdate();
    expect(handle.lastFrame()).toContain('RICH TERMINAL RENDERING');
    handle.pressKey(']');
    expect(handle.lastFrame()).toContain('TEXT + MOTION INSTRUMENT');
    expect(handle.lastFrame()).toContain('fade transition');
    handle.pressKey('v');
    expect(handle.lastFrame()).toContain('slide transition');
    handle.pressKey(']');
    expect(handle.lastFrame()).toContain('STELLAR CHART DECK');
    handle.pressKey(']');
    expect(handle.lastFrame()).toContain('PULSAR DOCUMENT INSTRUMENT');
    expect(handle.lastFrame()).toContain('stream pending');

    handle.pressKey('3');
    await handle.waitForUpdate();
    expect(handle.lastFrame()).toContain('ORBIT WORKFLOWS');
    handle.pressKey(']');
    expect(handle.lastFrame()).toContain('ORBIT FORM ENGINE');
    expect(handle.lastFrame()).toContain('Validation accepted');
    handle.pressKey('v');
    expect(handle.lastFrame()).toContain('Validation rejected');
    handle.pressKey(']');
    expect(handle.lastFrame()).toContain('ORBIT PROMPT CONSOLE');
    expect(handle.lastFrame()).toContain('Input + confirmation');
  });

  it('demonstrates Horizon snap, tile, and session APIs without invisible manager input', async () => {
    const handle = flightDeck(140, 48);
    handle.pressKey('7');
    await handle.waitForUpdate();
    const telemetryBefore = { ...handle.model.windows.windows.find((window) => window.id === 'telemetry')! };

    handle.pressKey(']');
    expect(handle.model.windowPage).toBe(1);
    expect(handle.lastFrame()).toContain('HORIZON LAYOUT SYSTEMS');
    expect(handle.lastFrame()).toContain('saved sessions');
    expect(handle.lastFrame()).toContain('flight-deck');
    expect(handle.lastFrame()).toContain('Tiled workspace | columns');
    expect(handle.lastFrame()).not.toContain('Drag anywhere on the titlebar outside its controls.');

    handle.dispatch({
      type: 'raw-mouse',
      event: { type: 'press', x: telemetryBefore.x + 2, y: telemetryBefore.y + 1, button: 0, ctrl: false, alt: false, shift: false },
    });
    expect(handle.model.windowPointer.mouse.active).toEqual({ kind: 'none' });
    expect(handle.model.windows.windows.find((window) => window.id === 'telemetry')).toMatchObject(telemetryBefore);

    const snapFrame = handle.lastFrame();
    handle.pressKey('v');
    expect(handle.model.windowVariant).toBe(1);
    expect(handle.lastFrame()).toContain('Tiled workspace | rows');
    expect(handle.lastFrame()).not.toBe(snapFrame);

    // The 'window' receipt reads "Focus, minimize, maximize, restore, or close a
    // window", so paging to the layout page and cycling its layout must not earn it.
    expect(handle.model.completed.has('window')).toBe(false);
    handle.dispatch({ type: 'window-action', id: 'telemetry', action: 'maximize' });
    expect(handle.model.completed.has('window')).toBe(true);
  });

  // Every paged instrument wraps with `(page + delta + count) % count`. The `+ count`
  // term only matters going backwards, so paging forward never executes it. These press
  // `[` from page 0 to prove the wrap lands on the last page instead of -1.
  it.each([
    ['4', '[', 'visualPage', VISUAL_PAGE_LABELS.length],
    ['3', '[', 'workflowPage', WORKFLOW_PAGE_LABELS.length],
    ['7', '[', 'windowPage', WINDOW_PAGE_LABELS.length],
  ] as const)('wraps backward from the first page to the last with %s then %s', async (lab, key, field, pageCount) => {
    const handle = flightDeck(140, 48);
    handle.pressKey(lab);
    await handle.waitForUpdate();
    expect(handle.model[field]).toBe(0);

    handle.pressKey(key);
    await handle.waitForUpdate();
    expect(handle.model[field]).toBe(pageCount - 1);

    handle.pressKey(']');
    await handle.waitForUpdate();
    expect(handle.model[field]).toBe(0);
  });

  it('wraps the Rosetta locale backward through every sample including the bidi one', async () => {
    const handle = flightDeck(140, 48);
    handle.pressKey('1');
    await handle.waitForUpdate();
    handle.pressKey('l');
    await handle.waitForUpdate();
    expect(handle.model.localeIndex).toBe(0);

    handle.dispatch({ type: 'locale-cycle', delta: -1 });
    expect(handle.model.localeIndex).toBe(LOCALE_SAMPLE_COUNT - 1);

    // Walk the full cycle and assert each sample renders a distinct locale scope, so a
    // sample added to labs.ts cannot become unreachable behind a stale bound.
    const scopes = new Set<string>();
    for (let step = 0; step < LOCALE_SAMPLE_COUNT; step += 1) {
      const line = handle
        .lastFrame()
        .split('\n')
        .find((row) => row.includes('Locale scope |'));
      if (line) scopes.add(line.trim());
      handle.dispatch({ type: 'locale-cycle', delta: 1 });
    }
    expect(scopes.size).toBe(LOCALE_SAMPLE_COUNT);
    expect(handle.model.localeIndex).toBe(LOCALE_SAMPLE_COUNT - 1);
  });

  it('suppresses quit only while a gallery text builder is focused', async () => {
    const handle = flightDeck(140, 48);
    handle.pressKey('2');
    await handle.waitForUpdate();
    handle.dispatch({ type: 'component-page', page: 1 });
    await handle.waitForUpdate();

    // Nothing focused yet, so q must still quit even on a text-entry page.
    expect(handle.model.galleryModels.tagInput.focused).toBe(false);
    handle.pressKey('q');
    await handle.waitForUpdate();
    expect(handle.messageCoverage().byType['quit'] ?? 0).toBe(1);

    // With the tag input focused, q is a character and must not quit.
    const typing = flightDeck(140, 48);
    typing.pressKey('2');
    await typing.waitForUpdate();
    typing.dispatch({ type: 'component-page', page: 2 });
    await typing.waitForUpdate();
    typing.dispatch({ type: 'gallery-component', component: { id: 'tagInput', msg: { type: 'focus' } } });
    await typing.waitForUpdate();
    expect(typing.model.galleryModels.tagInput.focused).toBe(true);
    typing.resetMessageCoverage();
    typing.pressKey('q');
    await typing.waitForUpdate();
    expect(typing.messageCoverage().byType['quit'] ?? 0).toBe(0);
  });

  it('preserves the base app beneath layers and provides contextual Escape-dismissible help', async () => {
    const handle = flightDeck(100, 36);
    handle.pressKey('6');
    await handle.waitForUpdate();
    const modalLauncher = findText(handle.lastFrame(), 'modal');
    fireMouse(handle.terminal, { type: 'move', col: modalLauncher.col, row: modalLauncher.row });
    expect(handle.model.hoveredRegion).toBe('action:modal');

    handle.dispatch({ type: 'open-surface', surface: 'confirm' });
    await handle.waitForUpdate();
    const confirmAction = findText(handle.lastFrame(), '[Record]');
    fireMouse(handle.terminal, { type: 'move', col: confirmAction.col, row: confirmAction.row });
    expect(handle.model.confirm.hoveredButton).toBe('confirm');
    handle.click(confirmAction.col, confirmAction.row);
    expect(handle.model.confirm.open).toBe(false);

    handle.dispatch({ type: 'open-surface', surface: 'palette' });
    await handle.waitForUpdate();
    const paletteAction = findText(handle.lastFrame(), 'Open App shell lab');
    handle.click(paletteAction.col, paletteAction.row);
    await handle.waitForUpdate();
    expect(handle.model.activeLab).toBe('app-shell');
    handle.pressKey('6');
    await handle.waitForUpdate();

    handle.dispatch({ type: 'open-surface', surface: 'toast' });
    await handle.waitForUpdate();
    const toast = findText(handle.lastFrame(), 'Layer receipt captured');
    expect(toast.row).toBeLessThanOrEqual(3);
    expect(toast.col).toBeGreaterThan(handle.model.cols / 2);
    handle.pressKey('escape');
    await handle.waitForUpdate();

    for (const surface of ['modal', 'confirm', 'drawer', 'tooltip', 'palette', 'toast'] as const) {
      handle.dispatch({ type: 'open-surface', surface });
      await handle.waitForUpdate();
      expect(handle.lastFrame()).toContain('Every action adds a real transparent layer');
      expect(handle.lastFrame()).toContain('[Help] [Commands]');
      expect(handle.model.completed.has('layer')).toBe(true);
      handle.pressKey('escape');
      await handle.waitForUpdate();
      expect(handle.lastFrame()).toContain('Base application - should never disappear');
    }
    expect(handle.model.modal.open).toBe(false);
    expect(handle.model.confirm.open).toBe(false);
    expect(handle.model.drawer.open).toBe(false);
    expect(handle.model.tooltip.visible).toBe(false);
    expect(handle.model.palette.palette.open).toBe(false);
    expect(handle.model.toast.toasts).toHaveLength(0);

    handle.dispatch({ type: 'open-surface', surface: 'tooltip' });
    await handle.waitForUpdate();
    const tooltip = findText(handle.lastFrame(), 'Tooltip content is tokenized');
    handle.click(tooltip.col, tooltip.row);
    expect(handle.model.tooltip.visible).toBe(true);
    handle.click(0, handle.model.rows - 2);
    expect(handle.model.tooltip.visible).toBe(false);

    handle.pressKey('?');
    await handle.waitForUpdate();
    const helpFrame = handle.lastFrame();
    expect(handle.model.helpOpen).toBe(true);
    expect(helpFrame).toContain('Layers help');
    expect(helpFrame).toContain('LAYERS LAB');
    expect(helpFrame).toContain('LAYER COMPOSITION');
    expect(handle.model.completed.has('help')).toBe(true);
    handle.pressKey('escape');
    expect(handle.model.helpOpen).toBe(false);
  });

  it('records smoke receipts only after the corresponding behavior changes state', () => {
    const handle = flightDeck(140, 42);

    expect(handle.model.completed).toEqual(new Set(['core']));
    expect(handle.model.evidence.coreVisits).toBe(1);

    handle.dispatch({ type: 'component-page', page: 3 });
    handle.dispatch({ type: 'component-focus', focus: 'tabs' });
    handle.dispatch({ type: 'schema-form', msg: { type: 'schema-form:set-field', field: 'density', value: 'compact' } });
    handle.dispatch({ type: 'wizard', msg: { type: 'wizard:prev' } });
    handle.dispatch({ type: 'window-action', id: 'missing', action: 'focus' });
    handle.dispatch({ type: 'modal', msg: { type: 'close' } });

    expect(handle.model.completed.has('component')).toBe(false);
    expect(handle.model.completed.has('workflow')).toBe(false);
    expect(handle.model.completed.has('window')).toBe(false);
    expect(handle.model.completed.has('layer')).toBe(false);
    expect(handle.model.evidence).toMatchObject({ componentChanges: 0, workflowAdvances: 0, windowChanges: 0, layersOpened: 0 });

    handle.dispatch({ type: 'checkbox', msg: { type: 'toggle' } });
    handle.dispatch({ type: 'wizard', msg: { type: 'wizard:next' } });
    handle.dispatch({ type: 'open-surface', surface: 'modal' });

    expect(handle.model.completed).toEqual(new Set(['core', 'component', 'workflow', 'layer']));
    expect(handle.model.evidence).toMatchObject({ componentChanges: 1, workflowAdvances: 1, windowChanges: 0, layersOpened: 1 });
  });

  it('keeps gallery state durable and makes the sample context menu Escape-dismissible and reopenable', async () => {
    const handle = flightDeck(100, 40);
    handle.dispatch({ type: 'switch-lab', lab: 'components' });
    const registry = handle.model.galleryModels;
    handle.dispatch({ type: 'component-page', page: GALLERY_PAGE_COUNT - 1 });
    await handle.waitForUpdate();

    expect(handle.model.galleryContextMenu.open).toBe(true);
    expect(handle.lastFrame()).toContain('Inspect');
    handle.pressKey('escape');
    await handle.waitForUpdate();
    expect(handle.model.galleryContextMenu.open).toBe(false);
    expect(handle.lastFrame()).toContain('Open sample menu');

    const reopen = findText(handle.lastFrame(), 'Open sample menu');
    handle.click(reopen.col + 1, reopen.row);
    await handle.waitForUpdate();
    expect(handle.model.galleryContextMenu.open).toBe(true);

    handle.dispatch({ type: 'component-page', page: 0 });
    // Identity, not deep equality: paging must leave the registry object itself
    // untouched. Deep equality would still pass if a no-op pointer message rebuilt the
    // whole record, which is exactly the churn updateGalleryDescriptor now avoids.
    expect(handle.model.galleryModels).toBe(registry);
    expect(handle.model.galleryContextMenu.open).toBe(false);
  });

  it('cancels stale pointer and contextual interactions at navigation, overlay, and resize boundaries', async () => {
    const handle = flightDeck(140, 42);
    const screen = createScreen(handle);
    handle.dispatch({
      type: 'element-mouse',
      event: {
        handlerTag: 'showcase-drag:start',
        elementId: 'showcase-drag-source',
        x: 4,
        y: 8,
        type: 'press',
        stopPropagation() {},
      },
    });
    expect(handle.model.dragDemo.phase).toBe('dragging');

    handle.dispatch({ type: 'open-surface', surface: 'modal' });
    expect(handle.model.dragDemo.phase).not.toBe('dragging');
    expect(handle.model.modal.open).toBe(true);

    handle.dispatch({ type: 'context-menu', msg: { type: 'ctx-open', x: 4, y: 4, items: [{ label: 'Close', msg: { type: 'close' } }] } });
    expect(handle.model.contextMenu.open).toBe(true);
    screen.fireResize(100, 36);
    expect(handle.model.contextMenu.open).toBe(false);
    expect(handle.model.modal.open).toBe(true);
    expect(handle.model.windowPointer.mouse.active).toEqual({ kind: 'none' });

    handle.dispatch({ type: 'switch-lab', lab: 'visuals' });
    await handle.waitForUpdate();
    expect(handle.model.modal.open).toBe(false);
  });

  it('keeps toast expiry subscribed behind modal surfaces and honors the live reduced-motion preference', () => {
    const app = createCelestialShowcaseApp({ initialSize: { cols: 100, rows: 36 }, fast: true });
    let [model] = app.init();
    [model] = app.update({ type: 'schema-form', msg: { type: 'schema-form:set-field', field: 'reducedMotion', value: true } }, model);
    [model] = app.update({ type: 'open-surface', surface: 'toast' }, model);
    [model] = app.update({ type: 'open-surface', surface: 'modal' }, model);

    const intervals = timerIntervals(app.subscriptions(model));
    expect(model.schemaForm.values['reducedMotion']).toBe(true);
    expect(model.toast.toasts).toHaveLength(1);
    expect(model.modal.open).toBe(true);
    expect(intervals).toContain(500);
    expect(intervals).not.toContain(50);
  });

  it('renders an all-workspace minimized shelf with activation and right-click context actions', async () => {
    const handle = flightDeck(140, 42);
    handle.dispatch({ type: 'switch-lab', lab: 'windows' });
    handle.dispatch({ type: 'switch-workspace', index: 1 });
    handle.dispatch({ type: 'window-action', id: 'events', action: 'minimize' });
    await handle.waitForUpdate();

    expect(handle.model.windows.bounds.bottomInset).toBe(3);
    expect(handle.model.windows.windows.find((window) => window.id === 'events')?.mode).toBe('minimized');
    expect(handle.lastFrame()).toContain('MINIMIZED 1');
    expect(handle.snapshot().audit.violations.filter((violation) => violation.severity === 'error')).toEqual([]);
    let shelf = findLastText(handle.lastFrame(), 'Event instrument');

    handle.click(shelf.col + 1, shelf.row, 'right');
    await handle.waitForUpdate();
    expect(handle.model.contextMenuSource).toBe('window:events');
    expect(handle.lastFrame()).toContain('Restore window');
    handle.pressKey('escape');

    handle.dispatch({ type: 'switch-workspace', index: 0 });
    await handle.waitForUpdate();
    shelf = findLastText(handle.lastFrame(), 'Event instrument');
    handle.click(shelf.col + 1, shelf.row);
    await handle.waitForUpdate();

    expect(handle.model.windows.windows.find((window) => window.id === 'events')?.mode).toBe('normal');
    expect(handle.model.windows.activeWorkspaceId).toBe('systems');
    expect(handle.model.workspaces.activeIndex).toBe(1);
    expect(handle.model.windows.bounds.bottomInset).toBe(2);
  });

  it('brings both instruments into the active workspace when Open or Bring is used', async () => {
    const handle = flightDeck(140, 42);
    handle.dispatch({ type: 'switch-lab', lab: 'windows' });
    await handle.waitForUpdate();

    expect(handle.model.windows.activeWorkspaceId).toBe('flight');
    expect(handle.model.windows.windows.find((window) => window.id === 'events')?.workspaceId).toBe('systems');
    expect(handle.lastFrame()).toContain('Bring events here');

    const bringEvents = findText(handle.lastFrame(), 'Bring events here');
    handle.click(bringEvents.col + 1, bringEvents.row);
    await handle.waitForUpdate();

    expect(handle.model.windows.activeWorkspaceId).toBe('flight');
    expect(handle.model.windows.windows.find((window) => window.id === 'events')?.workspaceId).toBe('flight');
    expect(
      handle.model.windows.windows.filter(
        (window) => window.workspaceId === 'flight' && window.mode !== 'minimized' && window.mode !== 'hidden' && window.mode !== 'closed',
      ),
    ).toHaveLength(2);
    expect(handle.lastFrame()).toContain('Telemetry instrument');
    expect(handle.lastFrame()).toContain('Event instrument');
  });

  it('keeps maximized windows inside shell insets and fullscreen windows on the complete viewport', () => {
    const handle = flightDeck(140, 42);
    const screen = createScreen(handle);

    handle.dispatch({ type: 'window-action', id: 'telemetry', action: 'maximize' });
    expect(handle.model.windows.windows.find((window) => window.id === 'telemetry')).toMatchObject({ x: 0, y: 3, width: 140, height: 37, mode: 'maximized' });

    handle.dispatch({ type: 'window-action', id: 'telemetry', action: 'fullscreen' });
    expect(handle.model.windows.windows.find((window) => window.id === 'telemetry')).toMatchObject({ x: 0, y: 0, width: 140, height: 42, mode: 'fullscreen' });

    screen.fireResize(120, 40);
    expect(handle.model.windows.windows.find((window) => window.id === 'telemetry')).toMatchObject({ x: 0, y: 0, width: 120, height: 40, mode: 'fullscreen' });
  });

  it('drags and manages Horizon windows, then preserves state across adaptive representations', async () => {
    const handle = flightDeck(140, 42);
    const screen = createScreen(handle);
    handle.pressKey('7');
    await handle.waitForUpdate();

    const before = handle.model.windows.windows.find((window) => window.id === 'telemetry')!;
    fireMouse(handle.terminal, { type: 'move', col: before.x + 2, row: before.y + 1 });
    expect(handle.model.windows.windows.find((window) => window.id === 'telemetry')?.chrome?.hoveredTarget).toBe('titlebar');
    fireMouse(handle.terminal, { type: 'move', col: before.x, row: before.y + 3 });
    expect(handle.model.windows.windows.find((window) => window.id === 'telemetry')?.chrome?.hoveredTarget).toBe('resize:left');
    const blankTitlebarCol = before.x + 10;
    handle.drag(blankTitlebarCol, before.y + 1, blankTitlebarCol + 8, before.y + 4);
    await handle.waitForUpdate();
    const after = handle.model.windows.windows.find((window) => window.id === 'telemetry')!;
    expect({ x: after.x, y: after.y }).toEqual({ x: before.x + 8, y: before.y + 3 });
    expect(handle.model.completed.has('mouse-drag')).toBe(false);
    expect(handle.model.evidence.payloadDrops).toBe(0);
    expect(handle.model.completed.has('window')).toBe(true);

    const widthBeforeResize = after.width;
    const heightBeforeResize = after.height;
    handle.drag(after.x + after.width - 1, after.y + after.height - 1, after.x + after.width + 4, after.y + after.height + 2);
    await handle.waitForUpdate();
    const resized = handle.model.windows.windows.find((window) => window.id === 'telemetry')!;
    expect(resized.width).toBe(widthBeforeResize + 5);
    expect(resized.height).toBe(heightBeforeResize + 3);

    const title = findLastText(handle.lastFrame(), 'Telemetry instrument');
    const titleLine = handle.lastFrame().split('\n')[title.row]!;
    const maximizeCol = titleLine.indexOf('[ ]', title.col);
    expect(maximizeCol).toBeGreaterThan(title.col);
    handle.click(maximizeCol + 1, title.row);
    expect(handle.model.windows.windows.find((window) => window.id === 'telemetry')?.mode).toBe('maximized');
    handle.dispatch({ type: 'window-action', id: 'telemetry', action: 'restore' });
    expect(handle.model.windows.windows.find((window) => window.id === 'telemetry')?.mode).toBe('normal');

    screen.fireResize(100, 36);
    expect(handle.lastFrame()).toContain('MEDIUM / split');
    screen.fireResize(70, 32);
    expect(handle.lastFrame()).toContain('COMPACT / single');
    expect(handle.model.windows.windows.some((window) => window.id === 'telemetry')).toBe(true);
    expect(handle.model.completed.has('adaptive')).toBe(true);
  });
});
