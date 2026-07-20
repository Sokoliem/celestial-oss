import { text as textNode } from '@celestial/nebula';
import { beforeEach, describe, expect, it } from 'vitest';
import { type EmbeddedChart, embedChart } from '../chart-component.js';
import {
  chartPanel,
  type DashboardModel,
  dashboardAppConfig,
  dashboardGrid,
  dashboardRow,
  dashboardStack,
  getChartPanelCount,
  getPanelIds,
  getPanelModel,
  isDashboardMsg,
  panelFrame,
  staticPanel,
  updatePanelData,
} from '../dashboard.js';
import { gridLayer, lineDataLayer } from '../layers.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Create a minimal embedded chart for testing. */
function makeTestChart(id: string, data: number[] = [1, 2, 3]): EmbeddedChart {
  return embedChart({
    id,
    layers: () => [gridLayer({ horizontal: true }), lineDataLayer(data)],
    initialData: data,
    initialSize: { width: 20, height: 5 },
  });
}

// ── Panel Factories ─────────────────────────────────────────────────────────

describe('panel factories', () => {
  it('chartPanel creates a chart descriptor', () => {
    const chart = makeTestChart('cpu');
    const panel = chartPanel({ id: 'cpu', title: 'CPU', chart });
    expect(panel.kind).toBe('chart');
    expect(panel.config.id).toBe('cpu');
    expect(panel.config.title).toBe('CPU');
  });

  it('staticPanel creates a static descriptor', () => {
    const panel = staticPanel({ id: 'info', title: 'Info', content: textNode('OK') });
    expect(panel.kind).toBe('static');
    expect(panel.config.id).toBe('info');
    expect(panel.config.title).toBe('Info');
  });

  it('chartPanel defaults colSpan to 1', () => {
    const panel = chartPanel({ id: 'x', chart: makeTestChart('x') });
    expect(panel.config.colSpan).toBeUndefined(); // uses default 1 in layout
  });

  it('chartPanel respects explicit colSpan', () => {
    const panel = chartPanel({ id: 'x', chart: makeTestChart('x'), colSpan: 2 });
    expect(panel.config.colSpan).toBe(2);
  });
});

// ── Layout Helpers ──────────────────────────────────────────────────────────

describe('dashboardGrid', () => {
  it('arranges panels into rows', () => {
    const views = [{ view: textNode('A') }, { view: textNode('B') }, { view: textNode('C') }];
    const result = dashboardGrid(views, { columns: 2 });
    expect(result.kind).toBe('column');
  });

  it('produces a column node wrapping row nodes', () => {
    const views = [{ view: textNode('A') }, { view: textNode('B') }];
    const result = dashboardGrid(views, { columns: 2 });
    expect(result.kind).toBe('column');
    // Column should have at least one child row
    if ('children' in result) {
      expect(result.children.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('respects colSpan', () => {
    const views = [
      { view: textNode('Wide'), colSpan: 2 },
      { view: textNode('Narrow'), colSpan: 1 },
    ];
    const result = dashboardGrid(views, { columns: 2 });
    // Wide takes full row, Narrow starts a new row
    if ('children' in result) {
      expect(result.children.length).toBeGreaterThanOrEqual(2); // 2+ rows (including gaps)
    }
  });

  it('handles empty panels array', () => {
    const result = dashboardGrid([], { columns: 2 });
    expect(result.kind).toBe('column');
  });
});

describe('dashboardStack', () => {
  it('arranges panels vertically', () => {
    const views = [{ view: textNode('A') }, { view: textNode('B') }];
    const result = dashboardStack(views, { gap: 1 });
    expect(result.kind).toBe('column');
  });

  it('handles empty panels array', () => {
    const result = dashboardStack([]);
    expect(result.kind).toBe('column');
  });
});

describe('dashboardRow', () => {
  it('arranges panels horizontally', () => {
    const views = [{ view: textNode('A') }, { view: textNode('B') }];
    const result = dashboardRow(views, { gap: 1 });
    expect(result.kind).toBe('row');
  });

  it('handles empty panels array', () => {
    const result = dashboardRow([]);
    expect(result.kind).toBe('row');
  });
});

describe('panelFrame', () => {
  it('wraps content without title', () => {
    const result = panelFrame(textNode('Content'));
    expect(result.kind).toBe('column');
  });

  it('adds title when provided', () => {
    const result = panelFrame(textNode('Content'), { title: 'My Panel' });
    expect(result.kind).toBe('column');
    if ('children' in result) {
      expect(result.children.length).toBe(2); // title + content
    }
  });

  it('wraps in box when bordered', () => {
    const result = panelFrame(textNode('Content'), { bordered: true });
    expect(result.kind).toBe('box');
  });
});

// ── isDashboardMsg ──────────────────────────────────────────────────────────

describe('isDashboardMsg', () => {
  it('returns true for valid dashboard messages', () => {
    expect(isDashboardMsg({ type: 'dashboard:nextPanel' })).toBe(true);
    expect(isDashboardMsg({ type: 'dashboard:chartMsg', panelId: 'x', msg: {} })).toBe(true);
  });

  it('returns false for non-dashboard messages', () => {
    expect(isDashboardMsg({ type: 'chart:mouse' })).toBe(false);
    expect(isDashboardMsg(null)).toBe(false);
    expect(isDashboardMsg('string')).toBe(false);
    expect(isDashboardMsg(42)).toBe(false);
  });
});

// ── dashboardAppConfig ──────────────────────────────────────────────────────

describe('dashboardAppConfig', () => {
  let appConfig: ReturnType<typeof dashboardAppConfig>;
  let model: DashboardModel;

  beforeEach(() => {
    appConfig = dashboardAppConfig({
      panels: [
        chartPanel({ id: 'cpu', title: 'CPU', chart: makeTestChart('cpu') }),
        chartPanel({ id: 'mem', title: 'Memory', chart: makeTestChart('mem') }),
        staticPanel({ id: 'status', title: 'Status', content: textNode('OK') }),
      ],
      layout: 'grid',
      columns: 2,
      title: 'Dashboard',
    });
    const [m] = appConfig.init();
    model = m;
  });

  it('init creates model with correct panel count', () => {
    expect(model.panels.length).toBe(3);
  });

  it('init sets dashboard title', () => {
    expect(model.title).toBe('Dashboard');
  });

  it('init creates chart panels with chart models', () => {
    expect(model.panels[0]!.kind).toBe('chart');
    expect(model.panels[1]!.kind).toBe('chart');
    if (model.panels[0]!.kind === 'chart') {
      expect(model.panels[0]!.model.id).toBe('cpu');
    }
  });

  it('init creates static panels', () => {
    expect(model.panels[2]!.kind).toBe('static');
  });

  it('init sets activePanelIndex to 0', () => {
    expect(model.activePanelIndex).toBe(0);
  });

  it('view produces a VNode', () => {
    const vnode = appConfig.view(model);
    expect(vnode).toBeDefined();
    expect(vnode.kind).toBeDefined();
  });

  it('view includes global title', () => {
    const vnode = appConfig.view(model);
    // Top-level column should have title text + gap + body
    expect(vnode.kind).toBe('column');
  });

  it('subscriptions returns a subscription', () => {
    const sub = appConfig.subscriptions(model);
    expect(sub).toBeDefined();
  });

  it('shaders returns array', () => {
    const s = appConfig.shaders(model);
    expect(Array.isArray(s)).toBe(true);
  });

  // ── Message handling ──────────────────────────────────────────────────

  it('dashboard:nextPanel advances active index', () => {
    const [m] = appConfig.update({ type: 'dashboard:nextPanel' }, model);
    expect(m.activePanelIndex).toBe(1);
  });

  it('dashboard:nextPanel wraps around', () => {
    let m = model;
    for (let i = 0; i < 3; i++) {
      [m] = appConfig.update({ type: 'dashboard:nextPanel' }, m);
    }
    expect(m.activePanelIndex).toBe(0); // wraps from 2 -> 0
  });

  it('dashboard:prevPanel goes backward', () => {
    const [m] = appConfig.update({ type: 'dashboard:prevPanel' }, model);
    expect(m.activePanelIndex).toBe(2); // wraps from 0 -> 2
  });

  it('dashboard:focusPanel sets specific index', () => {
    const [m] = appConfig.update({ type: 'dashboard:focusPanel', index: 1 }, model);
    expect(m.activePanelIndex).toBe(1);
  });

  it('dashboard:focusPanel clamps out-of-range', () => {
    const [m] = appConfig.update({ type: 'dashboard:focusPanel', index: 100 }, model);
    expect(m.activePanelIndex).toBe(2); // clamped to max
  });

  it('dashboard:updateData updates a chart panel data', () => {
    const [m] = appConfig.update({ type: 'dashboard:updateData', panelId: 'cpu', data: [10, 20, 30] }, model);
    if (m.panels[0]!.kind === 'chart') {
      expect(m.panels[0]!.model.data).toEqual([10, 20, 30]);
    }
  });

  it('dashboard:updateData ignores unknown panel', () => {
    const [m] = appConfig.update({ type: 'dashboard:updateData', panelId: 'unknown', data: [1] }, model);
    expect(m).toBe(model);
  });

  it('dashboard:updateData ignores static panel', () => {
    const [m] = appConfig.update({ type: 'dashboard:updateData', panelId: 'status', data: [1] }, model);
    expect(m).toBe(model);
  });
});

// ── Helper Functions ────────────────────────────────────────────────────────

describe('helper functions', () => {
  let model: DashboardModel;

  beforeEach(() => {
    const appConfig = dashboardAppConfig({
      panels: [chartPanel({ id: 'cpu', chart: makeTestChart('cpu') }), staticPanel({ id: 'info', content: textNode('OK') })],
    });
    [model] = appConfig.init();
  });

  it('getPanelModel returns chart model for chart panel', () => {
    const cm = getPanelModel(model, 'cpu');
    expect(cm).toBeDefined();
    expect(cm!.id).toBe('cpu');
  });

  it('getPanelModel returns undefined for static panel', () => {
    expect(getPanelModel(model, 'info')).toBeUndefined();
  });

  it('getPanelModel returns undefined for unknown panel', () => {
    expect(getPanelModel(model, 'nope')).toBeUndefined();
  });

  it('updatePanelData creates correct message', () => {
    const msg = updatePanelData('cpu', [5, 6, 7]);
    expect(msg.type).toBe('dashboard:updateData');
    if (msg.type === 'dashboard:updateData') {
      expect(msg.panelId).toBe('cpu');
    }
  });

  it('getPanelIds returns all panel ids', () => {
    expect(getPanelIds(model)).toEqual(['cpu', 'info']);
  });

  it('getChartPanelCount counts only chart panels', () => {
    expect(getChartPanelCount(model)).toBe(1);
  });
});

// ── Layout modes ────────────────────────────────────────────────────────────

describe('layout modes', () => {
  const panels = [chartPanel({ id: 'a', chart: makeTestChart('a') }), chartPanel({ id: 'b', chart: makeTestChart('b') })];

  it('rows layout produces column', () => {
    const app = dashboardAppConfig({ panels, layout: 'rows' });
    const [m] = app.init();
    const view = app.view(m);
    expect(view.kind).toBe('column');
  });

  it('columns layout produces row (inside column if title)', () => {
    const app = dashboardAppConfig({ panels, layout: 'columns' });
    const [m] = app.init();
    const view = app.view(m);
    // No title, so top-level is the row layout
    expect(view.kind).toBe('row');
  });

  it('custom layout uses provided function', () => {
    let called = false;
    const app = dashboardAppConfig({
      panels,
      layout: 'custom',
      customLayout: (views) => {
        called = true;
        expect(views.length).toBe(2);
        return textNode('custom');
      },
    });
    const [m] = app.init();
    app.view(m);
    expect(called).toBe(true);
  });
});

describe('dashboard boundary hardening', () => {
  it('keeps navigation stable for an empty dashboard', () => {
    const app = dashboardAppConfig({ panels: [] });
    const [model] = app.init();
    expect(app.update({ type: 'dashboard:nextPanel' }, model)[0]).toBe(model);
    expect(app.update({ type: 'dashboard:prevPanel' }, model)[0]).toBe(model);
    expect(app.update({ type: 'dashboard:focusPanel', index: Number.NaN }, model)[0]).toBe(model);
  });

  it('rejects ambiguous panel identifiers', () => {
    expect(() =>
      dashboardAppConfig({
        panels: [staticPanel({ id: 'same', content: textNode('A') }), staticPanel({ id: 'same', content: textNode('B') })],
      }),
    ).toThrow(/duplicate/);
  });

  it('normalizes unbounded layout dimensions', () => {
    expect(() => dashboardGrid([{ view: textNode('A') }], { columns: Number.POSITIVE_INFINITY, gap: Number.NaN })).not.toThrow();
    expect(() => dashboardStack([{ view: textNode('A') }, { view: textNode('B') }], { gap: Number.POSITIVE_INFINITY })).not.toThrow();
  });
});
