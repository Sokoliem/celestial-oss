import { type StateUpdateResult, stateUpdateResult } from './state/update.js';

export interface PipModel {
  minimized: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PipMsg =
  | { type: 'pip-toggle' }
  | { type: 'pip-expand' }
  | { type: 'pip-minimize' }
  | { type: 'pip-move'; x: number; y: number }
  | { type: 'pip-resize'; width: number; height: number };

export function createPipModel(opts: { width: number; height: number; x?: number; y?: number }): PipModel {
  return {
    minimized: false,
    x: opts.x ?? 0,
    y: opts.y ?? 0,
    width: opts.width,
    height: opts.height,
  };
}

export function pipUpdate(msg: PipMsg, model: PipModel): PipModel {
  switch (msg.type) {
    case 'pip-toggle':
      return { ...model, minimized: !model.minimized };
    case 'pip-expand':
      return { ...model, minimized: false };
    case 'pip-minimize':
      return { ...model, minimized: true };
    case 'pip-move':
      return { ...model, x: msg.x, y: msg.y };
    case 'pip-resize':
      return { ...model, width: msg.width, height: msg.height };
  }
}

export function pipUpdateResult(msg: PipMsg, model: PipModel): StateUpdateResult<PipModel> {
  return stateUpdateResult(pipUpdate(msg, model));
}

export function isPipMinimized(model: PipModel): boolean {
  return model.minimized;
}
