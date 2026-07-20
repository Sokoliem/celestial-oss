import { extractNodeText } from '@celestial/core/nebula';
import { describe, expect, it, vi } from 'vitest';
import { type SelectConfig, type SelectModel, select } from '../select.js';

const options = [
  { label: 'Apple', value: 'apple' },
  { label: 'Banana', value: 'banana' },
  { label: 'Cherry', value: 'cherry' },
];

function buildModel(overrides: Partial<SelectModel>, config: SelectConfig = { options }): SelectModel {
  const [initial] = select(config).init();
  return { ...initial, ...overrides };
}

describe('select', () => {
  it('init selects nothing by default', () => {
    const component = select({ options });
    const [model] = component.init();
    expect(model.selected).toBeNull();
    expect(model.open).toBe(false);
    expect(model.highlighted).toBe(0);
  });

  it('init with pre-selected option', () => {
    const component = select({ options, selected: 1 });
    const [model] = component.init();
    expect(model.selected).toBe(1);
  });

  it('update opens dropdown on toggle', () => {
    const component = select({ options });
    const [model] = component.init();
    const [updated] = component.update({ type: 'toggle' }, model);
    expect(updated.open).toBe(true);
  });

  it('update navigates down', () => {
    const component = select({ options });
    const model = buildModel({ open: true, focused: true });
    const [updated] = component.update({ type: 'down' }, model);
    expect(updated.highlighted).toBe(1);
  });

  it('update navigates up', () => {
    const component = select({ options });
    const model = buildModel({ open: true, highlighted: 1, focused: true });
    const [updated] = component.update({ type: 'up' }, model);
    expect(updated.highlighted).toBe(0);
  });

  it('update wraps around on down at end', () => {
    const component = select({ options });
    const model = buildModel({ open: true, highlighted: 2, focused: true });
    const [updated] = component.update({ type: 'down' }, model);
    expect(updated.highlighted).toBe(0);
  });

  it('update wraps around on up at start', () => {
    const component = select({ options });
    const model = buildModel({ open: true, focused: true });
    const [updated] = component.update({ type: 'up' }, model);
    expect(updated.highlighted).toBe(2);
  });

  it('update selects on enter and closes', () => {
    const onChange = vi.fn();
    const component = select({ options, onChange });
    const model = buildModel({ open: true, highlighted: 1, focused: true }, { options, onChange });
    const [updated] = component.update({ type: 'select' }, model);
    expect(updated.selected).toBe(1);
    expect(updated.open).toBe(false);
    expect(onChange).toHaveBeenCalledWith('banana', 1);
  });

  it('update closes on escape', () => {
    const component = select({ options });
    const model = buildModel({ open: true, highlighted: 1, focused: true });
    const [updated] = component.update({ type: 'close' }, model);
    expect(updated.open).toBe(false);
  });

  it('should reset highlighted to selected index when closing via close', () => {
    const component = select({ options });
    // User previously selected index 2 (Cherry), then opened and navigated to index 0
    const model = buildModel({ open: true, highlighted: 0, selected: 2, focused: true });
    const [updated] = component.update({ type: 'close' }, model);
    expect(updated.open).toBe(false);
    expect(updated.highlighted).toBe(2); // Reset to selected
  });

  it('should reset highlighted to 0 when closing with no selection', () => {
    const component = select({ options });
    const model = buildModel({ open: true, highlighted: 2, focused: true });
    const [updated] = component.update({ type: 'close' }, model);
    expect(updated.open).toBe(false);
    expect(updated.highlighted).toBe(0); // Reset to 0 when nothing selected
  });

  it('should reset highlighted to selected index when toggle-closing', () => {
    const component = select({ options });
    // User previously selected index 1, then opened and navigated to index 2
    const model = buildModel({ open: true, highlighted: 2, selected: 1, focused: true });
    const [updated] = component.update({ type: 'toggle' }, model);
    expect(updated.open).toBe(false);
    expect(updated.highlighted).toBe(1); // Reset to selected
  });

  it('view shows placeholder when nothing selected', () => {
    const component = select({ options, placeholder: 'Pick a fruit' });
    const model = buildModel({ focused: true }, { options, placeholder: 'Pick a fruit' });
    const vnode = component.view(model);
    expect(vnode.kind).toBe('event');
    expect(extractNodeText(vnode)).toContain('Pick a fruit');
  });

  it('view shows selected option label when closed', () => {
    const component = select({ options });
    const model = buildModel({ selected: 1, focused: true });
    const vnode = component.view(model);
    expect(vnode.kind).toBe('event');
    expect(extractNodeText(vnode)).toContain('Banana');
  });

  it('view shows highlighted item in open state', () => {
    const component = select({ options });
    const model = buildModel({ open: true, highlighted: 1, focused: true });
    const vnode = component.view(model);
    expect(vnode.kind).toBe('column');
    if (vnode.kind === 'column') {
      // First child is the header row, then option items
      const items = vnode.children.slice(1);
      expect(items.length).toBe(3);
      expect(extractNodeText(items[1]!)).toContain('Banana');
      expect(extractNodeText(items[1]!)).toContain('▸');
    }
  });

  // ── disabled options ──────────────────────────────────────────────────

  it('navigation skips disabled options', () => {
    const optionsWithDisabled = [
      { label: 'A', value: 'a' },
      { label: 'B', value: 'b', disabled: true },
      { label: 'C', value: 'c' },
    ];
    const component = select({ options: optionsWithDisabled });
    const model = buildModel({ open: true, focused: true }, { options: optionsWithDisabled });
    const [updated] = component.update({ type: 'down' }, model);
    expect(updated.highlighted).toBe(2); // skips disabled B
  });

  it('up navigation skips disabled options', () => {
    const optionsWithDisabled = [
      { label: 'A', value: 'a' },
      { label: 'B', value: 'b', disabled: true },
      { label: 'C', value: 'c' },
    ];
    const component = select({ options: optionsWithDisabled });
    const model = buildModel({ open: true, highlighted: 2, focused: true }, { options: optionsWithDisabled });
    const [updated] = component.update({ type: 'up' }, model);
    expect(updated.highlighted).toBe(0); // skips disabled B
  });

  it('select does not select disabled option', () => {
    const optionsWithDisabled = [{ label: 'A', value: 'a', disabled: true }];
    const onChange = vi.fn();
    const component = select({ options: optionsWithDisabled, onChange });
    const model = buildModel({ open: true, focused: true }, { options: optionsWithDisabled, onChange });
    const [updated] = component.update({ type: 'select' }, model);
    expect(onChange).not.toHaveBeenCalled();
    expect(updated.selected).toBeNull(); // stays null
  });

  // ── option groups ─────────────────────────────────────────────────────

  it('view renders group headers in listbox mode', () => {
    const groupedOptions = [
      { label: 'Apple', value: 'apple', group: 'Fruits' },
      { label: 'Banana', value: 'banana', group: 'Fruits' },
      { label: 'Carrot', value: 'carrot', group: 'Vegetables' },
    ];
    const component = select({ options: groupedOptions, display: 'listbox' });
    const model = buildModel({ focused: true }, { options: groupedOptions, display: 'listbox' });
    const vnode = component.view(model);
    if (vnode.kind === 'column') {
      // 2 group headers + 3 options = 5 children
      expect(vnode.children.length).toBe(5);
      const firstGroup = vnode.children[0];
      if (firstGroup?.kind === 'text') {
        expect(firstGroup.content).toContain('Fruits');
      }
    }
  });

  it('view renders group headers in dropdown mode', () => {
    const groupedOptions = [
      { label: 'Apple', value: 'apple', group: 'Fruits' },
      { label: 'Carrot', value: 'carrot', group: 'Vegetables' },
    ];
    const component = select({ options: groupedOptions });
    const model = buildModel({ open: true, focused: true }, { options: groupedOptions });
    const vnode = component.view(model);
    if (vnode.kind === 'column') {
      // header row + 2 group headers + 2 options = 5 children
      expect(vnode.children.length).toBe(5);
    }
  });

  // ── windowing (virtual-scroll integration) ───────────────────────────

  it('windows a 10000-item dropdown to maxVisibleOptions rows', () => {
    const many: Array<{ label: string; value: string }> = [];
    for (let i = 0; i < 10000; i++) many.push({ label: `Item ${i}`, value: `i${i}` });
    const component = select({ options: many, maxVisibleOptions: 8 });
    const [model] = component.init();
    const opened = component.update({ type: 'toggle' }, model)[0];
    const vnode = component.view(opened);
    expect(vnode.kind).toBe('column');
    if (vnode.kind === 'column') {
      // header row + 8 visible rows. No group headers (no .group set), no spacers.
      expect(vnode.children.length).toBe(9);
    }
  });

  it('windows a 10000-item listbox to maxVisibleOptions rows', () => {
    const many: Array<{ label: string; value: string }> = [];
    for (let i = 0; i < 10000; i++) many.push({ label: `Item ${i}`, value: `i${i}` });
    const component = select({ options: many, display: 'listbox', maxVisibleOptions: 5 });
    const [model] = component.init();
    const vnode = component.view(model);
    expect(vnode.kind).toBe('column');
    if (vnode.kind === 'column') {
      // Exactly 5 rendered rows for a 10000-item list — no group headers, no spacers.
      expect(vnode.children.length).toBe(5);
    }
  });

  it('scrolls highlighted into view when navigating past the visible window', () => {
    const many: Array<{ label: string; value: string }> = [];
    for (let i = 0; i < 100; i++) many.push({ label: `Item ${i}`, value: `i${i}` });
    const component = select({ options: many, display: 'listbox', maxVisibleOptions: 5 });
    let [model] = component.init();
    // Initial state: first 5 items visible.
    let labels = (component.view(model) as { kind: 'column'; children: import('@celestial/core/nebula').VNode[] }).children.map(extractNodeText);
    expect(labels.some((l) => l.includes('Item 0'))).toBe(true);
    expect(labels.some((l) => l.includes('Item 4'))).toBe(true);
    expect(labels.some((l) => l.includes('Item 10'))).toBe(false);

    // Navigate down 12 times — highlighted should be 12, viewport should have scrolled.
    for (let i = 0; i < 12; i++) {
      [model] = component.update({ type: 'down' }, model);
    }
    expect(model.highlighted).toBe(12);
    labels = (component.view(model) as { kind: 'column'; children: import('@celestial/core/nebula').VNode[] }).children.map(extractNodeText);
    expect(labels.some((l) => l.includes('Item 12'))).toBe(true);
    expect(labels.some((l) => l.includes('Item 0'))).toBe(false);
  });

  it('keeps existing small-list behaviour unchanged (within default maxVisibleOptions)', () => {
    // 3 items, default cap of 10 — view should render every item as before.
    const component = select({ options });
    const [model] = component.init();
    const opened = component.update({ type: 'toggle' }, model)[0];
    const vnode = component.view(opened);
    if (vnode.kind === 'column') {
      // header row + 3 options = 4 children
      expect(vnode.children.length).toBe(4);
    }
  });

  it('emits a group header only on transitions inside the visible slice', () => {
    // Establishes the invariant that windowed rendering matches unwindowed
    // semantics: group labels appear at the first option of a new group when
    // that transition is inside the viewport. A slice that sits wholly mid-group
    // does not get a synthetic sticky header — that would be a new feature.
    const grouped: Array<{ label: string; value: string; group?: string }> = [];
    for (let i = 0; i < 50; i++) grouped.push({ label: `Fruit ${i}`, value: `f${i}`, group: 'Fruits' });
    for (let i = 0; i < 50; i++) grouped.push({ label: `Veg ${i}`, value: `v${i}`, group: 'Vegetables' });
    const component = select({ options: grouped, display: 'listbox', maxVisibleOptions: 5 });
    let [model] = component.init();

    // Case A: slice wholly inside Fruits — no header rendered.
    for (let i = 0; i < 30; i++) [model] = component.update({ type: 'down' }, model);
    let vnode = component.view(model);
    if (vnode.kind === 'column') {
      const labels = vnode.children.map(extractNodeText);
      expect(labels.some((l) => l.includes('Fruits'))).toBe(false);
      expect(labels.some((l) => l.includes('Vegetables'))).toBe(false);
      // Highlighted Fruit 30 must be in the visible window.
      expect(labels.some((l) => l.includes('Fruit 30'))).toBe(true);
    }

    // Case B: scroll across the Fruits→Vegetables boundary — the Vegetables
    // header appears at the transition.
    for (let i = 0; i < 20; i++) [model] = component.update({ type: 'down' }, model);
    expect(model.highlighted).toBe(50);
    vnode = component.view(model);
    if (vnode.kind === 'column') {
      const labels = vnode.children.map(extractNodeText);
      expect(labels.some((l) => l.includes('Vegetables'))).toBe(true);
      expect(labels.some((l) => l.includes('Veg 0'))).toBe(true);
    }
  });
});
