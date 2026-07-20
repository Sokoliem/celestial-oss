import { describe, expect, it } from 'vitest';
import { contextMenu, type MenuItem } from '../context-menu.js';

describe('contextMenu', () => {
  const items: MenuItem<string>[] = [{ label: 'Open', msg: 'open' }];

  it('opens a menu for right-clicks inside a region', () => {
    const result = contextMenu([{ x: 10, y: 4, width: 8, height: 3, items }], { type: 'press', button: 2, x: 12, y: 5 });

    expect(result).toEqual({
      type: 'ctx-open',
      x: 12,
      y: 5,
      items,
    });
  });

  it('ignores clicks outside the configured regions', () => {
    const result = contextMenu([{ x: 10, y: 4, width: 8, height: 3, items }], { type: 'press', button: 2, x: 2, y: 1 });

    expect(result).toBeNull();
  });
});
