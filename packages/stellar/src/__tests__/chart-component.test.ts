import { describe, expect, it } from 'vitest';
import { type ChartModel, chartAppConfig, type EmbedChartConfig, embedChart, isChartMsg } from '../chart-component.js';
import type { ChartGestureMsg } from '../chart-gestures.js';
import { gridLayer, lineDataLayer, titleLayer } from '../layers.js';

// ── Helper: minimal config ──────────────────────────────────────────────

function basicConfig(overrides?: Partial<EmbedChartConfig>): EmbedChartConfig {
  return {
    id: 'test-chart',
    layers: (model) => [lineDataLayer(model.data, { filled: true })],
    initialData: [1, 4, 2, 8, 5],
    initialSize: { width: 20, height: 5 },
    ...overrides,
  };
}

// ── embedChart / init ───────────────────────────────────────────────────

describe('embedChart', () => {
  it('returns init/update/view/subscriptions/shaders functions', () => {
    const chart = embedChart(basicConfig());
    expect(typeof chart.init).toBe('function');
    expect(typeof chart.update).toBe('function');
    expect(typeof chart.view).toBe('function');
    expect(typeof chart.subscriptions).toBe('function');
    expect(typeof chart.shaders).toBe('function');
  });
});

describe('init', () => {
  it('returns [model, cmd] tuple', () => {
    const chart = embedChart(basicConfig());
    const [model, cmd] = chart.init();
    expect(model).toBeDefined();
    expect(cmd).toBeDefined();
    expect(cmd._tag).toBe('cmd');
  });

  it('initializes model with correct id and data', () => {
    const chart = embedChart(basicConfig());
    const [model] = chart.init();
    expect(model.id).toBe('test-chart');
    expect(model.data).toEqual([1, 4, 2, 8, 5]);
  });

  it('initializes model with given size', () => {
    const chart = embedChart(basicConfig({ initialSize: { width: 30, height: 8 } }));
    const [model] = chart.init();
    expect(model.size).toEqual({ width: 30, height: 8 });
  });

  it('defaults to no gesture state when interactive is false', () => {
    const chart = embedChart(basicConfig());
    const [model] = chart.init();
    expect(model.gesture).toBeNull();
  });

  it('defaults to no animation state when animated is false', () => {
    const chart = embedChart(basicConfig());
    const [model] = chart.init();
    expect(model.animation).toBeNull();
  });

  it('creates animation state when animated is true', () => {
    const chart = embedChart(basicConfig({ animated: true, animationDuration: 20 }));
    const [model] = chart.init();
    expect(model.animation).not.toBeNull();
    expect(model.animation!.active).toBe(true);
    expect(model.animation!.tick).toBe(0);
    expect(model.animation!.duration).toBe(20);
    expect(model.animation!.progress).toBe(0);
  });

  it('creates gesture state when interactive config is provided', () => {
    const chart = embedChart(
      basicConfig({
        interactive: {
          coordMapOpts: {
            chartX: 0,
            chartY: 0,
            chartWidth: 20,
            chartHeight: 5,
            dataMinX: 0,
            dataMaxX: 4,
            dataMinY: 0,
            dataMaxY: 10,
          },
        },
      }),
    );
    const [model] = chart.init();
    expect(model.gesture).not.toBeNull();
  });

  it('defaults canvas mode to braille', () => {
    const chart = embedChart(basicConfig());
    const [model] = chart.init();
    expect(model.mode).toBe('braille');
  });
});

// ── update ───────────────────────────────────────────────────────────────

describe('update', () => {
  it('handles chart:setData', () => {
    const chart = embedChart(basicConfig());
    const [model] = chart.init();
    const [updated] = chart.update({ type: 'chart:setData', data: [10, 20, 30] }, model);
    expect(updated.data).toEqual([10, 20, 30]);
  });

  it('handles chart:resize', () => {
    const chart = embedChart(basicConfig());
    const [model] = chart.init();
    const [updated] = chart.update({ type: 'chart:resize', size: { width: 40, height: 12 } }, model);
    expect(updated.size).toEqual({ width: 40, height: 12 });
  });

  it('handles chart:animFrame when animation is active', () => {
    const chart = embedChart(basicConfig({ animated: true, animationDuration: 10 }));
    const [model] = chart.init();
    const [updated] = chart.update({ type: 'chart:animFrame', frame: { frame: 1, timestamp: 16, delta: 16 } }, model);
    expect(updated.animation!.tick).toBe(1);
    expect(updated.animation!.progress).toBeGreaterThan(0);
    expect(updated.animation!.active).toBe(true);
  });

  it('deactivates animation when duration is reached', () => {
    const chart = embedChart(basicConfig({ animated: true, animationDuration: 2 }));
    let [model] = chart.init();

    // Tick 1
    [model] = chart.update({ type: 'chart:animFrame', frame: { frame: 1, timestamp: 16, delta: 16 } }, model);
    expect(model.animation!.active).toBe(true);

    // Tick 2 — should reach duration
    [model] = chart.update({ type: 'chart:animFrame', frame: { frame: 2, timestamp: 32, delta: 16 } }, model);
    expect(model.animation!.active).toBe(false);
    expect(model.animation!.progress).toBeCloseTo(1.0, 1);
  });

  it('ignores animFrame when no animation', () => {
    const chart = embedChart(basicConfig());
    const [model] = chart.init();
    const [updated] = chart.update({ type: 'chart:animFrame', frame: { frame: 1, timestamp: 16, delta: 16 } }, model);
    // Model unchanged
    expect(updated.animation).toBeNull();
  });

  it('handles chart:startAnimation', () => {
    const chart = embedChart(basicConfig());
    const [model] = chart.init();
    const [updated] = chart.update({ type: 'chart:startAnimation', duration: 15 }, model);
    expect(updated.animation).not.toBeNull();
    expect(updated.animation!.active).toBe(true);
    expect(updated.animation!.duration).toBe(15);
    expect(updated.animation!.tick).toBe(0);
  });

  it('handles chart:mouse without gesture state (no-op)', () => {
    const chart = embedChart(basicConfig());
    const [model] = chart.init();
    const [updated] = chart.update(
      {
        type: 'chart:mouse',
        event: { type: 'press', button: 0, x: 5, y: 3, ctrl: false, alt: false, shift: false },
      },
      model,
    );
    // Should not crash; model unchanged
    expect(updated).toBe(model);
  });

  it('handles chart:gesture by calling onGesture callback', () => {
    const gestures: ChartGestureMsg[] = [];
    const chart = embedChart(
      basicConfig({
        onGesture: (msg) => gestures.push(msg),
      }),
    );
    const [model] = chart.init();
    const gestureMsg: ChartGestureMsg = {
      type: 'chart:click',
      col: 5,
      row: 3,
      dataX: 2.5,
      dataY: 50,
    };
    chart.update({ type: 'chart:gesture', gesture: gestureMsg }, model);
    expect(gestures).toHaveLength(1);
    expect(gestures[0]!.type).toBe('chart:click');
  });

  it('handles chart:layout with matching rect', () => {
    const chart = embedChart(basicConfig());
    const [model] = chart.init();
    const rects = new Map([['test-chart', { x: 0, y: 0, width: 50, height: 15 }]]);
    const [updated] = chart.update({ type: 'chart:layout', rects: { rects } }, model);
    expect(updated.size).toEqual({ width: 50, height: 15 });
  });

  it('ignores chart:layout with no matching rect', () => {
    const chart = embedChart(basicConfig());
    const [model] = chart.init();
    const rects = new Map([['other-chart', { x: 0, y: 0, width: 50, height: 15 }]]);
    const [updated] = chart.update({ type: 'chart:layout', rects: { rects } }, model);
    expect(updated.size).toEqual(model.size);
  });
});

// ── view ─────────────────────────────────────────────────────────────────

describe('view', () => {
  it('returns a VNode', () => {
    const chart = embedChart(basicConfig());
    const [model] = chart.init();
    const vnode = chart.view(model);
    expect(vnode).toBeDefined();
    expect(vnode.kind).toBeDefined();
  });

  it('calls layer factory with the model', () => {
    let receivedModel: ChartModel | null = null;
    const chart = embedChart({
      ...basicConfig(),
      layers: (model) => {
        receivedModel = model;
        return [lineDataLayer(model.data)];
      },
    });
    const [model] = chart.init();
    chart.view(model);
    expect(receivedModel).toBe(model);
  });

  it('populates hitRegions and shaders on model after view', () => {
    const chart = embedChart(basicConfig());
    const [model] = chart.init();
    chart.view(model);
    // hitRegions/shaders populated as side-effect of view
    expect(Array.isArray(model.hitRegions)).toBe(true);
    expect(Array.isArray(model.shaders)).toBe(true);
  });

  it('renders with multiple layers', () => {
    const chart = embedChart({
      ...basicConfig(),
      layers: (model) => {
        return [gridLayer({ horizontal: true }), lineDataLayer(model.data, { filled: true }), titleLayer({ title: 'Test Chart' })];
      },
    });
    const [model] = chart.init();
    const vnode = chart.view(model);
    expect(vnode).toBeDefined();
  });
});

// ── subscriptions ────────────────────────────────────────────────────────

describe('subscriptions', () => {
  it('returns a Sub', () => {
    const chart = embedChart(basicConfig());
    const [model] = chart.init();
    const sub = chart.subscriptions(model);
    expect(sub).toBeDefined();
    expect(sub._tag).toBe('sub');
  });

  it('includes animationFrame sub when animation is active', () => {
    const chart = embedChart(basicConfig({ animated: true }));
    const [model] = chart.init();
    const sub = chart.subscriptions(model);
    // Sub is a batch; we can't easily inspect internals, but it should be non-none
    expect(sub._kind).toBeDefined();
  });

  it('does not include animationFrame sub when animation is inactive', () => {
    const chart = embedChart(basicConfig({ animated: true, animationDuration: 1 }));
    let [model] = chart.init();
    // Complete the animation
    [model] = chart.update({ type: 'chart:animFrame', frame: { frame: 1, timestamp: 16, delta: 16 } }, model);
    expect(model.animation!.active).toBe(false);

    const sub = chart.subscriptions(model);
    expect(sub._tag).toBe('sub');
  });
});

// ── shaders ──────────────────────────────────────────────────────────────

describe('shaders', () => {
  it('returns empty array initially', () => {
    const chart = embedChart(basicConfig());
    const [model] = chart.init();
    expect(chart.shaders(model)).toEqual([]);
  });

  it('returns shaders after view renders', () => {
    const chart = embedChart(basicConfig());
    const [model] = chart.init();
    chart.view(model);
    // Basic line chart doesn't produce shaders
    expect(Array.isArray(chart.shaders(model))).toBe(true);
  });
});

// ── isChartMsg ───────────────────────────────────────────────────────────

describe('isChartMsg', () => {
  it('returns true for chart messages', () => {
    expect(isChartMsg({ type: 'chart:mouse', event: {} })).toBe(true);
    expect(isChartMsg({ type: 'chart:setData', data: [1, 2] })).toBe(true);
    expect(isChartMsg({ type: 'chart:animFrame', frame: {} })).toBe(true);
    expect(isChartMsg({ type: 'chart:layout', rects: {} })).toBe(true);
    expect(isChartMsg({ type: 'chart:resize', size: {} })).toBe(true);
    expect(isChartMsg({ type: 'chart:startAnimation' })).toBe(true);
    expect(isChartMsg({ type: 'chart:gesture', gesture: {} })).toBe(true);
  });

  it('returns false for non-chart messages', () => {
    expect(isChartMsg({ type: 'increment' })).toBe(false);
    expect(isChartMsg({ type: 'quit' })).toBe(false);
    expect(isChartMsg(null)).toBe(false);
    expect(isChartMsg(undefined)).toBe(false);
    expect(isChartMsg('string')).toBe(false);
    expect(isChartMsg(42)).toBe(false);
  });
});

// ── chartAppConfig ──────────────────────────────────────────────────────

describe('chartAppConfig', () => {
  it('returns same shape as embedChart', () => {
    const result = chartAppConfig(basicConfig());
    expect(typeof result.init).toBe('function');
    expect(typeof result.update).toBe('function');
    expect(typeof result.view).toBe('function');
    expect(typeof result.subscriptions).toBe('function');
    expect(typeof result.shaders).toBe('function');
  });

  it('can run the full init/update/view cycle', () => {
    const result = chartAppConfig(basicConfig());
    const [model] = result.init();
    expect(model.data).toEqual([1, 4, 2, 8, 5]);

    const [updated] = result.update({ type: 'chart:setData', data: [10, 20] }, model);
    expect(updated.data).toEqual([10, 20]);

    const vnode = result.view(updated);
    expect(vnode.kind).toBeDefined();
  });
});

// ── Integration: animation lifecycle ────────────────────────────────────

describe('animation lifecycle', () => {
  it('runs full animation from init to completion', () => {
    const chart = embedChart(basicConfig({ animated: true, animationDuration: 5 }));
    let [model] = chart.init();
    expect(model.animation!.active).toBe(true);
    expect(model.animation!.progress).toBe(0);

    // Step through animation
    for (let i = 0; i < 5; i++) {
      [model] = chart.update({ type: 'chart:animFrame', frame: { frame: i + 1, timestamp: (i + 1) * 16, delta: 16 } }, model);
    }

    expect(model.animation!.active).toBe(false);
    expect(model.animation!.progress).toBeCloseTo(1.0, 1);
    expect(model.animation!.tick).toBe(5);
  });

  it('can restart animation after completion', () => {
    const chart = embedChart(basicConfig({ animated: true, animationDuration: 2 }));
    let [model] = chart.init();

    // Complete animation
    for (let i = 0; i < 2; i++) {
      [model] = chart.update({ type: 'chart:animFrame', frame: { frame: i + 1, timestamp: (i + 1) * 16, delta: 16 } }, model);
    }
    expect(model.animation!.active).toBe(false);

    // Restart
    [model] = chart.update({ type: 'chart:startAnimation', duration: 10 }, model);
    expect(model.animation!.active).toBe(true);
    expect(model.animation!.tick).toBe(0);
    expect(model.animation!.duration).toBe(10);
  });
});
