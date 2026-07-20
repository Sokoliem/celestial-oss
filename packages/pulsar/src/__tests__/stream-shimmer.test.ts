import { describe, expect, it } from 'vitest';
import { createMarkdownStream } from '../stream.js';
import { markdownStreamShimmer } from '../stream-shimmer.js';
import { defaultTheme } from '../theme.js';

describe('markdownStreamShimmer', () => {
  it('returns a column VNode', () => {
    const stream = createMarkdownStream({ width: 40 });
    stream.append('# Hello\n\nSome text\n');
    const snapshot = stream.snapshot();
    const theme = defaultTheme();
    const vnode = markdownStreamShimmer(snapshot, theme, { width: 40 });
    expect(vnode.kind).toBe('column');
  });

  it('renders committed content as normal text nodes', () => {
    const stream = createMarkdownStream({ width: 40 });
    stream.append('# Hello\n');
    const snapshot = stream.snapshot();
    const theme = defaultTheme();
    const vnode = markdownStreamShimmer(snapshot, theme, { width: 40 });
    expect(vnode.kind).toBe('column');
    const col = vnode as { kind: 'column'; children: Array<{ kind: string; content: string; style?: { dim?: boolean } }> };
    const firstText = col.children.find((c) => c.kind === 'text' && c.content.includes('Hello'));
    expect(firstText).toBeDefined();
    expect(firstText?.style?.dim).not.toBe(true);
  });

  it('renders pending content as dim skeleton nodes', () => {
    const stream = createMarkdownStream({ width: 40 });
    stream.append('# Hello\n\nPending paragraph');
    const snapshot = stream.snapshot();
    const theme = defaultTheme();
    const vnode = markdownStreamShimmer(snapshot, theme, { width: 40 });
    expect(vnode.kind).toBe('column');
    const col = vnode as { kind: 'column'; children: Array<{ kind: string; content: string; style?: { dim?: boolean } }> };
    const pendingNode = col.children.find((c) => c.kind === 'text' && c.content.includes('░'));
    expect(pendingNode).toBeDefined();
    expect(pendingNode?.style?.dim).toBe(true);
  });

  it('renders empty committed source without crashing', () => {
    const stream = createMarkdownStream({ width: 40 });
    stream.append('Pending');
    const snapshot = stream.snapshot();
    const theme = defaultTheme();
    const vnode = markdownStreamShimmer(snapshot, theme, { width: 40 });
    expect(vnode.kind).toBe('column');
  });

  it('respects reduceMotion with static dim skeleton', () => {
    const stream = createMarkdownStream({ width: 40 });
    stream.append('Pending line');
    const snapshot = stream.snapshot();
    const theme = defaultTheme();
    const vnode = markdownStreamShimmer(snapshot, theme, { width: 40, reduceMotion: true });
    expect(vnode.kind).toBe('column');
    const col = vnode as { kind: 'column'; children: Array<{ kind: string; content: string; style?: { dim?: boolean } }> };
    const pendingNode = col.children.find((c) => c.kind === 'text' && c.content.includes('░'));
    expect(pendingNode).toBeDefined();
    expect(pendingNode?.style?.dim).toBe(true);
  });

  it('normalizes non-finite and negative widths', () => {
    const stream = createMarkdownStream();
    stream.append('Pending line');
    const snapshot = stream.snapshot();
    expect(() => markdownStreamShimmer(snapshot, defaultTheme(), { width: Number.POSITIVE_INFINITY })).not.toThrow();
    expect(() => markdownStreamShimmer(snapshot, defaultTheme(), { width: -10 })).not.toThrow();
  });
});
