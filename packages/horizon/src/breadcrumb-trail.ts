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
    maxLength,
  };
}

export function breadcrumbTrailUpdate(msg: BreadcrumbTrailMsg, model: BreadcrumbTrailModel): BreadcrumbTrailModel {
  switch (msg.type) {
    case 'push':
      return pushBreadcrumb(model, msg.id);
    case 'back':
      return {
        ...model,
        cursor: Math.max(0, model.cursor - 1),
      };
    case 'forward':
      return {
        ...model,
        cursor: Math.min(model.history.length - 1, model.cursor + 1),
      };
  }
}

export function getCurrentBreadcrumb(model: BreadcrumbTrailModel): string | null {
  return model.cursor >= 0 ? (model.history[model.cursor] ?? null) : null;
}

export function canGoBack(model: BreadcrumbTrailModel): boolean {
  return model.cursor > 0;
}

export function canGoForward(model: BreadcrumbTrailModel): boolean {
  return model.cursor >= 0 && model.cursor < model.history.length - 1;
}

export function pushFocusChange(model: BreadcrumbTrailModel, previousId: string | null, nextId: string | null): BreadcrumbTrailModel {
  if (!nextId || previousId === nextId) {
    return model;
  }

  return pushBreadcrumb(model, nextId);
}

function pushBreadcrumb(model: BreadcrumbTrailModel, id: string): BreadcrumbTrailModel {
  if (model.cursor >= 0 && model.history[model.cursor] === id) {
    return model;
  }

  const history = [...model.history.slice(0, model.cursor + 1), id];
  if (history.length <= model.maxLength) {
    return {
      history,
      cursor: history.length - 1,
      maxLength: model.maxLength,
    };
  }

  const trimmedHistory = history.slice(history.length - model.maxLength);
  return {
    history: trimmedHistory,
    cursor: trimmedHistory.length - 1,
    maxLength: model.maxLength,
  };
}
