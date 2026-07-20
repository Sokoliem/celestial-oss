import { describe, expect, it } from 'vitest';
import { normalizeTouchReport } from '../touch.js';

describe('normalizeTouchReport', () => {
  it('maps touch start to press events', () => {
    const events = normalizeTouchReport({
      type: 'start',
      touches: [{ id: 1, x: 10, y: 11 }],
      ctrl: true,
    });

    expect(events).toEqual([
      {
        type: 'press',
        button: 0,
        x: 10,
        y: 11,
        ctrl: true,
        alt: false,
        shift: false,
        touchId: 1,
      },
    ]);
  });

  it('maps move and end reports from changed touches', () => {
    expect(
      normalizeTouchReport({
        type: 'move',
        touches: [
          { id: 1, x: 1, y: 2 },
          { id: 2, x: 3, y: 4 },
        ],
        changedTouches: [{ id: 2, x: 5, y: 6 }],
      }),
    ).toEqual([
      {
        type: 'move',
        button: 'none',
        x: 5,
        y: 6,
        ctrl: false,
        alt: false,
        shift: false,
        touchId: 2,
      },
    ]);

    expect(
      normalizeTouchReport({
        type: 'end',
        touches: [{ id: 1, x: 7, y: 8 }],
      }),
    ).toEqual([
      {
        type: 'release',
        button: 0,
        x: 7,
        y: 8,
        ctrl: false,
        alt: false,
        shift: false,
        touchId: 1,
      },
    ]);
  });
});
