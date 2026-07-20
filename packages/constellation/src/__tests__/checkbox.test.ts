import { extractNodeText } from '@celestial/core/nebula';
import { describe, expect, it, vi } from 'vitest';
import { checkbox, checkboxGroup } from '../checkbox.js';

describe('checkbox', () => {
  it('init with default (unchecked)', () => {
    const comp = checkbox({ label: 'Accept terms' });
    const [model] = comp.init();
    expect(model.checked).toBe(false);
  });

  it('init with checked true', () => {
    const comp = checkbox({ label: 'Accept terms', checked: true });
    const [model] = comp.init();
    expect(model.checked).toBe(true);
  });

  it('toggle changes checked state', () => {
    const comp = checkbox({ label: 'Accept terms' });
    const [model] = comp.init();
    const [toggled] = comp.update({ type: 'toggle' }, model);
    expect(toggled.checked).toBe(true);
    const [toggledBack] = comp.update({ type: 'toggle' }, toggled);
    expect(toggledBack.checked).toBe(false);
  });

  it('onChange callback fires with new value', () => {
    const onChange = vi.fn();
    const comp = checkbox({ label: 'Accept terms', onChange });
    const [model] = comp.init();
    comp.update({ type: 'toggle' }, model);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('view renders checkbox indicator', () => {
    const comp = checkbox({ label: 'Accept terms' });
    const [model] = comp.init();
    const vnode = comp.view(model);
    expect(vnode.kind).toBe('event');
    expect(extractNodeText(vnode)).toContain('[ ]');
    expect(extractNodeText(vnode)).toContain('Accept terms');
    // Checked view
    const checkedModel = { checked: true, focused: false };
    const checkedView = comp.view(checkedModel);
    expect(extractNodeText(checkedView)).toContain('[✓]');
  });

  it('keeps pointer subscriptions active without keyboard focus', () => {
    const comp = checkbox({ label: 'Accept terms' });
    const [model] = comp.init();
    // Model should have focused: false by default
    expect(model.focused).toBe(false);
    const sub = comp.subscriptions!(model);
    expect(sub._kind.kind).toBe('elementMouse');
  });

  it('should return key subscriptions when focused', () => {
    const comp = checkbox({ label: 'Accept terms' });
    const [model] = comp.init();
    const [focused] = comp.update({ type: 'focus' }, model);
    expect(focused.focused).toBe(true);
    const sub = comp.subscriptions!(focused);
    expect(sub._kind.kind).toBe('batch');
  });

  it('should handle focus and blur messages', () => {
    const comp = checkbox({ label: 'Accept terms' });
    const [model] = comp.init();
    const [focused] = comp.update({ type: 'focus' }, model);
    expect(focused.focused).toBe(true);
    const [blurred] = comp.update({ type: 'blur' }, focused);
    expect(blurred.focused).toBe(false);
  });
});

describe('checkboxGroup', () => {
  const options = [
    { label: 'Red', value: 'red' },
    { label: 'Green', value: 'green', checked: true },
    { label: 'Blue', value: 'blue' },
  ];

  it('init with items and pre-checked values', () => {
    const comp = checkboxGroup({ options });
    const [model] = comp.init();
    expect(model.highlighted).toBe(0);
    expect(model.checked.has('green')).toBe(true);
    expect(model.checked.size).toBe(1);
  });

  it('toggle changes item checked state', () => {
    const comp = checkboxGroup({ options });
    const [model] = comp.init();
    // Toggle highlighted item (index 0 = 'red')
    const [toggled] = comp.update({ type: 'toggle' }, model);
    expect(toggled.checked.has('red')).toBe(true);
    expect(toggled.checked.has('green')).toBe(true);
    // Toggle again to uncheck
    const [untoggled] = comp.update({ type: 'toggle' }, toggled);
    expect(untoggled.checked.has('red')).toBe(false);
  });

  it('up/down navigation with boundary clamping', () => {
    const comp = checkboxGroup({ options });
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

  it('onChange fires with selected values', () => {
    const onChange = vi.fn();
    const comp = checkboxGroup({ options, onChange });
    const [model] = comp.init();
    comp.update({ type: 'toggle' }, model);
    expect(onChange).toHaveBeenCalledWith(expect.arrayContaining(['red', 'green']));
  });

  it('view renders items with checked indicators', () => {
    const comp = checkboxGroup({ options });
    const [model] = comp.init();
    const vnode = comp.view(model);
    expect(vnode.kind).toBe('column');
    if (vnode.kind === 'column') {
      expect(vnode.children.length).toBe(3);
      // First item is highlighted
      const first = vnode.children[0];
      if (first?.kind === 'text') {
        expect(first.content).toContain('▸');
        expect(first.content).toContain('[ ]');
        expect(first.content).toContain('Red');
      }
      // Second item is checked (green)
      const second = vnode.children[1];
      if (second?.kind === 'text') {
        expect(second.content).toContain('[✓]');
        expect(second.content).toContain('Green');
      }
    }
  });
});
