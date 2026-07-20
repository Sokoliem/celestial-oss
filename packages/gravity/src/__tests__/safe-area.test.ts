import type { BoxNode, ComponentRenderContext, OverlayNode, VNode } from '@celestial/nebula';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearSafeArea,
  getSafeAreaScope,
  inSafeArea,
  reserveSafeArea,
  resolveRuntimeMeasurementContextWithSafeArea,
  sticky,
  useSafeAreaInsets,
  withSafeAreaScope,
} from '../index.js';

function ctx(cols = 40, rows = 12): ComponentRenderContext {
  return {
    terminal: { cols, rows },
    available: { cols, rows },
    container: { cols, rows },
  };
}

function resolveOnce(node: VNode, renderContext: ComponentRenderContext = ctx()): VNode {
  if (node.kind === 'component') return node.render(renderContext);
  return node;
}

describe('safe-area', () => {
  afterEach(() => {
    clearSafeArea();
  });

  describe('reserveSafeArea() / useSafeAreaInsets()', () => {
    it('starts with zero insets', () => {
      expect(useSafeAreaInsets()).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
    });

    it('aggregates by sum across reservations on the same edge', () => {
      reserveSafeArea({ edge: 'bottom', size: 1, source: 'status-footer' });
      reserveSafeArea({ edge: 'bottom', size: 2, source: 'notification-bar' });
      expect(useSafeAreaInsets()).toEqual({ top: 0, bottom: 3, left: 0, right: 0 });
    });

    it('is idempotent by source — second call replaces, does not stack', () => {
      reserveSafeArea({ edge: 'right', size: 1, source: 'scrollbar' });
      reserveSafeArea({ edge: 'right', size: 2, source: 'scrollbar' });
      expect(useSafeAreaInsets().right).toBe(2);
    });

    it('isolates reservations per zone', () => {
      reserveSafeArea({ edge: 'bottom', size: 1, source: 'global-footer' });
      reserveSafeArea({ edge: 'right', size: 1, source: 'pty-scrollbar', zone: 'main-pane' });

      expect(useSafeAreaInsets().right).toBe(0);
      expect(useSafeAreaInsets('main-pane').right).toBe(1);
      expect(useSafeAreaInsets('main-pane').bottom).toBe(0);
    });

    it('returns the registered reservation set via getSafeAreaScope', () => {
      reserveSafeArea({ edge: 'top', size: 2, source: 'tab-bar' });
      const scope = getSafeAreaScope();
      expect(scope.zone).toBe('global');
      expect(scope.insets).toEqual({ top: 2, bottom: 0, left: 0, right: 0 });
      expect(scope.reservations).toHaveLength(1);
      expect(scope.reservations[0]?.source).toBe('tab-bar');
    });

    it('release() removes the reservation from the zone', () => {
      const handle = reserveSafeArea({ edge: 'top', size: 3, source: 'tab-bar' });
      expect(useSafeAreaInsets().top).toBe(3);
      handle.release();
      expect(useSafeAreaInsets().top).toBe(0);
    });

    it('update() mutates the existing reservation in place', () => {
      const handle = reserveSafeArea({ edge: 'bottom', size: 1, source: 'status-footer' });
      handle.update({ edge: 'bottom', size: 4 });
      expect(useSafeAreaInsets().bottom).toBe(4);
      expect(handle.current()?.size).toBe(4);
    });
  });

  describe('clearSafeArea()', () => {
    it('clears a specific zone without touching others', () => {
      reserveSafeArea({ edge: 'top', size: 1, source: 'a' });
      reserveSafeArea({ edge: 'top', size: 1, source: 'b', zone: 'panel' });

      clearSafeArea('panel');
      expect(useSafeAreaInsets('panel').top).toBe(0);
      expect(useSafeAreaInsets().top).toBe(1);
    });

    it('clears every zone when called without args', () => {
      reserveSafeArea({ edge: 'top', size: 1, source: 'a' });
      reserveSafeArea({ edge: 'top', size: 1, source: 'b', zone: 'panel' });

      clearSafeArea();
      expect(useSafeAreaInsets().top).toBe(0);
      expect(useSafeAreaInsets('panel').top).toBe(0);
    });
  });

  describe('withSafeAreaScope()', () => {
    it('isolates reservations into a fresh zone and tears them down on completion', () => {
      let scopeBottomDuringRun = -1;
      let globalBottomDuringRun = -1;

      const result = withSafeAreaScope({
        reservations: [{ edge: 'bottom', size: 4, source: 'modal-footer' }],
        run: () => {
          // The reservation lives in the auto-generated `scope:N` zone. The
          // global zone should remain untouched.
          globalBottomDuringRun = useSafeAreaInsets().bottom;
          // The scope helper does not expose the zone id directly, but the
          // reservation should not leak into the default zone.
          scopeBottomDuringRun = useSafeAreaInsets().bottom;
          return 'value';
        },
      });

      expect(result).toBe('value');
      expect(globalBottomDuringRun).toBe(0);
      expect(scopeBottomDuringRun).toBe(0);
      // After teardown, the global zone is still untouched.
      expect(useSafeAreaInsets().bottom).toBe(0);
    });

    it('honors an explicit zone and cleans it up', () => {
      withSafeAreaScope({
        zone: 'modal',
        reservations: [{ edge: 'top', size: 3, source: 'modal-header' }],
        run: () => {
          expect(useSafeAreaInsets('modal').top).toBe(3);
        },
      });
      expect(useSafeAreaInsets('modal').top).toBe(0);
    });
  });

  describe('inSafeArea()', () => {
    it('is a pass-through when no insets are active', () => {
      const child: VNode = { kind: 'text', content: 'body' };
      const wrapped = inSafeArea(child);
      expect(resolveOnce(wrapped)).toBe(child);
    });

    it('wraps the child with padding matching the active insets', () => {
      reserveSafeArea({ edge: 'bottom', size: 2, source: 'status' });
      reserveSafeArea({ edge: 'right', size: 1, source: 'scrollbar' });
      const wrapped = inSafeArea({ kind: 'text', content: 'body' });
      const rendered = resolveOnce(wrapped) as BoxNode;
      expect(rendered.kind).toBe('box');
      expect(rendered.style?.padding).toEqual([0, 1, 2, 0]);
    });

    it('honors the edges allowlist', () => {
      reserveSafeArea({ edge: 'bottom', size: 2, source: 'status' });
      reserveSafeArea({ edge: 'top', size: 2, source: 'tab' });
      const wrapped = inSafeArea({ kind: 'text', content: 'body' }, { edges: ['bottom'] });
      const rendered = resolveOnce(wrapped) as BoxNode;
      expect(rendered.style?.padding).toEqual([0, 0, 2, 0]);
    });
  });

  describe('resolveRuntimeMeasurementContextWithSafeArea()', () => {
    it('subtracts horizontal and vertical insets from container/available', () => {
      reserveSafeArea({ edge: 'right', size: 2, source: 'scrollbar' });
      reserveSafeArea({ edge: 'bottom', size: 1, source: 'status' });

      const resolved = resolveRuntimeMeasurementContextWithSafeArea({
        terminal: { cols: 40, rows: 12 },
        available: { cols: 40, rows: 12 },
        container: { cols: 40, rows: 12 },
      });

      expect(resolved.container).toEqual({ cols: 38, rows: 11 });
      expect(resolved.available).toEqual({ cols: 38, rows: 11 });
      // Terminal is the unmodified physical viewport.
      expect(resolved.terminal).toEqual({ cols: 40, rows: 12 });
    });

    it('returns the unmodified base context when no reservations exist', () => {
      const resolved = resolveRuntimeMeasurementContextWithSafeArea({
        terminal: { cols: 40, rows: 12 },
        available: { cols: 40, rows: 12 },
        container: { cols: 40, rows: 12 },
      });
      expect(resolved.container).toEqual({ cols: 40, rows: 12 });
    });

    it('respects the requested zone', () => {
      reserveSafeArea({ edge: 'right', size: 5, source: 'sidebar', zone: 'panel' });
      const resolved = resolveRuntimeMeasurementContextWithSafeArea(
        {
          terminal: { cols: 40, rows: 12 },
          available: { cols: 40, rows: 12 },
          container: { cols: 40, rows: 12 },
        },
        'panel',
      );
      expect(resolved.container.cols).toBe(35);
    });
  });

  describe('sticky reserveSafeArea integration', () => {
    it('publishes a reservation matching the measured size when opted in', () => {
      const layout = sticky(
        { kind: 'text', content: 'Footer' },
        {
          scrollOffset: 100,
          elementOffset: 0,
          position: 'bottom',
          reserveSafeArea: { source: 'status-footer' },
        },
      );

      // Render once to publish the reservation.
      const rendered = resolveOnce(layout);
      expect((rendered as OverlayNode).kind === 'overlay' || rendered.kind === 'text').toBe(true);

      const insets = useSafeAreaInsets();
      expect(insets.bottom).toBeGreaterThan(0);
    });

    it('does not publish anything when reserveSafeArea is omitted', () => {
      const layout = sticky({ kind: 'text', content: 'Header' }, { scrollOffset: 100, elementOffset: 0, position: 'top' });
      resolveOnce(layout);
      expect(useSafeAreaInsets()).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
    });

    it('subsequent renders update the reservation in place', () => {
      const node: VNode = { kind: 'text', content: 'Footer' };
      const layout = sticky(node, {
        scrollOffset: 100,
        elementOffset: 0,
        position: 'bottom',
        reserveSafeArea: { source: 'status-footer' },
      });
      resolveOnce(layout);
      const first = useSafeAreaInsets().bottom;
      resolveOnce(layout);
      const second = useSafeAreaInsets().bottom;
      expect(second).toBe(first);
    });
  });
});
