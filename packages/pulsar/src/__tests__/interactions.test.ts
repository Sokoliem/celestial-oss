import { describe, expect, it } from 'vitest';
import { dispatchMarkdownInteraction, findInteractiveNodes } from '../interactions.js';
import { markdown } from '../vnode.js';
import type { VNode } from '../vnode.js';

describe('findInteractiveNodes', () => {
  it('terminates cyclic runtime VNode graphs', () => {
    const cyclic = { kind: 'column', children: [] } as unknown as VNode & { children: VNode[] };
    cyclic.children.push({ kind: 'text', content: 'link', data: { kind: 'link', url: '/safe', text: 'safe' } }, cyclic);

    const nodes = findInteractiveNodes(cyclic);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.data.kind).toBe('link');
  });

  it('resolves responsive components when collecting interactive nodes', () => {
    const nodes = findInteractiveNodes(markdown('Visit [home](https://example.com).', { hyperlinks: true }));
    expect(nodes.some(({ data }) => data.kind === 'link' && data.url === 'https://example.com')).toBe(true);
  });

  it('contains component renderer failures', () => {
    const broken = { kind: 'component', render: () => { throw new Error('broken host component'); } } as VNode;
    expect(findInteractiveNodes(broken)).toEqual([]);
  });
});

describe('dispatchMarkdownInteraction', () => {
  it('routes every activatable payload and reports missing handlers', () => {
    const calls: string[] = [];
    const hooks = {
      onLinkClick: (url: string) => calls.push(`link:${url}`),
      onCopy: ({ code }: { code: string; language: string }) => calls.push(`copy:${code}`),
      onFootnote: (label: string) => calls.push(`footnote:${label}`),
      onTaskToggle: ({ itemIndex }: { itemIndex: number; checked: boolean }) => calls.push(`task:${itemIndex}`),
      onFoldToggle: ({ language }: { code: string; language: string }) => calls.push(`fold:${language}`),
    };

    expect(dispatchMarkdownInteraction({ kind: 'link', url: '/docs', text: 'docs' }, hooks)).toBe(true);
    expect(dispatchMarkdownInteraction({ kind: 'copy', code: 'x', language: 'ts' }, hooks)).toBe(true);
    expect(dispatchMarkdownInteraction({ kind: 'footnote-ref', label: '1' }, hooks)).toBe(true);
    expect(dispatchMarkdownInteraction({ kind: 'task-toggle', itemIndex: 2, checked: false }, hooks)).toBe(true);
    expect(dispatchMarkdownInteraction({ kind: 'fold-toggle', code: 'x', language: 'ts' }, hooks)).toBe(true);
    expect(dispatchMarkdownInteraction({ kind: 'hover-link', url: '/docs', text: 'docs' }, hooks)).toBe(false);
    expect(dispatchMarkdownInteraction({ kind: 'link', url: '/none', text: 'none' }, {})).toBe(false);
    expect(calls).toEqual(['link:/docs', 'copy:x', 'footnote:1', 'task:2', 'fold:ts']);
  });
});
