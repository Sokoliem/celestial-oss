import { describe, expect, it, vi } from 'vitest';
import { tree } from '../tree.js';

/** Extract concatenated text content through layout and interaction wrappers. */
interface TestNode {
  kind: string;
  content?: string;
  child?: TestNode;
  children?: TestNode[];
}

function extractText(node: TestNode): string {
  if (node.kind === 'text') return node.content ?? '';
  if (node.child) return extractText(node.child);
  if (node.children) return node.children.map(extractText).join('');
  return '';
}

const nodes = [
  {
    label: 'Root',
    key: 'root',
    children: [
      { label: 'Child 1', key: 'child1' },
      {
        label: 'Child 2',
        key: 'child2',
        children: [{ label: 'Grandchild', key: 'grandchild' }],
      },
    ],
  },
  { label: 'Sibling', key: 'sibling' },
];

describe('tree', () => {
  it('init with all nodes collapsed', () => {
    const component = tree({ nodes });
    const [model] = component.init();
    expect(model.expanded.size).toBe(0);
  });

  it('init flat keys contain only root-level nodes when collapsed', () => {
    const component = tree({ nodes });
    const [model] = component.init();
    expect(model.flatKeys).toEqual(['root', 'sibling']);
  });

  it('view renders root-level labels', () => {
    const component = tree({ nodes });
    const [model] = component.init();
    const vnode = component.view(model);
    expect(vnode.kind).toBe('column');
    if (vnode.kind === 'column') {
      expect(vnode.children.length).toBe(2);
      const first = vnode.children[0];
      expect(extractText(first!)).toContain('Root');
    }
  });

  it('update toggles expand', () => {
    const component = tree({ nodes });
    const [model] = component.init();
    const [expanded] = component.update({ type: 'toggle' }, model);
    expect(expanded.expanded.has('root')).toBe(true);
    expect(expanded.flatKeys).toContain('child1');
    expect(expanded.flatKeys).toContain('child2');
  });

  it('update toggles collapse', () => {
    const component = tree({ nodes });
    const [model] = component.init();
    const [expanded] = component.update({ type: 'toggle' }, model);
    const [collapsed] = component.update({ type: 'toggle' }, expanded);
    expect(collapsed.expanded.has('root')).toBe(false);
    expect(collapsed.flatKeys).toEqual(['root', 'sibling']);
  });

  it('view shows expand indicator (▶) for collapsed', () => {
    const component = tree({ nodes });
    const [model] = component.init();
    const vnode = component.view(model);
    if (vnode.kind === 'column') {
      const first = vnode.children[0];
      expect(extractText(first!)).toContain('▶');
    }
  });

  it('view shows expand indicator (▼) for expanded', () => {
    const component = tree({ nodes });
    const [model] = component.init();
    const [expanded] = component.update({ type: 'toggle' }, model);
    const vnode = component.view(expanded);
    if (vnode.kind === 'column') {
      const first = vnode.children[0];
      expect(extractText(first!)).toContain('▼');
    }
  });

  it('view shows indented children when expanded', () => {
    const component = tree({ nodes });
    const [model] = component.init();
    const [expanded] = component.update({ type: 'toggle' }, model);
    const vnode = component.view(expanded);
    if (vnode.kind === 'column') {
      // root, child1, child2, sibling
      expect(vnode.children.length).toBe(4);
      const child1 = vnode.children[1];
      expect(extractText(child1!)).toContain('Child 1');
    }
  });

  it('view renders branch lines', () => {
    const component = tree({ nodes });
    const [model] = component.init();
    const [expanded] = component.update({ type: 'toggle' }, model);
    const vnode = component.view(expanded);
    if (vnode.kind === 'column') {
      const child1 = vnode.children[1];
      // Child 1 is not the last child, so it should have ├──
      expect(extractText(child1!)).toContain('├──');
      const child2 = vnode.children[2];
      // Child 2 is the last child, so it should have └──
      expect(extractText(child2!)).toContain('└──');
    }
  });

  it('update handles selection', () => {
    const onSelect = vi.fn();
    const component = tree({ nodes, onSelect });
    const [model] = component.init();
    component.update({ type: 'select' }, model);
    expect(onSelect).toHaveBeenCalledWith('root');
  });

  it('update navigates down', () => {
    const component = tree({ nodes });
    const [model] = component.init();
    const [updated] = component.update({ type: 'down' }, model);
    expect(updated.cursor).toBe(1);
  });

  it('update navigates up', () => {
    const component = tree({ nodes });
    const [initial] = component.init();
    const model = { ...initial, flatKeys: ['root', 'sibling'], cursor: 1 };
    const [updated] = component.update({ type: 'up' }, model);
    expect(updated.cursor).toBe(0);
  });

  it('handles deeply nested nodes', () => {
    const component = tree({ nodes });
    const [model] = component.init();
    // Expand root
    const [step1] = component.update({ type: 'toggle' }, model);
    // Navigate to child2
    const [step2] = component.update({ type: 'down' }, step1);
    const [step3] = component.update({ type: 'down' }, step2);
    // Expand child2
    const [step4] = component.update({ type: 'toggle' }, step3);
    expect(step4.flatKeys).toContain('grandchild');
  });

  it('should keep cursor pointing at the toggled key after toggle', () => {
    // Bug: After toggle-collapse, flatKeys shrinks but model.cursor stays at
    // its old value. When cursor was on the toggled node, it's fine because
    // the toggled node's position hasn't changed. But the fix ensures we
    // explicitly set cursor = keys.indexOf(k) for correctness.
    //
    // Expose: expand root at index 0, cursor moves to 0 for root.
    // After expand, root is still at 0 -- works. But if we construct a scenario
    // where the toggled key moves position, cursor must follow.
    //
    // Actually the real scenario: expand A which adds children,
    // cursor at A (position 0 in collapsed). After expand,
    // A is still at 0 but toggling guarantees cursor tracks.
    // The spec says: after toggle, cursor = keys.indexOf(k).
    const expandableNodes = [
      {
        label: 'A',
        key: 'a',
        children: [
          { label: 'A1', key: 'a1' },
          { label: 'A2', key: 'a2' },
        ],
      },
      {
        label: 'B',
        key: 'b',
        children: [{ label: 'B1', key: 'b1' }],
      },
    ];
    const component = tree({ nodes: expandableNodes });
    const [model] = component.init();
    // Expand A (cursor=0)
    const [exp] = component.update({ type: 'toggle' }, model);
    // flatKeys: a, a1, a2, b
    expect(exp.flatKeys).toEqual(['a', 'a1', 'a2', 'b']);
    // The cursor should explicitly be set to indexOf('a') = 0
    expect(exp.cursor).toBe(0);
    expect(exp.flatKeys[exp.cursor]).toBe('a');

    // Navigate to b (index 3) and expand it
    let m = exp;
    for (let i = 0; i < 3; i++) [m] = component.update({ type: 'down' }, m);
    expect(m.cursor).toBe(3);
    expect(m.flatKeys[m.cursor]).toBe('b');
    const [exp2] = component.update({ type: 'toggle' }, m);
    // flatKeys: a, a1, a2, b, b1
    expect(exp2.flatKeys).toEqual(['a', 'a1', 'a2', 'b', 'b1']);
    // cursor should be on 'b' at index 3
    expect(exp2.cursor).toBe(3);
    expect(exp2.flatKeys[exp2.cursor]).toBe('b');

    // Collapse b while on it
    const [coll] = component.update({ type: 'toggle' }, exp2);
    // flatKeys: a, a1, a2, b
    expect(coll.flatKeys).toEqual(['a', 'a1', 'a2', 'b']);
    // cursor should be on 'b' at index 3
    expect(coll.cursor).toBe(3);
    expect(coll.flatKeys[coll.cursor]).toBe('b');
  });

  it('does not toggle leaf nodes', () => {
    const component = tree({ nodes });
    // Navigate to sibling (a leaf)
    const [model] = component.init();
    const [nav] = component.update({ type: 'down' }, model);
    expect(nav.cursor).toBe(1);
    const [toggled] = component.update({ type: 'toggle' }, nav);
    expect(toggled.expanded.size).toBe(0);
  });

  it('should find isLast correctly for keys in later sibling subtrees', () => {
    // This tests that isLast searches all sibling subtrees, not just the first.
    // With the bug, isLast short-circuits on the first child search even when
    // the result is false, so a key in a later sibling's children never gets found.
    const multiChildNodes = [
      {
        label: 'A',
        key: 'a',
        children: [
          { label: 'A1', key: 'a1' },
          { label: 'A2', key: 'a2' },
        ],
      },
      {
        label: 'B',
        key: 'b',
        children: [
          { label: 'B1', key: 'b1' },
          { label: 'B2', key: 'b2' },
        ],
      },
    ];

    const component = tree({ nodes: multiChildNodes });
    const [model] = component.init();

    // Expand both nodes
    const [step1] = component.update({ type: 'toggle' }, model); // expand A
    const [step2] = component.update({ type: 'down' }, step1);
    const [step3] = component.update({ type: 'down' }, step2);
    const [step4] = component.update({ type: 'down' }, step3); // cursor on B
    const [step5] = component.update({ type: 'toggle' }, step4); // expand B

    const vnode = component.view(step5);
    if (vnode.kind === 'column') {
      // B2 is the last child of B, so should have └── connector
      const b2Node = vnode.children.find((c) => extractText(c as Parameters<typeof extractText>[0]).includes('B2'));
      expect(b2Node).toBeDefined();
      expect(extractText(b2Node as Parameters<typeof extractText>[0])).toContain('└──');

      // B1 is NOT the last child of B, so should have ├── connector
      const b1Node = vnode.children.find((c) => extractText(c as Parameters<typeof extractText>[0]).includes('B1'));
      expect(b1Node).toBeDefined();
      expect(extractText(b1Node as Parameters<typeof extractText>[0])).toContain('├──');
    }
  });
});
