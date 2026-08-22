import { border, color, style } from '@celestial/corona';
import type { AppHandle } from '../app/contracts.js';
import { box, column, layerStack, overlay, row, text } from '../elements.js';
import type { HitRegionInfo } from '../hit-regions.js';
import type { Plugin } from '../plugin.js';
import { Cmd, Sub } from '../types.js';
import type { LayoutPlan, VNode } from '../vdom.js';

export interface DevToolsOptions {
  /** Whether the overlay starts visible. Default false — cycle with F12 or Ctrl+Shift+D. */
  enabled?: boolean;
  /** Maximum retained message records. Default 50. */
  maxMessages?: number;
  initialMode?: 'none' | 'layout' | 'hitboxes' | 'messages';
}

export interface DevToolsMessageRecord {
  type: string;
  timestamp: number;
  payload?: unknown;
}

export interface DevToolsState {
  enabled: boolean;
  mode: 'none' | 'layout' | 'hitboxes' | 'messages';
  messages: DevToolsMessageRecord[];
}

export interface DevToolsController<Model, M> {
  readonly state: DevToolsState;
  /** The plugin that wires recording, keybindings, and the overlay into the app. */
  readonly plugin: Plugin<Model, M>;
  /**
   * Attach the running app's handle so the layout and hitbox modes can read
   * the most recently committed frame. Without a handle those modes report
   * that no frame data is available yet.
   */
  attach(handle: AppHandle<M>): void;
  toggleMode(): void;
  recordMessage(msg: unknown): void;
  setEnabled(enabled: boolean): void;
}

/**
 * Internal message dispatched by the DevTools key subscriptions. Intercepted
 * by the plugin's wrapped update before it can reach the app's update.
 */
const CYCLE_MESSAGE = Object.freeze({ type: 'celestial.devtools.cycle' });

function msgType(msg: unknown): string {
  if (typeof msg === 'object' && msg !== null && 'type' in msg) return String((msg as { type: unknown }).type);
  return typeof msg;
}

function summarizeHandlers(region: HitRegionInfo): string {
  const names: string[] = [];
  const handlers = region.handlers as Record<string, unknown>;
  for (const key of ['onClick', 'onRightClick', 'onMouseDown', 'onMouseUp', 'onMouseEnter', 'onMouseLeave']) {
    const value = handlers[key];
    if (typeof value === 'string') names.push(`${key.replace('on', '').toLowerCase()}:${value}`);
    else if (value) names.push(key.replace('on', '').toLowerCase());
  }
  return names.join(' ');
}

/**
 * Create an in-terminal DevTools overlay wired into the Elm runtime as a
 * plugin: every message flowing through `update` is recorded, F12 / Ctrl+D
 * cycles modes, and the overlay renders as a passive layer that never takes
 * focus or intercepts the app's input.
 *
 * ```ts
 * const devtools = createDevTools<Model, Msg>();
 * const handle = app(withPlugins(config, [devtools.plugin]));
 * devtools.attach(handle);
 * ```
 */
export function createDevTools<Model = any, M = any>(options?: DevToolsOptions): DevToolsController<Model, M> {
  const maxMessages = options?.maxMessages ?? 50;
  const state: DevToolsState = {
    enabled: options?.enabled ?? false,
    mode: options?.initialMode ?? 'none',
    messages: [],
  };

  let handle: AppHandle<M> | null = null;

  function toggleMode(): void {
    if (state.mode === 'none') state.mode = 'messages';
    else if (state.mode === 'messages') state.mode = 'layout';
    else if (state.mode === 'layout') state.mode = 'hitboxes';
    else state.mode = 'none';
  }

  function recordMessage(msg: unknown): void {
    state.messages.push({ type: msgType(msg), timestamp: Date.now(), payload: msg });
    if (state.messages.length > maxMessages) {
      state.messages.splice(0, state.messages.length - maxMessages);
    }
  }

  function renderMessagesHud(hudLines: VNode[]): void {
    hudLines.push(text('──────────────────────────────────────────────', style({ dim: true, color: color.gray })));
    hudLines.push(text(`Recent Messages (${state.messages.length}):`, style({ bold: true })));
    const recent = state.messages.slice(-8);
    if (recent.length === 0) {
      hudLines.push(text('  No messages recorded yet', style({ dim: true })));
      return;
    }
    for (const m of recent) {
      const time = new Date(m.timestamp).toISOString().slice(11, 19);
      hudLines.push(
        row(
          text(`  ${time} `, style({ dim: true, color: color.gray })),
          text(m.type, style({ color: color.brightGreen, bold: true })),
        ),
      );
    }
  }

  function renderLayoutHud(hudLines: VNode[], plan: LayoutPlan | null): void {
    hudLines.push(text('──────────────────────────────────────────────', style({ dim: true, color: color.gray })));
    hudLines.push(text('Layout Inspector', style({ bold: true })));
    if (!plan) {
      hudLines.push(text('  No committed frame yet — attach() the app handle', style({ dim: true })));
      return;
    }
    hudLines.push(text(`  Viewport: ${plan.width}x${plan.height}`));
    hudLines.push(text(`  Planned nodes: ${plan.index.size}`, style({ dim: true })));
    if (plan.stats) {
      const stats = Object.entries(plan.stats)
        .filter(([, v]) => typeof v === 'number')
        .slice(0, 4)
        .map(([k, v]) => `${k}=${v}`)
        .join('  ');
      if (stats) hudLines.push(text(`  ${stats}`, style({ dim: true })));
    }
  }

  function renderHitboxesHud(hudLines: VNode[], regions: readonly HitRegionInfo[]): void {
    hudLines.push(text('──────────────────────────────────────────────', style({ dim: true, color: color.gray })));
    hudLines.push(text(`Hit Regions (${regions.length})`, style({ bold: true })));
    if (regions.length === 0) {
      hudLines.push(text('  No interactive regions in the last frame', style({ dim: true })));
      return;
    }
    for (const region of regions.slice(0, 8)) {
      const { x, y, width, height } = region.rect;
      const summary = summarizeHandlers(region);
      hudLines.push(
        row(
          text(`  ${region.id} `, style({ color: color.brightCyan })),
          text(`(${x},${y} ${width}x${height})`, style({ dim: true, color: color.gray })),
          summary ? text(` ${summary}`, style({ dim: true })) : text(''),
        ),
      );
    }
    if (regions.length > 8) {
      hudLines.push(text(`  …and ${regions.length - 8} more`, style({ dim: true })));
    }
  }

  function renderOverlay(baseTree: VNode): VNode {
    if (!state.enabled || state.mode === 'none') {
      return baseTree;
    }

    const hudLines: VNode[] = [
      row(
        text(' [Celestial DevTools] ', style({ bold: true, color: color.black, background: color.brightCyan })),
        text(` Mode: ${state.mode.toUpperCase()} `, style({ bold: true, color: color.brightWhite, background: color.rgb(40, 50, 70) })),
        text(' (F12/Ctrl+D to cycle) ', style({ dim: true, color: color.gray })),
      ),
    ];

    if (state.mode === 'messages') {
      renderMessagesHud(hudLines);
    } else if (state.mode === 'layout') {
      renderLayoutHud(hudLines, handle?.getLayoutPlan() ?? null);
    } else if (state.mode === 'hitboxes') {
      renderHitboxesHud(hudLines, handle?.getHitRegions() ?? []);
    }

    const hudCard = box(column(...hudLines), style({
      border: border.rounded,
      borderColor: color.brightCyan,
      background: color.rgb(15, 20, 30),
      padding: 1,
    }));

    // Passive overlay: the HUD never joins the focus order and never owns
    // pointer input — it is an inspection surface, not an app layer.
    return layerStack(
      baseTree,
      overlay(hudCard, { x: 2, y: 1, zIndex: 1000, focusMode: 'passive', pointerEvents: 'none' }),
    );
  }

  const plugin: Plugin<Model, M> = {
    name: 'devtools',
    wrap(config) {
      const cycle = CYCLE_MESSAGE as unknown as M;
      return {
        ...config,
        update(msg, model) {
          if (msg === cycle) {
            toggleMode();
            return [model, Cmd.none()];
          }
          recordMessage(msg);
          return config.update(msg, model);
        },
        view(model) {
          return renderOverlay(config.view(model));
        },
        subscriptions(model) {
          // F12 is always detectable. Ctrl+D arrives as \x04 in legacy input;
          // terminals with enhanced keyboard reporting can distinguish
          // Ctrl+Shift+D, which is subscribed separately because modifier
          // matching is exact.
          return Sub.batch(
            config.subscriptions(model),
            Sub.key('f12', cycle),
            Sub.keyWithModifiers('d', { ctrl: true }, cycle),
            Sub.keyWithModifiers('d', { ctrl: true, shift: true }, cycle),
          );
        },
      };
    },
  };

  return {
    state,
    plugin,
    attach(nextHandle) {
      handle = nextHandle;
      // Layout and hitbox modes read the previously committed frame; nudge one
      // render so the HUD reflects real frame data immediately after attach.
      if (state.enabled && state.mode !== 'none') {
        handle.requestRedraw();
      }
    },
    toggleMode,
    recordMessage,
    setEnabled(enabled) {
      state.enabled = enabled;
    },
  };
}
