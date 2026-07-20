import { color, defaultTheme } from '@celestial/core/corona';
import type { BoxNode, ColumnNode, TextNode } from '@celestial/core/nebula';
import { describe, expect, it } from 'vitest';
import { collapsiblePane, panel, titledPane } from '../panel.js';

function textNode(content: string): TextNode {
  return { kind: 'text', content };
}

describe('panel defaults', () => {
  it('uses corona semantic tokens for border, title, and focus chrome', () => {
    const defaultBorder = (defaultTheme.elevation.raised.border ?? defaultTheme.colors.border).fg();
    const defaultTitle = defaultTheme.typography.title.color.fg();
    const defaultFocus = (defaultTheme.states.focus.border ?? defaultTheme.colors.borderActive).fg();

    const plain = panel({ content: textNode('body'), title: 'Title' }) as BoxNode;
    expect(plain.style?.fg).toBe(defaultBorder);

    const plainContent = plain.children[0] as ColumnNode;
    const plainTitle = plainContent.children[0] as TextNode;
    expect(plainTitle.content).toBe(`${defaultTitle}Title${color.reset.fg()}`);

    const focused = panel({ content: textNode('body'), focused: true }) as BoxNode;
    expect(focused.style?.fg).toBe(defaultFocus);

    const titled = titledPane({ title: 'Title', content: textNode('body') }) as BoxNode;
    expect(titled.style?.fg).toBe(defaultBorder);

    const titledContent = titled.children[0] as ColumnNode;
    const divider = titledContent.children[1] as TextNode;
    expect(divider.content).toBe(`${defaultBorder}${'─'.repeat(20)}${color.reset.fg()}`);

    const collapsed = collapsiblePane({ id: 'x', title: 'Files', content: textNode('body'), collapsed: true }) as BoxNode;
    expect(collapsed.style?.fg).toBe(defaultBorder);

    const collapsedGlyph = collapsed.children[0] as TextNode;
    expect(collapsedGlyph.content).toBe(`${defaultBorder}${defaultTheme.glyphs.pointer}${color.reset.fg()}`);

    const expanded = collapsiblePane({ id: 'x', title: 'Files', content: textNode('body'), collapsed: false }) as BoxNode;
    const expandedContent = expanded.children[0] as ColumnNode;
    const expandedTitle = expandedContent.children[0] as TextNode;
    expect(expandedTitle.content).toBe(`${defaultTitle}${defaultTheme.glyphs.menuArrow} Files${color.reset.fg()}`);
  });
});
