import { color } from '@celestial/core/corona';
import { column, text, type VNode } from '@celestial/core/nebula';
import type { Direction, PaneId } from './focus.js';
import { type StateUpdateResult, stateUpdateResult } from './state/update.js';

export interface KeyBindingConfig {
  focus?: {
    next?: string;
    prev?: string;
    up?: string;
    down?: string;
    left?: string;
    right?: string;
  };
  panes?: Record<PaneId, string>;
  workspace?: {
    next?: string;
    prev?: string;
    overview?: string;
  };
  custom?: Array<{ key: string; action: string }>;
}

export interface KeyBindingModel {
  config: KeyBindingConfig;
  activePaneId: PaneId | null;
  paneIds: PaneId[];
}

export type KeyBindingAction =
  | { type: 'focus-next' }
  | { type: 'focus-prev' }
  | { type: 'focus-direction'; direction: Direction }
  | { type: 'focus-pane'; paneId: PaneId }
  | { type: 'workspace-next' }
  | { type: 'workspace-prev' }
  | { type: 'workspace-overview' }
  | { type: 'custom'; action: string };

export type KeyBindingMsg =
  | { type: 'set-config'; config: KeyBindingConfig }
  | { type: 'register-pane'; paneId: PaneId }
  | { type: 'unregister-pane'; paneId: PaneId }
  | { type: 'set-active'; paneId: PaneId | null };

const defaultConfig: KeyBindingConfig = {
  focus: {
    next: 'tab',
    prev: 'shift+tab',
    up: 'up',
    down: 'down',
    left: 'left',
    right: 'right',
  },
  panes: {},
  workspace: {
    next: 'ctrl+pagedown',
    prev: 'ctrl+pageup',
    overview: 'ctrl+shift+o',
  },
  custom: [],
};

export function createKeybindingModel(config?: Partial<KeyBindingConfig>): KeyBindingModel {
  return {
    config: { ...defaultConfig, ...config },
    activePaneId: null,
    paneIds: [],
  };
}

export function keybindingUpdate(msg: KeyBindingMsg, model: KeyBindingModel): KeyBindingModel {
  switch (msg.type) {
    case 'set-config':
      return { ...model, config: { ...defaultConfig, ...msg.config } };

    case 'register-pane':
      if (model.paneIds.includes(msg.paneId)) return model;
      return {
        ...model,
        paneIds: [...model.paneIds, msg.paneId],
        activePaneId: model.activePaneId ?? msg.paneId,
      };

    case 'unregister-pane':
      return {
        ...model,
        paneIds: model.paneIds.filter((id) => id !== msg.paneId),
        activePaneId: model.activePaneId === msg.paneId ? null : model.activePaneId,
      };

    case 'set-active':
      return { ...model, activePaneId: msg.paneId };

    default:
      return model;
  }
}

export function keybindingUpdateResult(msg: KeyBindingMsg, model: KeyBindingModel): StateUpdateResult<KeyBindingModel> {
  return stateUpdateResult(keybindingUpdate(msg, model));
}

export function getActivePane(model: KeyBindingModel): PaneId | null {
  return model.activePaneId;
}

export function resolveKeyAction(key: string, model: KeyBindingModel): KeyBindingAction | null {
  const { config } = model;

  if (config.focus?.next === key) return { type: 'focus-next' };
  if (config.focus?.prev === key) return { type: 'focus-prev' };
  if (config.focus?.up === key) return { type: 'focus-direction', direction: 'up' };
  if (config.focus?.down === key) return { type: 'focus-direction', direction: 'down' };
  if (config.focus?.left === key) return { type: 'focus-direction', direction: 'left' };
  if (config.focus?.right === key) return { type: 'focus-direction', direction: 'right' };

  if (config.panes) {
    for (const [paneId, paneKey] of Object.entries(config.panes)) {
      if (paneKey === key) {
        return { type: 'focus-pane', paneId };
      }
    }
  }

  if (config.workspace?.next === key) return { type: 'workspace-next' };
  if (config.workspace?.prev === key) return { type: 'workspace-prev' };
  if (config.workspace?.overview === key) return { type: 'workspace-overview' };

  if (config.custom) {
    for (const custom of config.custom) {
      if (custom.key === key) {
        return { type: 'custom', action: custom.action };
      }
    }
  }

  return null;
}

export function keybindingHelp(model: KeyBindingModel, options?: { showPaneIds?: boolean }): VNode {
  const { config } = model;
  const C = {
    dim: color.gray.fg(),
    cyan: color.cyan.fg(),
    reset: color.reset.fg(),
  };

  const lines: string[] = [];

  lines.push(`${C.cyan}Keybindings${C.reset}`);
  lines.push('');

  if (config.focus) {
    lines.push(`${C.dim}Focus:${C.reset}`);
    if (config.focus.next) lines.push(`  [${config.focus.next}] Next pane`);
    if (config.focus.prev) lines.push(`  [${config.focus.prev}] Previous pane`);
    if (config.focus.up) lines.push(`  [${config.focus.up}] Focus up`);
    if (config.focus.down) lines.push(`  [${config.focus.down}] Focus down`);
    if (config.focus.left) lines.push(`  [${config.focus.left}] Focus left`);
    if (config.focus.right) lines.push(`  [${config.focus.right}] Focus right`);
    lines.push('');
  }

  if (config.panes && Object.keys(config.panes).length > 0) {
    lines.push(`${C.dim}Panes:${C.reset}`);
    for (const [paneId, key] of Object.entries(config.panes)) {
      lines.push(`  [${key}] Focus ${paneId}`);
    }
    lines.push('');
  }

  if (options?.showPaneIds && model.paneIds.length > 0) {
    lines.push(`${C.dim}Registered Panes:${C.reset}`);
    lines.push(`  ${model.paneIds.join(', ')}`);
    lines.push('');
  }

  return column(...lines.map((l) => text(l)));
}
