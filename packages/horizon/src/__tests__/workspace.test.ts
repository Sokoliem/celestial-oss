import { describe, expect, it } from 'vitest';
import { createWorkspaceModel, getActiveWorkspace, type WorkspaceModel, workspaceCount, workspaceUpdate } from '../workspace.js';

describe('createWorkspaceModel', () => {
  it('returns correct initial state', () => {
    const model = createWorkspaceModel(['a', 'b', 'c']);

    expect(model.workspaces).toEqual(['a', 'b', 'c']);
    expect(model.activeIndex).toBe(0);
    expect(model.overviewMode).toBe(false);
  });
});

describe('workspaceUpdate', () => {
  const identity = (_msg: unknown, ws: string) => ws;
  const threeWorkspaces = () => createWorkspaceModel(['a', 'b', 'c']);

  describe('ws-switch', () => {
    it('changes active index', () => {
      const model = threeWorkspaces();
      const updated = workspaceUpdate({ type: 'ws-switch', index: 2 }, model, identity);

      expect(updated.activeIndex).toBe(2);
    });

    it('clamps out-of-range index (too high)', () => {
      const model = threeWorkspaces();
      const updated = workspaceUpdate({ type: 'ws-switch', index: 10 }, model, identity);

      expect(updated.activeIndex).toBe(2);
    });

    it('clamps out-of-range index (negative)', () => {
      const model = threeWorkspaces();
      const updated = workspaceUpdate({ type: 'ws-switch', index: -5 }, model, identity);

      expect(updated.activeIndex).toBe(0);
    });
  });

  describe('ws-next', () => {
    it('increments activeIndex', () => {
      const model = threeWorkspaces();
      const updated = workspaceUpdate({ type: 'ws-next' }, model, identity);

      expect(updated.activeIndex).toBe(1);
    });

    it('wraps to 0 at end', () => {
      const model: WorkspaceModel<string> = {
        workspaces: ['a', 'b', 'c'],
        activeIndex: 2,
        overviewMode: false,
      };
      const updated = workspaceUpdate({ type: 'ws-next' }, model, identity);

      expect(updated.activeIndex).toBe(0);
    });
  });

  describe('ws-prev', () => {
    it('decrements activeIndex', () => {
      const model: WorkspaceModel<string> = {
        workspaces: ['a', 'b', 'c'],
        activeIndex: 2,
        overviewMode: false,
      };
      const updated = workspaceUpdate({ type: 'ws-prev' }, model, identity);

      expect(updated.activeIndex).toBe(1);
    });

    it('wraps to last at start', () => {
      const model = threeWorkspaces();
      const updated = workspaceUpdate({ type: 'ws-prev' }, model, identity);

      expect(updated.activeIndex).toBe(2);
    });
  });

  describe('ws-toggle-overview', () => {
    it('flips overviewMode from false to true', () => {
      const model = threeWorkspaces();
      const updated = workspaceUpdate({ type: 'ws-toggle-overview' }, model, identity);

      expect(updated.overviewMode).toBe(true);
    });

    it('flips overviewMode from true to false', () => {
      const model: WorkspaceModel<string> = {
        workspaces: ['a', 'b', 'c'],
        activeIndex: 0,
        overviewMode: true,
      };
      const updated = workspaceUpdate({ type: 'ws-toggle-overview' }, model, identity);

      expect(updated.overviewMode).toBe(false);
    });
  });

  describe('ws-update', () => {
    it('updates only the active workspace', () => {
      const model: WorkspaceModel<string> = {
        workspaces: ['a', 'b', 'c'],
        activeIndex: 1,
        overviewMode: false,
      };
      const updated = workspaceUpdate({ type: 'ws-update', msg: 'upper' }, model, (msg: string, ws: string) => (msg === 'upper' ? ws.toUpperCase() : ws));

      expect(updated.workspaces[0]).toBe('a');
      expect(updated.workspaces[1]).toBe('B');
      expect(updated.workspaces[2]).toBe('c');
    });

    it('leaves other workspaces identical by reference', () => {
      const ws0 = { value: 1 };
      const ws1 = { value: 2 };
      const ws2 = { value: 3 };
      const model = createWorkspaceModel<{ value: number }>([ws0, ws1, ws2]);

      const updated = workspaceUpdate<{ value: number }>({ type: 'ws-update', msg: { value: 0 } }, model, (_msg, ws) => ({ ...ws, value: ws.value + 1 }));

      // Active (index 0) gets a new object
      expect(updated.workspaces[0]).not.toBe(ws0);
      expect(updated.workspaces[0]).toEqual({ value: 2 });

      // Others are the same reference
      expect(updated.workspaces[1]).toBe(ws1);
      expect(updated.workspaces[2]).toBe(ws2);
    });
  });
});

describe('getActiveWorkspace', () => {
  it('returns the workspace at activeIndex', () => {
    const model: WorkspaceModel<string> = {
      workspaces: ['a', 'b', 'c'],
      activeIndex: 1,
      overviewMode: false,
    };

    expect(getActiveWorkspace(model)).toBe('b');
  });
});

describe('workspaceCount', () => {
  it('returns the number of workspaces', () => {
    const model = createWorkspaceModel(['a', 'b', 'c', 'd']);

    expect(workspaceCount(model)).toBe(4);
  });
});

describe('immutability', () => {
  it('does not mutate the original model on ws-switch', () => {
    const model = createWorkspaceModel(['a', 'b', 'c']);
    const original = { ...model, workspaces: [...model.workspaces] };
    const identity = (_msg: unknown, ws: string) => ws;

    workspaceUpdate({ type: 'ws-switch', index: 2 }, model, identity);

    expect(model.activeIndex).toBe(original.activeIndex);
    expect(model.overviewMode).toBe(original.overviewMode);
    expect(model.workspaces).toEqual(original.workspaces);
  });

  it('does not mutate the original model on ws-update', () => {
    const model = createWorkspaceModel(['a', 'b', 'c']);
    const originalWorkspaces = [...model.workspaces];

    workspaceUpdate({ type: 'ws-update', msg: 'x' }, model, (_msg: string, ws: string) => ws + '!');

    expect(model.workspaces).toEqual(originalWorkspaces);
  });

  it('does not mutate the original model on ws-toggle-overview', () => {
    const model = createWorkspaceModel(['a', 'b', 'c']);

    workspaceUpdate({ type: 'ws-toggle-overview' }, model, (_msg: unknown, ws: string) => ws);

    expect(model.overviewMode).toBe(false);
  });
});
