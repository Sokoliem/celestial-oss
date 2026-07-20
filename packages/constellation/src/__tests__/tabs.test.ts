import { describe, expect, it, vi } from 'vitest';
import { tabs } from '../tabs.js';

interface TestNode {
  kind: string;
  content?: string;
  style?: { bold?: boolean; underline?: boolean; dim?: boolean; strikethrough?: boolean };
  child?: TestNode;
  children?: TestNode[];
}

function collectTextNodes(node: TestNode): TestNode[] {
  if (node.kind === 'text') return [node];
  if (node.child) return collectTextNodes(node.child);
  return node.children?.flatMap(collectTextNodes) ?? [];
}

const tabList = [
  { label: 'Home', key: 'home' },
  { label: 'Settings', key: 'settings' },
  { label: 'Profile', key: 'profile' },
];

describe('tabs', () => {
  it('init with default active tab 0', () => {
    const comp = tabs({ tabs: tabList });
    const [model] = comp.init();
    expect(model.active).toBe(0);
  });

  it('init with custom active index', () => {
    const comp = tabs({ tabs: tabList, active: 2 });
    const [model] = comp.init();
    expect(model.active).toBe(2);
  });

  it('left/right navigation with wrapping', () => {
    const comp = tabs({ tabs: tabList });
    const [model] = comp.init();
    // Right moves forward
    const [m1] = comp.update({ type: 'right' }, model);
    expect(m1.active).toBe(1);
    // Right again
    const [m2] = comp.update({ type: 'right' }, m1);
    expect(m2.active).toBe(2);
    // Right wraps to 0
    const [m3] = comp.update({ type: 'right' }, m2);
    expect(m3.active).toBe(0);
    // Left from 0 wraps to end
    const [m4] = comp.update({ type: 'left' }, model);
    expect(m4.active).toBe(2);
  });

  it('select callback fires with tab key and index', () => {
    const onChange = vi.fn();
    const comp = tabs({ tabs: tabList, onChange });
    const model = { active: 1, focused: true };
    comp.update({ type: 'select' }, model);
    expect(onChange).toHaveBeenCalledWith('settings', 1);
  });

  it('view shows active tab with different style', () => {
    const comp = tabs({ tabs: tabList });
    const model = { active: 1, focused: true };
    const vnode = comp.view(model);
    expect(vnode.kind).toBe('row');
    if (vnode.kind === 'row') {
      // 3 tabs + 2 separators = 5 children
      expect(vnode.children.length).toBe(5);
      // Active tab (index 1 in tabs = index 2 in children: tab, sep, TAB, sep, tab)
      const activeTab = vnode.children[2];
      const activeText = activeTab ? collectTextNodes(activeTab as TestNode)[0] : undefined;
      expect(activeText?.content).toContain('Settings');
      expect(activeText?.style?.bold).toBe(true);
      expect(activeText?.style?.underline).toBe(true);
      // Inactive tab (first child)
      const inactiveTab = vnode.children[0];
      const inactiveText = inactiveTab ? collectTextNodes(inactiveTab as TestNode)[0] : undefined;
      expect(inactiveText?.content).toContain('Home');
      expect(inactiveText?.style?.dim).toBe(true);
    }
  });

  it('view renders all tab labels', () => {
    const comp = tabs({ tabs: tabList });
    const [model] = comp.init();
    const vnode = comp.view(model);
    if (vnode.kind === 'row') {
      const labels = vnode.children.flatMap((child) => collectTextNodes(child as TestNode).map((node) => node.content ?? ''));
      expect(labels.some((l) => l.includes('Home'))).toBe(true);
      expect(labels.some((l) => l.includes('Settings'))).toBe(true);
      expect(labels.some((l) => l.includes('Profile'))).toBe(true);
    }
  });

  // ── badge ───────────────────────────────────────────────────────────

  it('renders badge text after label', () => {
    const tabsWithBadge = [
      { label: 'Home', key: 'home', badge: '3' },
      { label: 'Settings', key: 'settings' },
    ];
    const comp = tabs({ tabs: tabsWithBadge });
    const [model] = comp.init();
    const vnode = comp.view(model);
    if (vnode.kind === 'row') {
      const first = vnode.children[0];
      expect(
        first
          ? collectTextNodes(first as TestNode)
              .map((node) => node.content)
              .join('')
          : '',
      ).toContain('(3)');
    }
  });

  // ── disabled tabs ─────────────────────────────────────────────────────

  it('navigation skips disabled tabs', () => {
    const tabsWithDisabled = [
      { label: 'A', key: 'a' },
      { label: 'B', key: 'b', disabled: true },
      { label: 'C', key: 'c' },
    ];
    const comp = tabs({ tabs: tabsWithDisabled });
    const [model] = comp.init();
    // Right from A should skip B and go to C
    const [m1] = comp.update({ type: 'right' }, model);
    expect(m1.active).toBe(2);
  });

  it('left navigation skips disabled tabs', () => {
    const tabsWithDisabled = [
      { label: 'A', key: 'a' },
      { label: 'B', key: 'b', disabled: true },
      { label: 'C', key: 'c' },
    ];
    const comp = tabs({ tabs: tabsWithDisabled, active: 2 });
    const model = { active: 2, focused: true };
    // Left from C should skip B and go to A
    const [m1] = comp.update({ type: 'left' }, model);
    expect(m1.active).toBe(0);
  });

  it('select does not fire onChange for disabled tab', () => {
    const tabsWithDisabled = [{ label: 'A', key: 'a', disabled: true }];
    const onChange = vi.fn();
    const comp = tabs({ tabs: tabsWithDisabled, onChange });
    const model = { active: 0, focused: true };
    comp.update({ type: 'select' }, model);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('disabled tabs render with strikethrough style', () => {
    const tabsWithDisabled = [
      { label: 'A', key: 'a', disabled: true },
      { label: 'B', key: 'b' },
    ];
    const comp = tabs({ tabs: tabsWithDisabled });
    const model = { active: 1, focused: true };
    const vnode = comp.view(model);
    if (vnode.kind === 'row') {
      const disabledTab = vnode.children[0];
      const disabledText = disabledTab ? collectTextNodes(disabledTab as TestNode)[0] : undefined;
      expect(disabledText?.style?.strikethrough).toBe(true);
    }
  });

  // ── closeable tabs ────────────────────────────────────────────────────

  it('closeable tab renders close indicator', () => {
    const closeableTabs = [{ label: 'File', key: 'file', closeable: true }];
    const comp = tabs({ tabs: closeableTabs });
    const [model] = comp.init();
    const vnode = comp.view(model);
    if (vnode.kind === 'row') {
      const tab = vnode.children[0];
      expect(
        tab
          ? collectTextNodes(tab as TestNode)
              .map((node) => node.content)
              .join('')
          : '',
      ).toContain('×');
    }
  });

  it('close message fires onClose callback', () => {
    const closeableTabs = [{ label: 'File', key: 'file', closeable: true }];
    const onClose = vi.fn();
    const comp = tabs({ tabs: closeableTabs, onClose });
    const [model] = comp.init();
    comp.update({ type: 'close', index: 0 } as any, model);
    expect(onClose).toHaveBeenCalledWith('file', 0);
  });

  it('close message does not fire for non-closeable tab', () => {
    const nonCloseableTabs = [{ label: 'Fixed', key: 'fixed' }];
    const onClose = vi.fn();
    const comp = tabs({ tabs: nonCloseableTabs, onClose });
    const [model] = comp.init();
    comp.update({ type: 'close', index: 0 } as any, model);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('snapshots tab definitions and normalizes corrupt external indices', () => {
    const mutable = [{ label: 'Original', key: 'original' }];
    const comp = tabs({ tabs: mutable, active: Number.NaN });
    mutable[0]!.label = 'Changed';
    const [model] = comp.init();
    expect(model.active).toBe(0);
    expect(JSON.stringify(comp.view({ ...model, active: Number.POSITIVE_INFINITY }))).toContain('Original');
    expect(JSON.stringify(comp.view(model))).not.toContain('Changed');
  });
});
