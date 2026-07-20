import { color, style as coronaStyle, gradient } from '@celestial/corona';
import { describe, expect, it } from 'vitest';
import { gradientText } from '../elements.js';
import { measure, planLayout, rasterize } from '../vdom.js';

describe('gradientText()', () => {
  it('should create a TextNode with gradientFg in style', () => {
    const grad = gradient([color.red, color.blue]);
    const node = gradientText('Hello', grad);

    expect(node.kind).toBe('text');
    expect(node.content).toBe('Hello');
    expect(node.style).toBeDefined();
    expect(node.style!.gradientFg).toBeDefined();
    expect(node.style!.gradientFg!.length).toBe(5); // 'Hello' = 5 chars
  });

  it('should produce ANSI fg escape strings from gradient samples', () => {
    const grad = gradient([color.red, color.blue]);
    const node = gradientText('AB', grad);

    // First char -> red fg, last char -> blue fg
    const fgStrings = node.style!.gradientFg!;
    expect(fgStrings.length).toBe(2);
    expect(fgStrings[0]).toBe(color.red.fg());
    expect(fgStrings[1]).toBe(color.blue.fg());
  });

  it('should handle single-character content', () => {
    const grad = gradient([color.red, color.blue]);
    const node = gradientText('X', grad);

    expect(node.style!.gradientFg!.length).toBe(1);
    // Single char samples at t=0 (first stop)
    expect(node.style!.gradientFg![0]).toBe(color.red.fg());
  });

  it('should handle empty content', () => {
    const grad = gradient([color.red, color.blue]);
    const node = gradientText('', grad);

    expect(node.style!.gradientFg!.length).toBe(0);
    expect(node.content).toBe('');
  });

  it('should handle multi-byte characters correctly', () => {
    const grad = gradient([color.red, color.blue]);
    const node = gradientText('🌟⭐', grad);

    // Two emoji = 2 characters
    expect(node.style!.gradientFg!.length).toBe(2);
  });

  it('should preserve additional Style properties', () => {
    const grad = gradient([color.red, color.blue]);
    const s = coronaStyle({ bold: true });
    const node = gradientText('Hi', grad, s);

    expect(node.style!.bold).toBe(true);
    expect(node.style!.gradientFg!.length).toBe(2);
  });

  it('should be measurable', () => {
    const grad = gradient([color.red, color.blue]);
    const node = gradientText('Hello', grad);
    const size = measure(node);
    expect(size).toEqual({ width: 5, height: 1 });
  });

  it('should render gradient colors per-character in rasterized output', () => {
    const grad = gradient([color.red, color.blue]);
    const node = gradientText('AB', grad);
    const plan = planLayout(node, 80, 24);
    const grid = rasterize(plan);

    // Find cells with content 'A' and 'B' in the grid
    let cellA: { char: string; style: { fg?: string } } | undefined;
    let cellB: { char: string; style: { fg?: string } } | undefined;
    for (const row of grid.cells) {
      for (const cell of row) {
        if (cell.char === 'A') cellA = cell;
        if (cell.char === 'B') cellB = cell;
      }
    }

    expect(cellA).toBeDefined();
    expect(cellA!.style.fg).toBe(color.red.fg());

    expect(cellB).toBeDefined();
    expect(cellB!.style.fg).toBe(color.blue.fg());
  });
});
