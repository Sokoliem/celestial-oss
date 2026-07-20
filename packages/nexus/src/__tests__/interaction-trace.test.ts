import type { HitRegionInfo } from '@celestial/nebula';
import { describe, expect, it } from 'vitest';
import { createInteractionTraceRecorder, recordInteractionTrace, recordRegionRouteTrace } from '../interaction-trace.js';
import { createRegionRouter } from '../region-router.js';

function region(overrides: Partial<HitRegionInfo> & Pick<HitRegionInfo, 'id'>): HitRegionInfo {
  return {
    handlers: {},
    rect: { x: 2, y: 3, width: 10, height: 4 },
    zIndex: 0,
    isHover: false,
    eventPath: [overrides.id],
    ...overrides,
  };
}

describe('interaction trace', () => {
  it('records JSON-safe region traces with modifiers and target payload', () => {
    const entry = recordInteractionTrace(
      {
        id: 'quick-action',
        localId: 'debug-state',
        metadata: {
          label: 'Debug State',
          intent: 'activate',
          extra: { surface: 'quick-action-action', count: Number.POSITIVE_INFINITY, ignored: undefined },
        },
      },
      {
        type: 'release',
        handlerTag: 'cwptr:release',
        x: 8,
        y: 2,
        localX: 1,
        localY: 0,
        button: 0,
        ctrl: true,
        alt: false,
        shift: true,
        timestamp: 123,
      },
      { kind: 'handled', detail: 'opened debug state' },
    );

    expect(entry).toMatchObject({
      regionId: 'quick-action',
      localId: 'debug-state',
      eventType: 'release',
      handlerTag: 'cwptr:release',
      intent: 'activate',
      label: 'Debug State',
      x: 8,
      y: 2,
      localX: 1,
      localY: 0,
      ctrl: true,
      shift: true,
      result: { kind: 'handled', detail: 'opened debug state' },
      target: { surface: 'quick-action-action', count: 'Infinity' },
    });
  });

  it('records routed hit-region events with local coordinates and handler tag', () => {
    const router = createRegionRouter([
      region({
        id: 'row-1',
        handlers: { onClick: 'open-row' },
        metadata: { label: 'Open row', intent: 'open', extra: { row: 1 } },
      }),
    ]);
    const event = { type: 'press' as const, button: 0 as const, x: 5, y: 4, ctrl: false, alt: false, shift: false };
    const match = router.route(event);

    expect(match).not.toBeNull();
    const trace = recordRegionRouteTrace(match!, event, { kind: 'handled' });

    expect(trace).toMatchObject({
      regionId: 'row-1',
      eventType: 'press',
      phase: 'target',
      handlerTag: 'open-row',
      localX: 3,
      localY: 1,
      target: { row: 1 },
    });
  });

  it('keeps a bounded snapshot of recent entries', () => {
    const recorder = createInteractionTraceRecorder(2);

    recorder.record({ id: 'a' }, { type: 'press', timestamp: 1 });
    recorder.record({ id: 'b' }, { type: 'press', timestamp: 2 });
    recorder.record({ id: 'c' }, { type: 'press', timestamp: 3 });

    expect(recorder.entries().map((entry) => entry.regionId)).toEqual(['b', 'c']);
    expect(recorder.snapshot()).toEqual({ entries: recorder.entries() });

    recorder.clear();
    expect(recorder.entries()).toEqual([]);
  });
});
