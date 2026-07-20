import { describe, expect, it } from 'vitest';
import { fill, inline, inset, spacer, stack } from '../index.js';

describe('gravity atoms', () => {
  it('creates spacer nodes', () => {
    expect(spacer(3, 2)).toEqual({ kind: 'empty', width: 3, height: 2 });
  });

  it('wraps content with inset padding', () => {
    expect(inset({ kind: 'text', content: 'hello' }, 2)).toEqual({
      kind: 'box',
      style: { padding: 2 },
      children: [{ kind: 'text', content: 'hello' }],
    });
  });

  it('creates inline and stack component wrappers', () => {
    const first = { kind: 'text', content: 'a' } as const;
    const second = { kind: 'text', content: 'b' } as const;
    expect(inline([first, second], 1).render()).toEqual({ kind: 'row', gap: 1, children: [first, second] });
    expect(stack([first, second], 2).render()).toEqual({ kind: 'column', gap: 2, children: [first, second] });
  });

  it('fills a child into explicit dimensions', () => {
    expect(fill({ kind: 'text', content: 'child' }, { cols: 12, rows: 4 })).toEqual({
      kind: 'box',
      width: 12,
      height: 4,
      children: [{ kind: 'text', content: 'child' }],
    });
  });
});
