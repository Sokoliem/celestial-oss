import { extractNodeText } from '@celestial/core/nebula';
import { describe, expect, it, vi } from 'vitest';
import { radioGroup } from '../radio.js';

const options = [
  { label: 'Small', value: 'sm' },
  { label: 'Medium', value: 'md' },
  { label: 'Large', value: 'lg' },
];

describe('radioGroup', () => {
  it('selects the clicked option directly', () => {
    const comp = radioGroup({ options });
    const [model] = comp.init();
    const [selected] = comp.update({ type: 'select-at', index: 2 }, model);

    expect(selected.selected).toBe(2);
    expect(selected.highlighted).toBe(2);
    expect(selected.focused).toBe(true);
  });

  it('init with default highlighted and selected at 0', () => {
    const comp = radioGroup({ options });
    const [model] = comp.init();
    expect(model.highlighted).toBe(0);
    expect(model.selected).toBe(0);
  });

  it('init with preselected value', () => {
    const comp = radioGroup({ options, selected: 2 });
    const [model] = comp.init();
    expect(model.selected).toBe(2);
    expect(model.highlighted).toBe(2);
  });

  it('up/down navigation clamps at boundaries', () => {
    const comp = radioGroup({ options });
    const [model] = comp.init();
    // Can't go above 0
    const [clamped] = comp.update({ type: 'up' }, model);
    expect(clamped.highlighted).toBe(0);
    // Go down
    const [m1] = comp.update({ type: 'down' }, model);
    expect(m1.highlighted).toBe(1);
    const [m2] = comp.update({ type: 'down' }, m1);
    expect(m2.highlighted).toBe(2);
    // Can't go past end
    const [m3] = comp.update({ type: 'down' }, m2);
    expect(m3.highlighted).toBe(2);
  });

  it('select on enter calls onChange with value and index', () => {
    const onChange = vi.fn();
    const comp = radioGroup({ options, onChange });
    const model = { selected: 0, highlighted: 1, focused: true };
    comp.update({ type: 'select' }, model);
    expect(onChange).toHaveBeenCalledWith('md', 1);
  });

  it('select updates selected to highlighted index', () => {
    const comp = radioGroup({ options });
    const model = { selected: 0, highlighted: 2, focused: true };
    const [updated] = comp.update({ type: 'select' }, model);
    expect(updated.selected).toBe(2);
  });

  it('keeps pointer subscriptions active when keyboard focus is absent', () => {
    const comp = radioGroup({ options });
    const [model] = comp.init();
    expect(model.focused).toBe(false);
    const sub = comp.subscriptions!(model);
    expect(sub._kind.kind).toBe('elementMouse');
  });

  it('should return key subscriptions when focused', () => {
    const comp = radioGroup({ options });
    const [model] = comp.init();
    const [focused] = comp.update({ type: 'focus' }, model);
    expect(focused.focused).toBe(true);
    const sub = comp.subscriptions!(focused);
    expect(sub._kind.kind).toBe('batch');
  });

  it('should handle focus and blur messages', () => {
    const comp = radioGroup({ options });
    const [model] = comp.init();
    const [focused] = comp.update({ type: 'focus' }, model);
    expect(focused.focused).toBe(true);
    const [blurred] = comp.update({ type: 'blur' }, focused);
    expect(blurred.focused).toBe(false);
  });

  it('view renders radio indicators (selected vs unselected)', () => {
    const comp = radioGroup({ options });
    const model = { selected: 1, highlighted: 1, focused: true };
    const vnode = comp.view(model);
    expect(vnode.kind).toBe('column');
    if (vnode.kind === 'column') {
      expect(vnode.children.length).toBe(3);
      // Unselected item
      const first = vnode.children[0];
      if (first?.kind === 'text') {
        expect(first.content).toContain('( )');
        expect(first.content).toContain('Small');
      }
      // Selected and highlighted item
      const second = vnode.children[1];
      if (second?.kind === 'text') {
        expect(second.content).toContain('(●)');
        expect(second.content).toContain('▸');
        expect(second.content).toContain('Medium');
      }
    }
  });

  it('snapshots options and rejects non-finite pointer indices', () => {
    const mutable = [{ label: 'Original', value: 'original' }];
    const comp = radioGroup({ options: mutable, selected: Number.POSITIVE_INFINITY });
    mutable[0]!.label = 'Changed';
    const [model] = comp.init();
    expect(model.selected).toBe(0);
    expect(extractNodeText(comp.view(model))).toContain('Original');
    expect(comp.update({ type: 'select-at', index: Number.NaN }, model)[0]).toBe(model);
  });

  it('normalizes corrupt external model indices before keyboard selection', () => {
    const onChange = vi.fn();
    const comp = radioGroup({ options, onChange });
    const corrupt = { selected: Number.NaN, highlighted: Number.POSITIVE_INFINITY, focused: true };
    const [updated] = comp.update({ type: 'select' }, corrupt);
    expect(updated.selected).toBe(0);
    expect(onChange).toHaveBeenCalledWith('sm', 0);
  });
});
