/**
 * Dashboard Composition
 *
 * Provides layout helpers and an Elm Architecture integration layer for
 * composing multiple chart components into a unified dashboard view.
 *
 * Design constraints:
 *   - Uses only nebula primitives (row, column, text, box) for layout.
 *   - Does NOT depend on constellation — no circular dependency.
 *   - Constellation components (card, splitView, section, etc.) can wrap
 *     dashboard panels at the call site if desired.
 *   - Integrates with `embedChart()` from chart-component.ts for interactive
 *     charts, and supports raw VNode panels for static content.
 *
 * Architecture:
 *   - **DashboardPanel** describes one panel: either an embedded chart
 *     (with full init/update/view/subscriptions wiring) or a static VNode.
 *   - **DashboardModel** holds the combined state of all panels.
 *   - **DashboardMsg** routes messages to the correct panel by id.
 *   - **dashboardAppConfig()** returns a complete AppConfig for a standalone
 *     dashboard application.
 *   - **dashboardGrid()** and **dashboardStack()** are pure layout helpers
 *     that arrange VNodes into grid/stack patterns.
 *
 * Usage:
 * ```ts
 * const dashboard = dashboardAppConfig({
 *   panels: [
 *     chartPanel({
 *       id: 'cpu',
 *       title: 'CPU Usage',
 *       chart: embedChart({ id: 'cpu', layers: ..., initialData: ... }),
 *     }),
 *     chartPanel({
 *       id: 'mem',
 *       title: 'Memory',
 *       chart: embedChart({ id: 'mem', layers: ..., initialData: ... }),
 *     }),
 *     staticPanel({ id: 'info', title: 'Status', content: text('OK') }),
 *   ],
 *   layout: 'grid',
 *   columns: 2,
 * });
 *
 * app(dashboard);
 * ```
 */

import type { Style } from '@celestial/corona';
import { border as borderPresets, style } from '@celestial/corona';
import type { CellShader, Cmd, FrameInfo, LayoutRects, MouseEventData, Sub, VNode } from '@celestial/nebula';
import { box, Cmd as CmdNS, column, flex, row, Sub as SubNS, text as textNode } from '@celestial/nebula';

import type { ChartModel, ChartMsg, EmbeddedChart } from './chart-component.js';
import { boundedPositiveInteger, finiteNumber, nonNegativeInteger } from './validation.js';

const MAX_DASHBOARD_COLUMNS = 256;
const MAX_DASHBOARD_GAP = 100;
const MAX_PANEL_EXTENT = 100_000;

function dashboardColumns(value: number | undefined): number {
  return boundedPositiveInteger(value, 2, MAX_DASHBOARD_COLUMNS);
}

function dashboardGap(value: number | undefined): number {
  return Math.min(MAX_DASHBOARD_GAP, nonNegativeInteger(value, 1));
}

// ── Panel Types ─────────────────────────────────────────────────────────────

/** Configuration for a chart-backed panel. */
export interface ChartPanelConfig<D = number[]> {
  /** Unique panel identifier. */
  id: string;
  /** Panel title displayed above the chart. */
  title?: string;
  /** The embedded chart component (from embedChart()). */
  chart: EmbeddedChart<D>;
  /** Minimum width in terminal cells. Default: 20 */
  minWidth?: number;
  /** Minimum height in terminal cells. Default: 5 */
  minHeight?: number;
  /** Span multiple grid columns. Default: 1 */
  colSpan?: number;
}

/** Configuration for a static (non-chart) panel. */
export interface StaticPanelConfig {
  /** Unique panel identifier. */
  id: string;
  /** Panel title displayed above the content. */
  title?: string;
  /** Static VNode content. */
  content: VNode;
  /** Minimum width in terminal cells. Default: 20 */
  minWidth?: number;
  /** Minimum height in terminal cells. Default: 3 */
  minHeight?: number;
  /** Span multiple grid columns. Default: 1 */
  colSpan?: number;
}

/** Internal panel descriptor — discriminated union. */
export type DashboardPanelDescriptor<D = number[]> =
  | { readonly kind: 'chart'; readonly config: ChartPanelConfig<D> }
  | { readonly kind: 'static'; readonly config: StaticPanelConfig };

/** Factory for creating a chart panel descriptor. */
export function chartPanel<D = number[]>(config: ChartPanelConfig<D>): DashboardPanelDescriptor<D> {
  return { kind: 'chart', config };
}

/** Factory for creating a static panel descriptor. */
export function staticPanel(config: StaticPanelConfig): DashboardPanelDescriptor {
  return { kind: 'static', config };
}

// ── Dashboard Model ─────────────────────────────────────────────────────────

/** State for a single chart panel. */
interface ChartPanelState<D = number[]> {
  readonly kind: 'chart';
  readonly id: string;
  readonly title: string | undefined;
  model: ChartModel<D>;
  readonly chart: EmbeddedChart<D>;
  readonly colSpan: number;
  readonly minWidth: number;
  readonly minHeight: number;
}

/** State for a single static panel. */
interface StaticPanelState {
  readonly kind: 'static';
  readonly id: string;
  readonly title: string | undefined;
  readonly content: VNode;
  readonly colSpan: number;
  readonly minWidth: number;
  readonly minHeight: number;
}

/** Union of panel states. */
export type PanelState = ChartPanelState | StaticPanelState;

/** The complete dashboard model. */
export interface DashboardModel {
  /** Ordered panel states. */
  panels: PanelState[];
  /** Active panel index (for keyboard navigation). */
  activePanelIndex: number;
  /** Global title (optional). */
  title: string | undefined;
}

// ── Dashboard Messages ──────────────────────────────────────────────────────

/** Dashboard-level messages. */
export type DashboardMsg =
  | { readonly type: 'dashboard:chartMsg'; readonly panelId: string; readonly msg: ChartMsg }
  | { readonly type: 'dashboard:layout'; readonly rects: LayoutRects }
  | { readonly type: 'dashboard:mouse'; readonly event: MouseEventData }
  | { readonly type: 'dashboard:animFrame'; readonly frame: FrameInfo }
  | { readonly type: 'dashboard:focusPanel'; readonly index: number }
  | { readonly type: 'dashboard:nextPanel' }
  | { readonly type: 'dashboard:prevPanel' }
  | { readonly type: 'dashboard:updateData'; readonly panelId: string; readonly data: unknown };

/** Type guard for dashboard messages. */
export function isDashboardMsg(msg: unknown): msg is DashboardMsg {
  if (typeof msg !== 'object' || msg === null) return false;
  const type = (msg as { type?: string }).type;
  return typeof type === 'string' && type.startsWith('dashboard:');
}

// ── Dashboard Configuration ─────────────────────────────────────────────────

/** Layout strategy for the dashboard. */
export type DashboardLayoutMode = 'grid' | 'rows' | 'columns' | 'custom';

/** Configuration for creating a dashboard app. */
export interface DashboardConfig {
  /** Panel descriptors. */
  panels: DashboardPanelDescriptor[];
  /** Layout mode. Default: 'grid' */
  layout?: DashboardLayoutMode;
  /** Number of columns for grid layout. Default: 2 */
  columns?: number;
  /** Gap between panels (blank rows/columns). Default: 1 */
  gap?: number;
  /** Global dashboard title. */
  title?: string;
  /** Custom layout function (when layout='custom'). */
  customLayout?: (panelViews: Array<{ id: string; view: VNode; colSpan: number }>) => VNode;
  /** Title style override. */
  titleStyle?: Style;
}

// ── Layout Helpers (Pure Functions) ─────────────────────────────────────────

/**
 * Arrange VNodes in an N-column grid using row/column nesting.
 *
 * Respects colSpan: a panel with colSpan=2 consumes two grid slots.
 * Panels are laid out left-to-right, top-to-bottom. When a row is full,
 * a new row starts. Gaps are inserted as empty text nodes.
 */
export function dashboardGrid(panels: Array<{ view: VNode; colSpan?: number }>, opts?: { columns?: number; gap?: number }): VNode {
  const cols = dashboardColumns(opts?.columns);
  const gap = dashboardGap(opts?.gap);
  const gapNode = gap > 0 ? textNode(' '.repeat(gap)) : undefined;

  const rows: VNode[] = [];
  let currentRow: VNode[] = [];
  let usedCols = 0;

  for (const panel of panels) {
    const span = Math.min(boundedPositiveInteger(panel.colSpan, 1, MAX_DASHBOARD_COLUMNS), cols);

    // If this panel doesn't fit in the current row, flush it
    if (usedCols + span > cols && currentRow.length > 0) {
      rows.push(row(...currentRow));
      for (let gapRow = 0; gapRow < gap; gapRow++) rows.push(textNode(''));
      currentRow = [];
      usedCols = 0;
    }

    if (currentRow.length > 0 && gapNode) {
      currentRow.push(gapNode);
    }
    currentRow.push(flex(panel.view, { flex: span }));
    usedCols += span;
  }

  // Flush remaining
  if (currentRow.length > 0) {
    rows.push(row(...currentRow));
  }

  return column(...rows);
}

/**
 * Arrange VNodes in a vertical stack with optional gap.
 */
export function dashboardStack(panels: Array<{ view: VNode }>, opts?: { gap?: number }): VNode {
  const gap = dashboardGap(opts?.gap);
  const children: VNode[] = [];

  for (let i = 0; i < panels.length; i++) {
    if (i > 0 && gap > 0) {
      for (let gapRow = 0; gapRow < gap; gapRow++) children.push(textNode(''));
    }
    children.push(panels[i]!.view);
  }

  return column(...children);
}

/**
 * Arrange VNodes side by side in a single row with optional gap.
 */
export function dashboardRow(panels: Array<{ view: VNode }>, opts?: { gap?: number }): VNode {
  const gap = dashboardGap(opts?.gap);
  const gapNode = gap > 0 ? textNode(' '.repeat(gap)) : undefined;
  const children: VNode[] = [];

  for (let i = 0; i < panels.length; i++) {
    if (i > 0 && gapNode) {
      children.push(gapNode);
    }
    children.push(panels[i]!.view);
  }

  return row(...children);
}

/**
 * Wrap a VNode with a title bar and optional border.
 * Pure layout helper — no state management.
 */
export function panelFrame(content: VNode, opts?: { title?: string; titleStyle?: Style; bordered?: boolean; width?: number }): VNode {
  const children: VNode[] = [];

  if (opts?.title) {
    const titleSt = opts.titleStyle ?? style({ bold: true });
    children.push(textNode(opts.title, titleSt));
  }

  children.push(content);

  if (opts?.bordered) {
    return box(column(...children), style({ border: borderPresets.square, width: opts?.width }));
  }

  return column(...children);
}

// ── Dashboard App Config ────────────────────────────────────────────────────

/**
 * Create an Elm Architecture AppConfig for a multi-panel dashboard.
 *
 * Each chart panel gets its own ChartModel managed as part of the
 * DashboardModel. Messages are routed to the correct panel by id.
 * Static panels are rendered directly from their stored VNode.
 *
 * Returns an object matching nebula's AppConfig shape.
 */
export function dashboardAppConfig(config: DashboardConfig): {
  init: () => [DashboardModel, Cmd<DashboardMsg>];
  update: (msg: DashboardMsg, model: DashboardModel) => [DashboardModel, Cmd<DashboardMsg>];
  view: (model: DashboardModel) => VNode;
  subscriptions: (model: DashboardModel) => Sub<DashboardMsg>;
  shaders: (model: DashboardModel) => CellShader[];
} {
  const { panels: descriptors, layout = 'grid', columns: gridColumns = 2, gap = 1, title: dashboardTitle, customLayout, titleStyle: titleSt } = config;
  const columns = dashboardColumns(gridColumns);
  const panelGap = dashboardGap(gap);
  const ids = new Set<string>();
  for (const descriptor of descriptors) {
    const id = descriptor.config.id;
    if (id.trim() === '') throw new TypeError('dashboard panel id must not be empty');
    if (ids.has(id)) throw new RangeError(`duplicate dashboard panel id: ${id}`);
    ids.add(id);
  }

  // ── init ───────────────────────────────────────────────────────────

  function init(): [DashboardModel, Cmd<DashboardMsg>] {
    const panels: PanelState[] = [];
    const cmds: Cmd<DashboardMsg>[] = [];

    for (const desc of descriptors) {
      if (desc.kind === 'chart') {
        const { id, title, chart, colSpan = 1, minWidth = 20, minHeight = 5 } = desc.config;
        const [chartModel, chartCmd] = chart.init();
        panels.push({
          kind: 'chart',
          id,
          title,
          model: chartModel,
          chart,
          colSpan: boundedPositiveInteger(colSpan, 1, MAX_DASHBOARD_COLUMNS),
          minWidth: boundedPositiveInteger(minWidth, 20, MAX_PANEL_EXTENT),
          minHeight: boundedPositiveInteger(minHeight, 5, MAX_PANEL_EXTENT),
        });
        if (chartCmd) {
          cmds.push(
            CmdNS.map(
              chartCmd,
              (cm: ChartMsg): DashboardMsg => ({
                type: 'dashboard:chartMsg',
                panelId: id,
                msg: cm,
              }),
            ),
          );
        }
      } else {
        const { id, title, content, colSpan = 1, minWidth = 20, minHeight = 3 } = desc.config;
        panels.push({
          kind: 'static',
          id,
          title,
          content,
          colSpan: boundedPositiveInteger(colSpan, 1, MAX_DASHBOARD_COLUMNS),
          minWidth: boundedPositiveInteger(minWidth, 20, MAX_PANEL_EXTENT),
          minHeight: boundedPositiveInteger(minHeight, 3, MAX_PANEL_EXTENT),
        });
      }
    }

    const model: DashboardModel = {
      panels,
      activePanelIndex: 0,
      title: dashboardTitle,
    };

    return [model, cmds.length > 0 ? CmdNS.batch(...cmds) : CmdNS.none()];
  }

  // ── update ─────────────────────────────────────────────────────────

  function update(msg: DashboardMsg, model: DashboardModel): [DashboardModel, Cmd<DashboardMsg>] {
    switch (msg.type) {
      case 'dashboard:chartMsg': {
        const { panelId, msg: chartMsg } = msg;
        const panelIndex = model.panels.findIndex((p) => p.id === panelId);
        if (panelIndex < 0) return [model, CmdNS.none()];
        const panel = model.panels[panelIndex]!;
        if (panel.kind !== 'chart') return [model, CmdNS.none()];

        const [newChartModel, chartCmd] = panel.chart.update(chartMsg, panel.model);
        const newPanels = [...model.panels];
        newPanels[panelIndex] = { ...panel, model: newChartModel };

        const mappedCmd = CmdNS.map(
          chartCmd,
          (cm: ChartMsg): DashboardMsg => ({
            type: 'dashboard:chartMsg',
            panelId,
            msg: cm,
          }),
        );

        return [{ ...model, panels: newPanels }, mappedCmd];
      }

      case 'dashboard:layout': {
        // Forward layout rects to each chart panel
        let newModel = model;
        const cmds: Cmd<DashboardMsg>[] = [];
        for (let panelIndex = 0; panelIndex < newModel.panels.length; panelIndex++) {
          const panel = newModel.panels[panelIndex]!;
          if (panel.kind === 'chart') {
            const layoutMsg: ChartMsg = { type: 'chart:layout', rects: msg.rects };
            const [newChartModel, chartCmd] = panel.chart.update(layoutMsg, panel.model);
            if (newChartModel !== panel.model) {
              const newPanels = [...newModel.panels];
              newPanels[panelIndex] = { ...panel, model: newChartModel };
              newModel = { ...newModel, panels: newPanels };
            }
            cmds.push(CmdNS.map(chartCmd, (chartMsg): DashboardMsg => ({ type: 'dashboard:chartMsg', panelId: panel.id, msg: chartMsg })));
          }
        }
        return [newModel, cmds.length > 0 ? CmdNS.batch(...cmds) : CmdNS.none()];
      }

      case 'dashboard:mouse': {
        // Forward mouse events to the active chart panel (if it's a chart)
        const activePanel = model.panels[model.activePanelIndex];
        if (!activePanel || activePanel.kind !== 'chart') return [model, CmdNS.none()];

        const mouseMsg: ChartMsg = { type: 'chart:mouse', event: msg.event };
        const [newChartModel, chartCmd] = activePanel.chart.update(mouseMsg, activePanel.model);
        const newPanels = [...model.panels];
        newPanels[model.activePanelIndex] = { ...activePanel, model: newChartModel };

        const mappedCmd = CmdNS.map(
          chartCmd,
          (cm: ChartMsg): DashboardMsg => ({
            type: 'dashboard:chartMsg',
            panelId: activePanel.id,
            msg: cm,
          }),
        );

        return [{ ...model, panels: newPanels }, mappedCmd];
      }

      case 'dashboard:animFrame': {
        // Forward animation frames to all chart panels with active animations
        let newModel = model;
        const cmds: Cmd<DashboardMsg>[] = [];

        for (const panel of model.panels) {
          if (panel.kind === 'chart' && panel.model.animation?.active) {
            const animMsg: ChartMsg = { type: 'chart:animFrame', frame: msg.frame };
            const [newChartModel, chartCmd] = panel.chart.update(animMsg, panel.model);
            const newPanels = [...newModel.panels];
            const idx = newPanels.findIndex((p) => p.id === panel.id);
            if (idx >= 0) {
              newPanels[idx] = { ...panel, model: newChartModel };
              newModel = { ...newModel, panels: newPanels };
            }
            cmds.push(
              CmdNS.map(
                chartCmd,
                (cm: ChartMsg): DashboardMsg => ({
                  type: 'dashboard:chartMsg',
                  panelId: panel.id,
                  msg: cm,
                }),
              ),
            );
          }
        }

        return [newModel, cmds.length > 0 ? CmdNS.batch(...cmds) : CmdNS.none()];
      }

      case 'dashboard:focusPanel': {
        if (model.panels.length === 0) return [model, CmdNS.none()];
        const idx = Math.max(0, Math.min(Math.trunc(finiteNumber(msg.index, model.activePanelIndex)), model.panels.length - 1));
        if (idx === model.activePanelIndex) return [model, CmdNS.none()];
        return [{ ...model, activePanelIndex: idx }, CmdNS.none()];
      }

      case 'dashboard:nextPanel': {
        if (model.panels.length === 0) return [model, CmdNS.none()];
        const next = (model.activePanelIndex + 1) % model.panels.length;
        return [{ ...model, activePanelIndex: next }, CmdNS.none()];
      }

      case 'dashboard:prevPanel': {
        if (model.panels.length === 0) return [model, CmdNS.none()];
        const prev = (model.activePanelIndex - 1 + model.panels.length) % model.panels.length;
        return [{ ...model, activePanelIndex: prev }, CmdNS.none()];
      }

      case 'dashboard:updateData': {
        const { panelId, data } = msg;
        const idx = model.panels.findIndex((p) => p.id === panelId);
        if (idx < 0) return [model, CmdNS.none()];
        const panel = model.panels[idx]!;
        if (panel.kind !== 'chart') return [model, CmdNS.none()];

        const setDataMsg: ChartMsg = { type: 'chart:setData', data: data as number[] };
        const [newChartModel, chartCmd] = panel.chart.update(setDataMsg, panel.model);
        const newPanels = [...model.panels];
        newPanels[idx] = { ...panel, model: newChartModel };

        const mappedCmd = CmdNS.map(
          chartCmd,
          (cm: ChartMsg): DashboardMsg => ({
            type: 'dashboard:chartMsg',
            panelId,
            msg: cm,
          }),
        );

        return [{ ...model, panels: newPanels }, mappedCmd];
      }
    }
  }

  // ── view ───────────────────────────────────────────────────────────

  function view(model: DashboardModel): VNode {
    const panelViews: Array<{ id: string; view: VNode; colSpan: number }> = [];

    for (let i = 0; i < model.panels.length; i++) {
      const panel = model.panels[i]!;
      const isActive = i === model.activePanelIndex;
      let panelView: VNode;

      if (panel.kind === 'chart') {
        panelView = panel.chart.view(panel.model);
      } else {
        panelView = panel.content;
      }

      // Wrap with panel frame (title + optional active indicator)
      const framedView = flex(
        panelFrame(panelView, {
          title: panel.title ? (isActive ? `> ${panel.title}` : `  ${panel.title}`) : undefined,
          titleStyle: isActive ? style({ bold: true }) : style({ dim: true }),
        }),
        { flex: 1, minWidth: panel.minWidth, minHeight: panel.minHeight },
      );

      panelViews.push({ id: panel.id, view: framedView, colSpan: panel.colSpan });
    }

    // Apply layout
    let body: VNode;
    if (layout === 'custom' && customLayout) {
      body = customLayout(panelViews);
    } else if (layout === 'rows') {
      body = dashboardStack(panelViews, { gap: panelGap });
    } else if (layout === 'columns') {
      body = dashboardRow(panelViews, { gap: panelGap });
    } else {
      // grid (default)
      body = dashboardGrid(panelViews, { columns, gap: panelGap });
    }

    // Add global title if configured
    if (model.title) {
      const ts = titleSt ?? style({ bold: true });
      return column(textNode(model.title, ts), textNode(''), body);
    }

    return body;
  }

  // ── subscriptions ──────────────────────────────────────────────────

  function subscriptions(model: DashboardModel): Sub<DashboardMsg> {
    const subs: Sub<DashboardMsg>[] = [];

    // Layout feedback for all chart panels
    const chartIds = model.panels.filter((p): p is ChartPanelState => p.kind === 'chart').map((p) => p.id);

    if (chartIds.length > 0) {
      subs.push(
        SubNS.layout<DashboardMsg>(chartIds, (rects) => ({
          type: 'dashboard:layout',
          rects,
        })),
      );
    }

    // Mouse events (forwarded to active chart panel)
    const hasInteractive = model.panels.some((p) => p.kind === 'chart' && p.model.gesture !== null);
    if (hasInteractive) {
      subs.push(
        SubNS.mouse<DashboardMsg>((event) => ({
          type: 'dashboard:mouse',
          event,
        })),
      );
    }

    // Animation frames (if any chart has active animation)
    const hasAnimation = model.panels.some((p) => p.kind === 'chart' && p.model.animation?.active);
    if (hasAnimation) {
      subs.push(
        SubNS.animationFrame<DashboardMsg>((frame) => ({
          type: 'dashboard:animFrame',
          frame,
        })),
      );
    }

    // Keyboard navigation: Tab/Shift+Tab to switch panels
    if (model.panels.length > 1) subs.push(SubNS.key<DashboardMsg>('tab', { type: 'dashboard:nextPanel' }));

    return subs.length > 0 ? SubNS.batch(...subs) : SubNS.none<DashboardMsg>();
  }

  // ── shaders ────────────────────────────────────────────────────────

  function shaders(model: DashboardModel): CellShader[] {
    const all: CellShader[] = [];
    for (const panel of model.panels) {
      if (panel.kind === 'chart') {
        all.push(...panel.chart.shaders(panel.model));
      }
    }
    return all;
  }

  return { init, update, view, subscriptions, shaders };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Get a specific panel's chart model from the dashboard model.
 * Returns undefined if the panel doesn't exist or isn't a chart panel.
 */
export function getPanelModel(model: DashboardModel, panelId: string): ChartModel | undefined {
  const panel = model.panels.find((p) => p.id === panelId);
  if (!panel || panel.kind !== 'chart') return undefined;
  return panel.model;
}

/**
 * Create a message to update a specific panel's data.
 */
export function updatePanelData(panelId: string, data: unknown): DashboardMsg {
  return { type: 'dashboard:updateData', panelId, data };
}

/**
 * Get all panel IDs from a dashboard model.
 */
export function getPanelIds(model: DashboardModel): string[] {
  return model.panels.map((p) => p.id);
}

/**
 * Count chart panels in a dashboard model.
 */
export function getChartPanelCount(model: DashboardModel): number {
  return model.panels.filter((p) => p.kind === 'chart').length;
}
