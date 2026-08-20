import { border, color, style } from '@celestial/corona';
import { box, column, layerStack, overlay, row, text } from '../elements.js';
import type { LayoutPlan, VNode } from '../vdom.js';

export interface DevToolsOptions {
  enabled?: boolean;
  maxMessages?: number;
  initialMode?: 'none' | 'layout' | 'hitboxes' | 'messages';
}

export interface DevToolsMessageRecord {
  type: string;
  timestamp: number;
  payload?: any;
}

export interface DevToolsState {
  enabled: boolean;
  mode: 'none' | 'layout' | 'hitboxes' | 'messages';
  messages: DevToolsMessageRecord[];
  selectedNodeIndex?: number;
}

/**
 * Creates an in-terminal DevTools controller for inspecting layout bounds,
 * hit testing regions, and runtime message flow.
 */
export function createDevTools(options?: DevToolsOptions) {
  const maxMessages = options?.maxMessages ?? 50;
  const state: DevToolsState = {
    enabled: options?.enabled ?? false,
    mode: options?.initialMode ?? 'none',
    messages: [],
  };

  function toggleMode(): void {
    if (state.mode === 'none') state.mode = 'messages';
    else if (state.mode === 'messages') state.mode = 'layout';
    else if (state.mode === 'layout') state.mode = 'hitboxes';
    else state.mode = 'none';
  }

  function recordMessage(msg: any): void {
    const type = typeof msg === 'object' && msg !== null && 'type' in msg ? String(msg.type) : typeof msg;
    state.messages.push({
      type,
      timestamp: Date.now(),
      payload: msg,
    });
    if (state.messages.length > maxMessages) {
      state.messages.shift();
    }
  }

  function renderOverlay(baseTree: VNode, layoutPlan?: LayoutPlan): VNode {
    if (!state.enabled || state.mode === 'none') {
      return baseTree;
    }

    const hudLines: VNode[] = [
      row(
        text(' [Celestial DevTools] ', style({ bold: true, color: color.black, background: color.brightCyan })),
        text(` Mode: ${state.mode.toUpperCase()} `, style({ bold: true, color: color.brightWhite, background: color.rgb(40, 50, 70) })),
        text(' (F12/Ctrl+Shift+D to cycle) ', style({ dim: true, color: color.gray })),
      ),
    ];

    if (state.mode === 'messages') {
      hudLines.push(text('──────────────────────────────────────────────', style({ dim: true, color: color.gray })));
      hudLines.push(text(`Recent Messages (${state.messages.length}):`, style({ bold: true })));
      const recent = state.messages.slice(-8);
      if (recent.length === 0) {
        hudLines.push(text('  No messages recorded yet', style({ dim: true })));
      } else {
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
    } else if (state.mode === 'layout') {
      hudLines.push(text('──────────────────────────────────────────────', style({ dim: true, color: color.gray })));
      hudLines.push(text('Layout Inspector Active', style({ bold: true })));
      if (layoutPlan) {
        hudLines.push(text(`  Viewport: ${layoutPlan.width}x${layoutPlan.height}`));
      } else {
        hudLines.push(text('  (Layout plan calculating...)', style({ dim: true })));
      }
    } else if (state.mode === 'hitboxes') {
      hudLines.push(text('──────────────────────────────────────────────', style({ dim: true, color: color.gray })));
      hudLines.push(text('HitBox & Pointer Inspector Active', style({ bold: true })));
      hudLines.push(text('  Click regions and affordance targets highlighted', style({ dim: true })));
    }

    const hudCard = box(column(...hudLines), style({
      border: border.rounded,
      borderColor: color.brightCyan,
      background: color.rgb(15, 20, 30),
      padding: 1,
    }));

    return layerStack(baseTree, overlay(hudCard, { x: 2, y: 1, zIndex: 1000 }));
  }

  return {
    state,
    toggleMode,
    recordMessage,
    renderOverlay,
  };
}
