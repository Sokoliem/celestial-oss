import { boundedInteger, MAX_LAYOUT_ITEMS, positiveInteger } from './internal.js';

export interface BreadcrumbTrailModel {
  history: string[];
  cursor: number;
  maxLength: number;
}

export type BreadcrumbTrailMsg = { type: 'push'; id: string } | { type: 'back' } | { type: 'forward' };

export function createBreadcrumbTrailModel(maxLength = 32): BreadcrumbTrailModel {
  return {
    history: [],
    cursor: -1,
    maxLength: positiveInteger(maxLength, 32, MAX_LAYOUT_ITEMS),
  };
}

export function breadcrumbTrailUpdate(msg: BreadcrumbTrailMsg, model: BreadcrumbTrailModel): BreadcrumbTrailModel {
  const maxLength = positiveInteger(model.maxLength, 32, MAX_LAYOUT_ITEMS);
  const removed = Math.max(0, model.history.length - maxLength);
  const history = model.history.slice(removed);
  const cursor = history.length === 0 ? -1 : boundedInteger(model.cursor - removed, history.length - 1, 0, history.length - 1);
  const normalized = { history, cursor, maxLength };
  switch (msg.type) {
    case 'push':
      return pushBreadcrumb(normalized, msg.id);
    case 'back':
      return {
        ...normalized,
        cursor: normalized.cursor < 0 ? -1 : Math.max(0, normalized.cursor - 1),
      };
    case 'forward':
      return {
        ...normalized,
        cursor: normalized.cursor < 0 ? -1 : Math.min(normalized.history.length - 1, normalized.cursor + 1),
      };
  }
}

export function getCurrentBreadcrumb(model: BreadcrumbTrailModel): string | null {
  if (model.history.length === 0) return null;
  const cursor = boundedInteger(model.cursor, model.history.length - 1, 0, model.history.length - 1);
  return model.history[cursor] ?? null;
}

export function canGoBack(model: BreadcrumbTrailModel): boolean {
  return Number.isInteger(model.cursor) && model.cursor > 0 && model.cursor < model.history.length;
}

export function canGoForward(model: BreadcrumbTrailModel): boolean {
  return Number.isInteger(model.cursor) && model.cursor >= 0 && model.cursor < model.history.length - 1;
}

export function pushFocusChange(model: BreadcrumbTrailModel, previousId: string | null, nextId: string | null): BreadcrumbTrailModel {
  if (!nextId || previousId === nextId) {
    return model;
  }

  return pushBreadcrumb(model, nextId);
}

function pushBreadcrumb(model: BreadcrumbTrailModel, id: string): BreadcrumbTrailModel {
  if (typeof id !== 'string' || id.length === 0) return model;
  if (model.cursor >= 0 && model.history[model.cursor] === id) {
    return model;
  }

  const maxLength = positiveInteger(model.maxLength, 32, MAX_LAYOUT_ITEMS);
  const cursor = model.history.length === 0 ? -1 : boundedInteger(model.cursor, model.history.length - 1, 0, model.history.length - 1);
  const history = [...model.history.slice(0, cursor + 1), id];
  if (history.length <= maxLength) {
    return {
      history,
      cursor: history.length - 1,
      maxLength,
    };
  }

  const trimmedHistory = history.slice(history.length - maxLength);
  return {
    history: trimmedHistory,
    cursor: trimmedHistory.length - 1,
    maxLength,
  };
}
