/**
 * Pure state management for numbered virtual desktop workspaces.
 *
 * All functions are pure and return new immutable objects —
 * the original model is never mutated.
 */

import { type StateUpdateResult, stateUpdateResult } from './state/update.js';

export interface WorkspaceModel<M = unknown> {
  workspaces: readonly M[];
  activeIndex: number;
  overviewMode: boolean;
}

export interface WorkspaceDescriptor {
  id: string;
  name: string;
  order: number;
  activeWindowId?: string;
  focusedPaneId?: string;
  windowIds?: readonly string[];
  tabIds?: readonly string[];
  paneIds?: readonly string[];
  layoutState?: unknown;
  metadata?: Record<string, unknown>;
}

export interface DesktopWorkspaceModel {
  workspaces: readonly WorkspaceDescriptor[];
  activeWorkspaceId: string;
  overviewMode: boolean;
}

export type DesktopWorkspaceMsg =
  | { type: 'workspace-add'; workspace: WorkspaceDescriptor }
  | { type: 'workspace-remove'; id: string }
  | { type: 'workspace-rename'; id: string; name: string }
  | { type: 'workspace-reorder'; id: string; order: number }
  | { type: 'workspace-switch'; id: string }
  | { type: 'workspace-toggle-overview' }
  | { type: 'workspace-move-window'; id: string; targetWorkspaceId: string }
  | { type: 'workspace-move-tab'; id: string; targetWorkspaceId: string }
  | { type: 'workspace-move-pane'; id: string; targetWorkspaceId: string }
  | { type: 'workspace-set-focus'; id: string; activeWindowId?: string; focusedPaneId?: string };

export type WorkspaceMsg<M = unknown> =
  | { type: 'ws-switch'; index: number }
  | { type: 'ws-next' }
  | { type: 'ws-prev' }
  | { type: 'ws-toggle-overview' }
  | { type: 'ws-update'; msg: M };

export function createWorkspaceModel<M>(workspaces: M[]): WorkspaceModel<M> {
  return {
    workspaces: [...workspaces],
    activeIndex: 0,
    overviewMode: false,
  };
}

export function createWorkspaceDescriptor(input: Omit<WorkspaceDescriptor, 'order'> & Partial<Pick<WorkspaceDescriptor, 'order'>>): WorkspaceDescriptor {
  return {
    ...input,
    order: input.order ?? 0,
    windowIds: input.windowIds ? [...input.windowIds] : [],
    tabIds: input.tabIds ? [...input.tabIds] : [],
    paneIds: input.paneIds ? [...input.paneIds] : [],
  };
}

export function normalizeWorkspaceModel(input: WorkspaceModel<string | WorkspaceDescriptor> | DesktopWorkspaceModel): DesktopWorkspaceModel {
  if ('activeWorkspaceId' in input) {
    const sorted = [...input.workspaces].sort((left, right) => left.order - right.order);
    return {
      ...input,
      workspaces: sorted,
      activeWorkspaceId: sorted.some((workspace) => workspace.id === input.activeWorkspaceId) ? input.activeWorkspaceId : (sorted[0]?.id ?? ''),
    };
  }

  const workspaces = input.workspaces.map((workspace, index) =>
    typeof workspace === 'string'
      ? createWorkspaceDescriptor({ id: workspace, name: workspace, order: index })
      : createWorkspaceDescriptor({ ...workspace, order: workspace.order ?? index }),
  );
  return {
    workspaces,
    activeWorkspaceId: workspaces[Math.max(0, Math.min(input.activeIndex, workspaces.length - 1))]?.id ?? '',
    overviewMode: input.overviewMode,
  };
}

export function workspaceUpdate<M>(msg: WorkspaceMsg<M>, model: WorkspaceModel<M>, updateFn: (msg: M, workspace: M) => M): WorkspaceModel<M> {
  switch (msg.type) {
    case 'ws-switch': {
      const clamped = Math.max(0, Math.min(msg.index, model.workspaces.length - 1));
      return { ...model, activeIndex: clamped };
    }

    case 'ws-next': {
      if (model.workspaces.length === 0) return model;
      const next = (model.activeIndex + 1) % model.workspaces.length;
      return { ...model, activeIndex: next };
    }

    case 'ws-prev': {
      if (model.workspaces.length === 0) return model;
      const prev = (model.activeIndex - 1 + model.workspaces.length) % model.workspaces.length;
      return { ...model, activeIndex: prev };
    }

    case 'ws-toggle-overview': {
      return { ...model, overviewMode: !model.overviewMode };
    }

    case 'ws-update': {
      const newWorkspaces = model.workspaces.map((ws, i) => (i === model.activeIndex ? updateFn(msg.msg, ws) : ws));
      return { ...model, workspaces: newWorkspaces };
    }
  }
}

function sortedWorkspaces(workspaces: readonly WorkspaceDescriptor[]): WorkspaceDescriptor[] {
  return [...workspaces].sort((left, right) => left.order - right.order);
}

function removeId(list: readonly string[] | undefined, id: string): string[] {
  return (list ?? []).filter((item) => item !== id);
}

function appendUnique(list: readonly string[] | undefined, id: string): string[] {
  const next = removeId(list, id);
  next.push(id);
  return next;
}

function moveEntity(
  model: DesktopWorkspaceModel,
  id: string,
  targetWorkspaceId: string,
  key: 'windowIds' | 'tabIds' | 'paneIds',
  focusKey?: 'activeWindowId' | 'focusedPaneId',
): DesktopWorkspaceModel {
  if (!model.workspaces.some((workspace) => workspace.id === targetWorkspaceId)) {
    return model;
  }
  return {
    ...model,
    workspaces: sortedWorkspaces(
      model.workspaces.map((workspace) => {
        const removed = removeId(workspace[key], id);
        if (workspace.id === targetWorkspaceId) {
          return {
            ...workspace,
            [key]: appendUnique(removed, id),
            ...(focusKey ? { [focusKey]: id } : {}),
          };
        }
        return {
          ...workspace,
          [key]: removed,
          ...(focusKey && workspace[focusKey] === id ? { [focusKey]: undefined } : {}),
        };
      }),
    ),
  };
}

export function desktopWorkspaceUpdate(msg: DesktopWorkspaceMsg, model: DesktopWorkspaceModel): DesktopWorkspaceModel {
  switch (msg.type) {
    case 'workspace-add': {
      if (model.workspaces.some((workspace) => workspace.id === msg.workspace.id)) {
        return model;
      }
      return { ...model, workspaces: sortedWorkspaces([...model.workspaces, createWorkspaceDescriptor(msg.workspace)]) };
    }
    case 'workspace-remove': {
      const workspaces = sortedWorkspaces(model.workspaces.filter((workspace) => workspace.id !== msg.id));
      return {
        ...model,
        workspaces,
        activeWorkspaceId: model.activeWorkspaceId === msg.id ? (workspaces[0]?.id ?? '') : model.activeWorkspaceId,
      };
    }
    case 'workspace-rename':
      return {
        ...model,
        workspaces: model.workspaces.map((workspace) => (workspace.id === msg.id ? { ...workspace, name: msg.name } : workspace)),
      };
    case 'workspace-reorder':
      return {
        ...model,
        workspaces: sortedWorkspaces(model.workspaces.map((workspace) => (workspace.id === msg.id ? { ...workspace, order: msg.order } : workspace))),
      };
    case 'workspace-switch':
      return model.workspaces.some((workspace) => workspace.id === msg.id) ? { ...model, activeWorkspaceId: msg.id } : model;
    case 'workspace-toggle-overview':
      return { ...model, overviewMode: !model.overviewMode };
    case 'workspace-move-window':
      return moveEntity(model, msg.id, msg.targetWorkspaceId, 'windowIds', 'activeWindowId');
    case 'workspace-move-tab':
      return moveEntity(model, msg.id, msg.targetWorkspaceId, 'tabIds');
    case 'workspace-move-pane':
      return moveEntity(model, msg.id, msg.targetWorkspaceId, 'paneIds', 'focusedPaneId');
    case 'workspace-set-focus':
      return {
        ...model,
        workspaces: model.workspaces.map((workspace) =>
          workspace.id === msg.id ? { ...workspace, activeWindowId: msg.activeWindowId, focusedPaneId: msg.focusedPaneId } : workspace,
        ),
      };
  }
}

export function moveWindowToWorkspace(model: DesktopWorkspaceModel, windowId: string, targetWorkspaceId: string): DesktopWorkspaceModel {
  return desktopWorkspaceUpdate({ type: 'workspace-move-window', id: windowId, targetWorkspaceId }, model);
}

export function moveTabToWorkspace(model: DesktopWorkspaceModel, tabId: string, targetWorkspaceId: string): DesktopWorkspaceModel {
  return desktopWorkspaceUpdate({ type: 'workspace-move-tab', id: tabId, targetWorkspaceId }, model);
}

export function movePaneToWorkspace(model: DesktopWorkspaceModel, paneId: string, targetWorkspaceId: string): DesktopWorkspaceModel {
  return desktopWorkspaceUpdate({ type: 'workspace-move-pane', id: paneId, targetWorkspaceId }, model);
}

export function workspaceUpdateResult<M>(
  msg: WorkspaceMsg<M>,
  model: WorkspaceModel<M>,
  updateFn: (msg: M, workspace: M) => M,
): StateUpdateResult<WorkspaceModel<M>> {
  return stateUpdateResult(workspaceUpdate(msg, model, updateFn));
}

export function getActiveWorkspace<M>(model: WorkspaceModel<M>): M | undefined {
  return model.workspaces[model.activeIndex];
}

export function workspaceCount<M>(model: WorkspaceModel<M>): number {
  return model.workspaces.length;
}
