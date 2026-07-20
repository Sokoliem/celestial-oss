import { describe, expect, it } from 'vitest';
import { createMarqueeSelectState, getMarqueeRect, hitTestMarquee, marqueeSelectUpdate, renderMarqueeRect } from '../marquee-select.js';

describe('marquee-select', () => {
  it('normalizes the rectangle regardless of drag direction', () => {
    let state = createMarqueeSelectState();
    state = marqueeSelectUpdate({ type: 'marquee-start', x: 8, y: 6 }, state);
    state = marqueeSelectUpdate({ type: 'marquee-move', x: 3, y: 2 }, state);

    expect(getMarqueeRect(state)).toEqual({
      x: 3,
      y: 2,
      width: 6,
      height: 5,
    });
  });

  it('returns intersecting regions', () => {
    const rect = { x: 2, y: 2, width: 5, height: 4 };
    const hits = hitTestMarquee(rect, [
      { x: 0, y: 0, width: 1, height: 1, onClick: 'a' },
      { x: 3, y: 3, width: 2, height: 2, onClick: 'b' },
      { x: 8, y: 8, width: 2, height: 2, onClick: 'c' },
    ]);

    expect(hits).toHaveLength(1);
    expect(hits[0]?.onClick).toBe('b');
  });

  it('renders a dashed marquee frame', () => {
    expect(renderMarqueeRect({ x: 1, y: 1, width: 4, height: 3 })).toEqual(['┌┈┈┐', '┊  ┊', '└┈┈┘']);
  });
});
