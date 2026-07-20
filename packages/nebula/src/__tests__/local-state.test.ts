import { describe, expect, it, vi } from 'vitest';
import { localState } from '../elements.js';
import type { TextNode, VNode } from '../vdom.js';
import { beginLocalStateFrame, endLocalStateFrame, measure, planLayout, setLocalStateScheduleRender } from '../vdom.js';

function mkText(content: string): TextNode {
  return { kind: 'text', content };
}

describe('localState() VNode', () => {
  describe('state initialization', () => {
    it('should call init on first render', () => {
      const init = vi.fn(() => ({ count: 0 }));
      const node = localState(
        'counter-1',
        init,
        (state: { count: number }, _action: unknown) => ({ count: state.count + 1 }),
        (state, _dispatch) => mkText(`count: ${state.count}`),
      ) as unknown as VNode;
      beginLocalStateFrame();
      const plan = planLayout(node as unknown as VNode, 80, 24);
      endLocalStateFrame();
      expect(init).toHaveBeenCalledOnce();
      const textEntry = plan.root.children[0]!;
      expect(textEntry.node.kind).toBe('text');
      expect((textEntry.node as TextNode).content).toBe('count: 0');
    });

    it('should persist state across renders with same key', () => {
      const init = vi.fn(() => ({ count: 0 }));
      const reducer = (state: { count: number }, _action: string) => ({ count: state.count + 1 });
      const view = (state: { count: number }, dispatch: (a: string) => void) => {
        // Dispatch on every render to increment
        dispatch('inc');
        return mkText(`count: ${state.count}`);
      };

      // First render
      beginLocalStateFrame();
      const node1 = localState('persist-test', init, reducer, view);
      planLayout(node1 as unknown as VNode, 80, 24);
      endLocalStateFrame();

      // Second render — state should reflect the dispatch from first render
      beginLocalStateFrame();
      const node2 = localState('persist-test', init, reducer, view);
      const plan = planLayout(node2 as unknown as VNode, 80, 24);
      endLocalStateFrame();

      // init should only be called once
      expect(init).toHaveBeenCalledOnce();
      // State should have been incremented by the dispatch in the first render
      const textEntry = plan.root.children[0]!;
      expect((textEntry.node as TextNode).content).toBe('count: 1');
    });
  });

  describe('dispatch', () => {
    it('should trigger scheduleRender when dispatching', () => {
      const scheduleRender = vi.fn();
      setLocalStateScheduleRender(scheduleRender);

      const node = localState(
        'dispatch-test',
        () => ({ count: 0 }),
        (state: { count: number }, _action: string) => ({ count: state.count + 1 }),
        (state, dispatch) => {
          // Dispatch to trigger scheduleRender
          dispatch('inc');
          return mkText(`${state.count}`);
        },
      );

      beginLocalStateFrame();
      planLayout(node as unknown as VNode, 80, 24);
      endLocalStateFrame();

      expect(scheduleRender).toHaveBeenCalled();
      setLocalStateScheduleRender(null);
    });
  });

  describe('independent instances', () => {
    it('different keys maintain independent state', () => {
      beginLocalStateFrame();
      const node1 = localState(
        'key-a',
        () => 'alpha',
        (s: string) => s,
        (state) => mkText(state),
      );
      const node2 = localState(
        'key-b',
        () => 'beta',
        (s: string) => s,
        (state) => mkText(state),
      );

      const col: VNode = { kind: 'column', children: [node1 as unknown as VNode, node2 as unknown as VNode] };
      const plan = planLayout(col, 80, 24);
      endLocalStateFrame();

      const text1 = plan.root.children[0]!.children[0]!.node as TextNode;
      const text2 = plan.root.children[1]!.children[0]!.node as TextNode;
      expect(text1.content).toBe('alpha');
      expect(text2.content).toBe('beta');
    });
  });

  describe('measure', () => {
    it('should measure through localState', () => {
      const node = localState(
        'measure-test',
        () => null,
        (s: null) => s,
        () => mkText('hello'),
      );
      const size = measure(node as unknown as VNode, 80);
      expect(size.width).toBe(5);
      expect(size.height).toBe(1);
    });
  });
});
