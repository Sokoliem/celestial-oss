// @ts-nocheck
/**
 * Regression tests for critical and high-priority bugs in the Nebula core.
 *
 * Each test reproduces the exact failure condition BEFORE the fix is applied,
 * then asserts the correct expected behavior.
 */
import { describe, expect, it } from 'vitest';
import { collectFocusNodes, type FocusState, focusNext, focusPrev } from '../../focus.js';
import type { VNode } from '../../vdom.js';

// ─── Bug 2.2: Focus groups ignored by Tab navigation ────────────────────────

describe('Bug 2.2: focusNext/focusPrev should respect focus groups', () => {
  it('focusNext should only navigate within the active focus group', () => {
    // Set up state with groups: items a,b are in group "modal", c,d are not
    const tree: VNode = {
      kind: 'column',
      children: [
        { kind: 'focus', id: 'a', child: { kind: 'text', content: 'a' }, focused: false, group: 'modal' } as VNode,
        { kind: 'focus', id: 'b', child: { kind: 'text', content: 'b' }, focused: false, group: 'modal' } as VNode,
        { kind: 'focus', id: 'c', child: { kind: 'text', content: 'c' }, focused: false } as VNode,
        { kind: 'focus', id: 'd', child: { kind: 'text', content: 'd' }, focused: false } as VNode,
      ],
    };

    const nodes = collectFocusNodes(tree);
    const allIds = nodes.map((n) => n.id);

    // Push "modal" group — only a, b should be navigable
    let state: FocusState = {
      focusableIds: allIds,
      currentId: 'a',
      groups: ['modal'],
    };

    // focusNext should go to 'b' (within modal group), not 'c'
    state = focusNext(state, nodes);
    expect(state.currentId).toBe('b');

    // focusNext again should wrap to 'a', not go to 'c'
    state = focusNext(state, nodes);
    expect(state.currentId).toBe('a');
  });

  it('focusPrev should only navigate within the active focus group', () => {
    const tree: VNode = {
      kind: 'column',
      children: [
        { kind: 'focus', id: 'a', child: { kind: 'text', content: 'a' }, focused: false, group: 'modal' } as VNode,
        { kind: 'focus', id: 'b', child: { kind: 'text', content: 'b' }, focused: false, group: 'modal' } as VNode,
        { kind: 'focus', id: 'c', child: { kind: 'text', content: 'c' }, focused: false } as VNode,
      ],
    };

    const nodes = collectFocusNodes(tree);
    const allIds = nodes.map((n) => n.id);

    let state: FocusState = {
      focusableIds: allIds,
      currentId: 'a',
      groups: ['modal'],
    };

    // focusPrev from 'a' should wrap to 'b' (within modal), not go to 'c'
    state = focusPrev(state, nodes);
    expect(state.currentId).toBe('b');
  });

  it('focusNext with no active group should navigate all elements', () => {
    const tree: VNode = {
      kind: 'column',
      children: [
        { kind: 'focus', id: 'a', child: { kind: 'text', content: 'a' }, focused: false, group: 'modal' } as VNode,
        { kind: 'focus', id: 'b', child: { kind: 'text', content: 'b' }, focused: false } as VNode,
      ],
    };
    const nodes = collectFocusNodes(tree);
    const allIds = nodes.map((n) => n.id);

    let state: FocusState = {
      focusableIds: allIds,
      currentId: 'a',
      groups: [], // no active group
    };

    state = focusNext(state, nodes);
    expect(state.currentId).toBe('b');
  });
});
