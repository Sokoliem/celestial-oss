import { describe, expect, it } from 'vitest';
import {
  applyFocusToTree,
  collectFocusNodes,
  createFocusState,
  type FocusState,
  focusById,
  focusNext,
  focusPrev,
  popFocusGroup,
  pushFocusGroup,
  syncFocusState,
} from '../focus.js';
import type { BoxNode, ColumnNode, FocusNode, RowNode, ScrollNode, VNode } from '../vdom.js';

// --- Helpers ---

function mkFocus(id: string, opts?: { tabIndex?: number; group?: string }): FocusNode {
  return {
    kind: 'focus',
    id,
    child: { kind: 'text', content: id },
    focused: false,
    tabIndex: opts?.tabIndex,
    group: opts?.group,
  };
}

function mkColumn(...children: VNode[]): ColumnNode {
  return { kind: 'column', children };
}

function mkRow(...children: VNode[]): RowNode {
  return { kind: 'row', children };
}

function stateWith(ids: string[], currentId: string | null = null, groups: string[] = []): FocusState {
  return { focusableIds: ids, currentId, groups };
}

// --- Tests ---

describe('focus', () => {
  describe('createFocusState', () => {
    it('should create an empty focus state', () => {
      const state = createFocusState();
      expect(state.focusableIds).toEqual([]);
      expect(state.currentId).toBeNull();
      expect(state.groups).toEqual([]);
    });
  });

  describe('collectFocusNodes', () => {
    it('should find all FocusNodes in a flat column', () => {
      const tree = mkColumn(mkFocus('a'), mkFocus('b'), mkFocus('c'));
      const nodes = collectFocusNodes(tree);
      expect(nodes.map((n) => n.id)).toEqual(['a', 'b', 'c']);
    });

    it('should find FocusNodes in nested structures', () => {
      const tree = mkColumn(mkFocus('a'), mkRow(mkFocus('b'), mkColumn(mkFocus('c'))));
      const nodes = collectFocusNodes(tree);
      expect(nodes.map((n) => n.id)).toEqual(['a', 'b', 'c']);
    });

    it('should find FocusNodes inside a box', () => {
      const tree: BoxNode = {
        kind: 'box',
        children: [mkFocus('inside-box')],
      };
      const nodes = collectFocusNodes(tree);
      expect(nodes.map((n) => n.id)).toEqual(['inside-box']);
    });

    it('should find FocusNodes inside a scroll node', () => {
      const tree: ScrollNode = {
        kind: 'scroll',
        child: mkColumn(mkFocus('scrolled')),
        offset: 0,
        height: 10,
      };
      const nodes = collectFocusNodes(tree);
      expect(nodes.map((n) => n.id)).toEqual(['scrolled']);
    });

    it('should find FocusNodes inside a component node', () => {
      const tree: VNode = {
        kind: 'component',
        render: () => mkColumn(mkFocus('from-component')),
      };
      const nodes = collectFocusNodes(tree);
      expect(nodes.map((n) => n.id)).toEqual(['from-component']);
    });

    it('should return empty array for a tree with no focus nodes', () => {
      const tree: VNode = mkColumn({ kind: 'text', content: 'no focus here' }, { kind: 'empty' });
      const nodes = collectFocusNodes(tree);
      expect(nodes).toEqual([]);
    });

    it('should collect tabIndex and group info', () => {
      const tree = mkColumn(mkFocus('a', { tabIndex: 2, group: 'modal' }), mkFocus('b', { tabIndex: 1 }));
      const nodes = collectFocusNodes(tree);
      // Sorted by tabIndex: b(1), a(2)
      expect(nodes).toEqual([
        { id: 'b', tabIndex: 1, group: undefined },
        { id: 'a', tabIndex: 2, group: 'modal' },
      ]);
    });

    it('should find nested FocusNodes inside a FocusNode', () => {
      const inner = mkFocus('inner');
      const outer: FocusNode = {
        kind: 'focus',
        id: 'outer',
        child: inner,
        focused: false,
      };
      const nodes = collectFocusNodes(outer);
      expect(nodes.map((n) => n.id)).toEqual(['outer', 'inner']);
    });

    it('restricts navigation to the highest active visual layer', () => {
      const tree = mkColumn(
        mkFocus('base'),
        {
          kind: 'overlay',
          child: mkFocus('front-window'),
          x: 0,
          y: 0,
          zIndex: 20,
          focusMode: 'active',
        },
        {
          kind: 'overlay',
          child: mkFocus('back-window'),
          x: 0,
          y: 0,
          zIndex: 10,
          focusMode: 'active',
        },
        {
          kind: 'overlay',
          child: mkFocus('tooltip'),
          x: 0,
          y: 0,
          zIndex: 30,
          focusMode: 'passive',
        },
      );

      expect(collectFocusNodes(tree).map((node) => node.id)).toEqual(['front-window']);
    });

    it('gives modal and blocked layers deterministic ownership', () => {
      const modalTree = mkColumn(
        {
          kind: 'overlay',
          child: mkFocus('active-window'),
          x: 0,
          y: 0,
          zIndex: 100,
          focusMode: 'active',
        },
        {
          kind: 'overlay',
          child: mkFocus('dialog'),
          x: 0,
          y: 0,
          zIndex: 1,
          focusMode: 'modal',
        },
      );
      const blockedTree = mkColumn(
        mkFocus('base'),
        {
          kind: 'overlay',
          child: mkFocus('must-not-focus'),
          x: 0,
          y: 0,
          focusMode: 'blocked',
        },
      );

      expect(collectFocusNodes(modalTree).map((node) => node.id)).toEqual(['dialog']);
      expect(collectFocusNodes(blockedTree)).toEqual([]);
    });

    it('treats active portals as visually frontmost focus owners', () => {
      const tree = mkColumn(
        {
          kind: 'overlay',
          child: mkFocus('window'),
          x: 0,
          y: 0,
          zIndex: 5000,
          focusMode: 'active',
        },
        {
          kind: 'portal',
          target: 'anchor',
          child: mkFocus('menu'),
          focusMode: 'active',
        },
      );

      expect(collectFocusNodes(tree).map((node) => node.id)).toEqual(['menu']);
    });

    it('lets an active child layer own focus without escaping its modal ancestor', () => {
      const tree = mkColumn(
        {
          kind: 'overlay',
          child: mkFocus('unrelated-window'),
          x: 0,
          y: 0,
          zIndex: 999,
          focusMode: 'active',
        },
        {
          kind: 'overlay',
          x: 0,
          y: 0,
          zIndex: 10,
          focusMode: 'modal',
          child: mkColumn(
            mkFocus('dialog-action'),
            {
              kind: 'overlay',
              child: mkFocus('dialog-menu-action'),
              x: 0,
              y: 0,
              zIndex: 20,
              focusMode: 'active',
            },
          ),
        },
      );

      expect(collectFocusNodes(tree).map((node) => node.id)).toEqual(['dialog-menu-action']);
    });

    it('does not allow nested layers to escape a blocked owner', () => {
      const tree: VNode = {
        kind: 'overlay',
        x: 0,
        y: 0,
        focusMode: 'blocked',
        child: {
          kind: 'overlay',
          x: 0,
          y: 0,
          zIndex: 100,
          focusMode: 'modal',
          child: mkFocus('nested'),
        },
      };

      expect(collectFocusNodes(tree)).toEqual([]);
    });

    it('does not allow nested active or modal layers to escape a passive owner', () => {
      const tree = mkColumn(
        mkFocus('workspace'),
        {
          kind: 'overlay',
          x: 0,
          y: 0,
          zIndex: 100,
          focusMode: 'passive',
          child: mkColumn(
            mkFocus('passive-window'),
            {
              kind: 'overlay',
              x: 0,
              y: 0,
              zIndex: 200,
              focusMode: 'active',
              child: mkFocus('nested-active'),
            },
            {
              kind: 'portal',
              target: 'passive-menu',
              focusMode: 'modal',
              child: mkFocus('nested-modal'),
            },
          ),
        },
      );

      expect(collectFocusNodes(tree).map((node) => node.id)).toEqual(['workspace']);
    });

    it('evicts focus retained by an obscured layer', () => {
      const tree = mkColumn(mkFocus('base'), {
        kind: 'overlay',
        child: mkFocus('dialog'),
        x: 0,
        y: 0,
        focusMode: 'modal',
      });

      expect(syncFocusState(stateWith(['base'], 'base'), tree)).toMatchObject({
        focusableIds: ['dialog'],
        currentId: 'dialog',
      });
    });
  });

  describe('focus ordering with tabIndex', () => {
    it('should sort by tabIndex, preserving document order for ties', () => {
      const tree = mkColumn(mkFocus('c', { tabIndex: 2 }), mkFocus('a', { tabIndex: 0 }), mkFocus('b', { tabIndex: 0 }), mkFocus('d', { tabIndex: 1 }));
      const nodes = collectFocusNodes(tree);
      expect(nodes.map((n) => n.id)).toEqual(['a', 'b', 'd', 'c']);
    });

    it('should default tabIndex to 0 when not specified', () => {
      const tree = mkColumn(mkFocus('x'), mkFocus('y', { tabIndex: -1 }), mkFocus('z'));
      const nodes = collectFocusNodes(tree);
      // y(-1) before x(0), z(0)
      expect(nodes.map((n) => n.id)).toEqual(['y', 'x', 'z']);
    });
  });

  describe('focusNext', () => {
    it('should focus the first element when nothing is focused', () => {
      const state = stateWith(['a', 'b', 'c']);
      const next = focusNext(state);
      expect(next.currentId).toBe('a');
    });

    it('should advance to the next element', () => {
      const state = stateWith(['a', 'b', 'c'], 'a');
      const next = focusNext(state);
      expect(next.currentId).toBe('b');
    });

    it('should wrap around to the first element', () => {
      const state = stateWith(['a', 'b', 'c'], 'c');
      const next = focusNext(state);
      expect(next.currentId).toBe('a');
    });

    it('should return same state when no focusable elements', () => {
      const state = stateWith([]);
      const next = focusNext(state);
      expect(next.currentId).toBeNull();
    });

    it('should focus first element when currentId is not in the list', () => {
      const state = stateWith(['a', 'b'], 'removed');
      const next = focusNext(state);
      expect(next.currentId).toBe('a');
    });

    it('should handle single focusable element', () => {
      const state = stateWith(['only'], 'only');
      const next = focusNext(state);
      expect(next.currentId).toBe('only');
    });
  });

  describe('focusPrev', () => {
    it('should focus the last element when nothing is focused', () => {
      const state = stateWith(['a', 'b', 'c']);
      const prev = focusPrev(state);
      expect(prev.currentId).toBe('c');
    });

    it('should move to the previous element', () => {
      const state = stateWith(['a', 'b', 'c'], 'c');
      const prev = focusPrev(state);
      expect(prev.currentId).toBe('b');
    });

    it('should wrap around to the last element', () => {
      const state = stateWith(['a', 'b', 'c'], 'a');
      const prev = focusPrev(state);
      expect(prev.currentId).toBe('c');
    });

    it('should return same state when no focusable elements', () => {
      const state = stateWith([]);
      const prev = focusPrev(state);
      expect(prev.currentId).toBeNull();
    });

    it('should focus last element when currentId is not in the list', () => {
      const state = stateWith(['a', 'b'], 'removed');
      const prev = focusPrev(state);
      expect(prev.currentId).toBe('b');
    });

    it('should handle single focusable element', () => {
      const state = stateWith(['only'], 'only');
      const prev = focusPrev(state);
      expect(prev.currentId).toBe('only');
    });
  });

  describe('focusById', () => {
    it('should focus a specific element by ID', () => {
      const state = stateWith(['a', 'b', 'c'], 'a');
      const result = focusById(state, 'c');
      expect(result.currentId).toBe('c');
    });

    it('should be a no-op if ID is not in the focusable list', () => {
      const state = stateWith(['a', 'b'], 'a');
      const result = focusById(state, 'nonexistent');
      expect(result.currentId).toBe('a');
    });

    it('should work when nothing is currently focused', () => {
      const state = stateWith(['a', 'b']);
      const result = focusById(state, 'b');
      expect(result.currentId).toBe('b');
    });
  });

  describe('pushFocusGroup / popFocusGroup', () => {
    it('should push a group onto the stack', () => {
      const state = stateWith(['a', 'b', 'c']);
      const result = pushFocusGroup(state, 'modal');
      expect(result.groups).toEqual(['modal']);
    });

    it('should stack multiple groups', () => {
      let state = stateWith(['a', 'b', 'c']);
      state = pushFocusGroup(state, 'modal');
      state = pushFocusGroup(state, 'dialog');
      expect(state.groups).toEqual(['modal', 'dialog']);
    });

    it('should pop the top group', () => {
      let state = stateWith(['a', 'b', 'c']);
      state = pushFocusGroup(state, 'modal');
      state = pushFocusGroup(state, 'dialog');
      state = popFocusGroup(state);
      expect(state.groups).toEqual(['modal']);
    });

    it('should pop to empty', () => {
      let state = stateWith(['a', 'b', 'c']);
      state = pushFocusGroup(state, 'modal');
      state = popFocusGroup(state);
      expect(state.groups).toEqual([]);
    });

    it('should be a no-op when popping from empty stack', () => {
      const state = stateWith(['a', 'b']);
      const result = popFocusGroup(state);
      expect(result.groups).toEqual([]);
      expect(result).toBe(state); // same reference (no mutation)
    });

    it('should not mutate the original state', () => {
      const state = stateWith(['a', 'b']);
      const pushed = pushFocusGroup(state, 'modal');
      expect(state.groups).toEqual([]); // original unchanged
      expect(pushed.groups).toEqual(['modal']);
    });
  });

  describe('applyFocusToTree', () => {
    it('should set focused=true on the matching FocusNode', () => {
      const tree = mkColumn(mkFocus('a'), mkFocus('b'));
      const patched = applyFocusToTree(tree, 'b') as ColumnNode;
      const a = patched.children[0] as FocusNode;
      const b = patched.children[1] as FocusNode;
      expect(a.focused).toBe(false);
      expect(b.focused).toBe(true);
    });

    it('should set all focused=false when currentId is null', () => {
      const tree = mkColumn(mkFocus('a'), mkFocus('b'));
      const patched = applyFocusToTree(tree, null) as ColumnNode;
      const a = patched.children[0] as FocusNode;
      const b = patched.children[1] as FocusNode;
      expect(a.focused).toBe(false);
      expect(b.focused).toBe(false);
    });

    it('should work in nested structures', () => {
      const tree = mkColumn(mkRow(mkFocus('nested')));
      const patched = applyFocusToTree(tree, 'nested') as ColumnNode;
      const row = patched.children[0] as RowNode;
      const focusNode = row.children[0] as FocusNode;
      expect(focusNode.focused).toBe(true);
    });

    it('should return same reference when nothing changes', () => {
      const tree = mkColumn(mkFocus('a'), mkFocus('b'));
      // All focused=false, currentId=null => no changes
      const patched = applyFocusToTree(tree, null);
      expect(patched).toBe(tree);
    });

    it('should handle focus inside box and scroll nodes', () => {
      const tree: BoxNode = {
        kind: 'box',
        children: [
          {
            kind: 'scroll',
            child: mkFocus('deep'),
            offset: 0,
            height: 5,
          },
        ],
      };
      const patched = applyFocusToTree(tree, 'deep') as BoxNode;
      const scroll = patched.children[0] as ScrollNode;
      const focusNode = scroll.child as FocusNode;
      expect(focusNode.focused).toBe(true);
    });

    it('should leave text and empty nodes unchanged', () => {
      const textNode: VNode = { kind: 'text', content: 'hello' };
      const emptyNode: VNode = { kind: 'empty' };
      expect(applyFocusToTree(textNode, 'anything')).toBe(textNode);
      expect(applyFocusToTree(emptyNode, 'anything')).toBe(emptyNode);
    });
  });

  describe('focusNext/focusPrev cycle integration', () => {
    it('should cycle through all elements with repeated focusNext calls', () => {
      let state = stateWith(['a', 'b', 'c']);

      state = focusNext(state);
      expect(state.currentId).toBe('a');

      state = focusNext(state);
      expect(state.currentId).toBe('b');

      state = focusNext(state);
      expect(state.currentId).toBe('c');

      state = focusNext(state);
      expect(state.currentId).toBe('a'); // wrapped
    });

    it('should cycle backward with repeated focusPrev calls', () => {
      let state = stateWith(['a', 'b', 'c']);

      state = focusPrev(state);
      expect(state.currentId).toBe('c');

      state = focusPrev(state);
      expect(state.currentId).toBe('b');

      state = focusPrev(state);
      expect(state.currentId).toBe('a');

      state = focusPrev(state);
      expect(state.currentId).toBe('c'); // wrapped
    });

    it('should interleave next and prev correctly', () => {
      let state = stateWith(['a', 'b', 'c'], 'b');

      state = focusNext(state);
      expect(state.currentId).toBe('c');

      state = focusPrev(state);
      expect(state.currentId).toBe('b');

      state = focusPrev(state);
      expect(state.currentId).toBe('a');
    });
  });
});
