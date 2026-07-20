import { describe, expect, it, vi } from 'vitest';
import { lazy } from '../elements.js';
import type { TextNode, VNode } from '../vdom.js';
import { measure, planLayout, setLazyScheduleRender } from '../vdom.js';

function mkText(content: string): TextNode {
  return { kind: 'text', content };
}

describe('lazy() VNode', () => {
  describe('before loading', () => {
    it('should show placeholder initially', () => {
      const loader = vi.fn(() => new Promise<() => VNode>(() => {})); // Never resolves
      const node = lazy('lazy-1', loader, mkText('loading...'));
      const plan = planLayout(node, 80, 24);
      const textEntry = plan.root.children[0]!;
      expect(textEntry.node.kind).toBe('text');
      expect((textEntry.node as TextNode).content).toBe('loading...');
    });

    it('should measure placeholder size', () => {
      const node = lazy('lazy-2', () => new Promise(() => {}), mkText('...'));
      const size = measure(node, 80);
      expect(size.width).toBe(3);
      expect(size.height).toBe(1);
    });

    it('should start loading on first encounter', () => {
      const loader = vi.fn(() => new Promise<() => VNode>(() => {}));
      const node = lazy('lazy-3', loader, mkText('...'));
      planLayout(node, 80, 24);
      expect(loader).toHaveBeenCalledOnce();
    });

    it('should not call loader again while loading', () => {
      const loader = vi.fn(() => new Promise<() => VNode>(() => {}));
      const node = lazy('lazy-4', loader, mkText('...'));
      planLayout(node, 80, 24);
      planLayout(node, 80, 24);
      expect(loader).toHaveBeenCalledOnce();
    });
  });

  describe('after loading', () => {
    it('should swap to loaded content after resolution', async () => {
      const factory = () => mkText('LOADED');
      const loader = vi.fn(() => Promise.resolve(factory));
      const scheduleRender = vi.fn();
      setLazyScheduleRender(scheduleRender);

      const node = lazy('lazy-5', loader, mkText('...'));
      planLayout(node, 80, 24);

      // Wait for the promise to resolve
      await vi.waitFor(() => {
        expect(scheduleRender).toHaveBeenCalled();
      });

      // Now the factory should be cached — render should use it
      const plan = planLayout(node, 80, 24);
      const textEntry = plan.root.children[0]!;
      expect((textEntry.node as TextNode).content).toBe('LOADED');

      setLazyScheduleRender(null);
    });

    it('should cache factory and not reload', async () => {
      const factory = () => mkText('CACHED');
      const loader = vi.fn(() => Promise.resolve(factory));
      const scheduleRender = vi.fn();
      setLazyScheduleRender(scheduleRender);

      const node = lazy('lazy-6', loader, mkText('...'));
      planLayout(node, 80, 24);

      await vi.waitFor(() => {
        expect(scheduleRender).toHaveBeenCalled();
      });

      // Multiple re-renders should not re-call loader
      planLayout(node, 80, 24);
      planLayout(node, 80, 24);
      expect(loader).toHaveBeenCalledOnce();

      setLazyScheduleRender(null);
    });
  });

  describe('failed load', () => {
    it('should stay on placeholder after failed load', async () => {
      const loader = vi.fn(() => Promise.reject(new Error('network error')));

      const node = lazy('lazy-7', loader, mkText('fallback'));
      planLayout(node, 80, 24);

      // Wait for rejection to be processed
      await new Promise((resolve) => setTimeout(resolve, 10));

      const plan = planLayout(node, 80, 24);
      const textEntry = plan.root.children[0]!;
      expect((textEntry.node as TextNode).content).toBe('fallback');
    });
  });
});
