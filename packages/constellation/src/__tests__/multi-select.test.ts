import { extractNodeText } from '@celestial/nebula';
import { describe, expect, it, vi } from 'vitest';
import { multiSelect } from '../multi-select.js';

const options = [
  { label: 'Apple', value: 'apple' },
  { label: 'Banana', value: 'banana' },
  { label: 'Cherry', value: 'cherry' },
];

describe('multiSelect', () => {
  // ─── init ───────────────────────────────────────────────────────────────

  describe('init', () => {
    it('starts with no selection by default', () => {
      const component = multiSelect({ options });
      const [model] = component.init();
      expect(model.selected.size).toBe(0);
      expect(model.open).toBe(false);
      expect(model.highlighted).toBe(0);
      expect(model.focused).toBe(false);
    });

    it('respects pre-selected indices', () => {
      const component = multiSelect({ options, selected: [0, 2] });
      const [model] = component.init();
      expect(model.selected.has(0)).toBe(true);
      expect(model.selected.has(2)).toBe(true);
      expect(model.selected.size).toBe(2);
    });

    it('defaults placeholder to Select...', () => {
      const component = multiSelect({ options });
      const [model] = component.init();
      const vnode = component.view(model);
      expect(vnode.kind).toBe('event');
      expect(extractNodeText(vnode)).toBe('Select...');
    });
  });

  // ─── update ─────────────────────────────────────────────────────────────

  describe('update', () => {
    it('toggle-open opens the dropdown', () => {
      const component = multiSelect({ options });
      const [model] = component.init();
      const [updated] = component.update({ type: 'toggle-open' }, model);
      expect(updated.open).toBe(true);
    });

    it('toggle-open closes if already open', () => {
      const component = multiSelect({ options });
      const model = { open: true, highlighted: 0, selected: new Set<number>(), focused: true };
      const [updated] = component.update({ type: 'toggle-open' }, model);
      expect(updated.open).toBe(false);
    });

    it('navigates down', () => {
      const component = multiSelect({ options });
      const model = { open: true, highlighted: 0, selected: new Set<number>(), focused: true };
      const [updated] = component.update({ type: 'down' }, model);
      expect(updated.highlighted).toBe(1);
    });

    it('navigates up', () => {
      const component = multiSelect({ options });
      const model = { open: true, highlighted: 1, selected: new Set<number>(), focused: true };
      const [updated] = component.update({ type: 'up' }, model);
      expect(updated.highlighted).toBe(0);
    });

    it('wraps around on down at end', () => {
      const component = multiSelect({ options });
      const model = { open: true, highlighted: 2, selected: new Set<number>(), focused: true };
      const [updated] = component.update({ type: 'down' }, model);
      expect(updated.highlighted).toBe(0);
    });

    it('wraps around on up at start', () => {
      const component = multiSelect({ options });
      const model = { open: true, highlighted: 0, selected: new Set<number>(), focused: true };
      const [updated] = component.update({ type: 'up' }, model);
      expect(updated.highlighted).toBe(2);
    });

    it('toggle-item adds highlighted item to selection', () => {
      const onChange = vi.fn();
      const component = multiSelect({ options, onChange });
      const model = { open: true, highlighted: 1, selected: new Set<number>(), focused: true };
      const [updated] = component.update({ type: 'toggle-item' }, model);
      expect(updated.selected.has(1)).toBe(true);
      expect(onChange).toHaveBeenCalledWith(['banana']);
    });

    it('toggle-item removes already-selected item', () => {
      const onChange = vi.fn();
      const component = multiSelect({ options, onChange });
      const model = { open: true, highlighted: 1, selected: new Set([0, 1, 2]), focused: true };
      const [updated] = component.update({ type: 'toggle-item' }, model);
      expect(updated.selected.has(1)).toBe(false);
      expect(updated.selected.has(0)).toBe(true);
      expect(updated.selected.has(2)).toBe(true);
      expect(onChange).toHaveBeenCalledWith(['apple', 'cherry']);
    });

    it('toggle-item calls onChange with all selected values in order', () => {
      const onChange = vi.fn();
      const component = multiSelect({ options, onChange });
      const model = { open: true, highlighted: 2, selected: new Set([0]), focused: true };
      const [updated] = component.update({ type: 'toggle-item' }, model);
      expect(updated.selected.has(0)).toBe(true);
      expect(updated.selected.has(2)).toBe(true);
      expect(onChange).toHaveBeenCalledWith(['apple', 'cherry']);
    });

    it('close closes the dropdown', () => {
      const component = multiSelect({ options });
      const model = { open: true, highlighted: 1, selected: new Set<number>(), focused: true };
      const [updated] = component.update({ type: 'close' }, model);
      expect(updated.open).toBe(false);
    });

    it('focus sets focused to true', () => {
      const component = multiSelect({ options });
      const model = { open: false, highlighted: 0, selected: new Set<number>(), focused: false };
      const [updated] = component.update({ type: 'focus' }, model);
      expect(updated.focused).toBe(true);
    });

    it('blur sets focused to false', () => {
      const component = multiSelect({ options });
      const model = { open: false, highlighted: 0, selected: new Set<number>(), focused: true };
      const [updated] = component.update({ type: 'blur' }, model);
      expect(updated.focused).toBe(false);
    });
  });

  // ─── view ───────────────────────────────────────────────────────────────

  describe('view', () => {
    it('shows placeholder when nothing selected and closed', () => {
      const component = multiSelect({ options, placeholder: 'Pick items' });
      const model = { open: false, highlighted: 0, selected: new Set<number>(), focused: false };
      const vnode = component.view(model);
      expect(vnode.kind).toBe('event');
      expect(extractNodeText(vnode)).toBe('Pick items');
    });

    it('shows tags when items are selected and closed', () => {
      const component = multiSelect({ options });
      const model = { open: false, highlighted: 0, selected: new Set([0, 2]), focused: false };
      const vnode = component.view(model);
      expect(vnode.kind).toBe('event');
      expect(extractNodeText(vnode)).toContain('[Apple]');
      expect(extractNodeText(vnode)).toContain('[Cherry]');
    });

    it('shows options with checkmarks when open', () => {
      const component = multiSelect({ options });
      const model = { open: true, highlighted: 0, selected: new Set([1]), focused: true };
      const vnode = component.view(model);
      expect(vnode.kind).toBe('column');
      if (vnode.kind === 'column') {
        expect(vnode.children.length).toBe(3);
        // Banana (index 1) should be checked
        const bananaEvent = vnode.children[1];
        if (bananaEvent?.kind === 'event' && bananaEvent.child.kind === 'row') {
          const prefix = bananaEvent.child.children[0];
          if (prefix?.kind === 'text') expect(prefix.content).toBe('[✓] ');
        }
        // Apple (index 0) should be unchecked
        const appleEvent = vnode.children[0];
        if (appleEvent?.kind === 'event' && appleEvent.child.kind === 'row') {
          const prefix = appleEvent.child.children[0];
          if (prefix?.kind === 'text') expect(prefix.content).toBe('[ ] ');
        }
      }
    });

    it('highlighted option has different style', () => {
      const component = multiSelect({ options });
      const model = { open: true, highlighted: 1, selected: new Set<number>(), focused: true };
      const vnode = component.view(model);
      if (vnode.kind === 'column') {
        const hlEvent = vnode.children[1];
        const otherEvent = vnode.children[0];
        if (hlEvent?.kind === 'event' && otherEvent?.kind === 'event' && hlEvent.child.kind === 'row' && otherEvent.child.kind === 'row') {
          const hlLabel = hlEvent.child.children[1];
          const otherLabel = otherEvent.child.children[1];
          // Highlighted and non-highlighted should have different styles
          if (hlLabel?.kind === 'text' && otherLabel?.kind === 'text') {
            expect(hlLabel.style).not.toEqual(otherLabel.style);
          }
        }
      }
    });
  });

  // ─── subscriptions ──────────────────────────────────────────────────────

  describe('subscriptions', () => {
    it('keeps pointer subscriptions active when not focused', () => {
      const component = multiSelect({ options });
      const model = { open: false, highlighted: 0, selected: new Set<number>(), focused: false };
      const sub = component.subscriptions!(model);
      expect(sub._kind.kind).toBe('elementMouse');
    });

    it('returns enter key when focused and closed', () => {
      const component = multiSelect({ options });
      const model = { open: false, highlighted: 0, selected: new Set<number>(), focused: true };
      const sub = component.subscriptions!(model);
      expect(sub._kind.kind).toBe('batch');
      if (sub._kind.kind === 'batch') expect(sub._kind.subs.some((item) => item._kind.kind === 'key' && item._kind.key === 'enter')).toBe(true);
    });

    it('returns batch of keys when focused and open', () => {
      const component = multiSelect({ options });
      const model = { open: true, highlighted: 0, selected: new Set<number>(), focused: true };
      const sub = component.subscriptions!(model);
      expect(sub._kind.kind).toBe('batch');
      if (sub._kind.kind === 'batch') {
        const kinds = sub._kind.subs.map((s: any) => s._kind);
        const keys = kinds.map((k: any) => k.key);
        expect(keys).toContain('up');
        expect(keys).toContain('down');
        expect(keys).toContain('enter');
        expect(keys).toContain('space');
        expect(keys).toContain('escape');
      }
    });
  });

  it('snapshots options and filters invalid selected indices', () => {
    const mutable = [{ label: 'Original', value: 'original' }];
    const component = multiSelect({ options: mutable, selected: [0, -1, Number.NaN] });
    mutable[0]!.label = 'Mutated';
    const [model] = component.init();
    expect([...model.selected]).toEqual([0]);
    expect(extractNodeText(component.view(model))).toContain('Original');
  });

  it('windows large open option lists around the highlight', () => {
    const many = Array.from({ length: 100 }, (_, index) => ({ label: `Item ${index}`, value: String(index) }));
    const component = multiSelect({ options: many, maxVisibleOptions: 5 });
    const view = component.view({ ...component.init()[0], open: true, focused: true, highlighted: 50 });
    if (view.kind === 'column') expect(view.children).toHaveLength(5);
  });
});
