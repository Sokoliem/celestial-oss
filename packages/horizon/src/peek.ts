export interface PeekModel {
  peeking: boolean;
  peekPanelId: string | null;
  peekWidth: number;
  pinnedPanelIds: string[];
}

export type PeekMsg =
  | { type: 'peek-enter'; panelId: string; peekWidth: number }
  | { type: 'peek-exit'; panelId?: string }
  | { type: 'peek-pin'; panelId: string };

export function createPeekModel(): PeekModel {
  return {
    peeking: false,
    peekPanelId: null,
    peekWidth: 0,
    pinnedPanelIds: [],
  };
}

export function peekUpdate(msg: PeekMsg, model: PeekModel): PeekModel {
  switch (msg.type) {
    case 'peek-enter':
      if (model.pinnedPanelIds.includes(msg.panelId)) {
        return model;
      }
      return {
        ...model,
        peeking: true,
        peekPanelId: msg.panelId,
        peekWidth: msg.peekWidth,
      };
    case 'peek-exit':
      if (msg.panelId && model.peekPanelId !== msg.panelId) {
        return model;
      }
      return {
        ...model,
        peeking: false,
        peekPanelId: null,
        peekWidth: 0,
      };
    case 'peek-pin':
      return {
        peeking: false,
        peekPanelId: null,
        peekWidth: 0,
        pinnedPanelIds: model.pinnedPanelIds.includes(msg.panelId) ? model.pinnedPanelIds : [...model.pinnedPanelIds, msg.panelId],
      };
  }
}

export function isPeekingPanel(model: PeekModel, panelId: string): boolean {
  return model.peekPanelId === panelId && model.peeking;
}

export function isPinnedPanel(model: PeekModel, panelId: string): boolean {
  return model.pinnedPanelIds.includes(panelId);
}
