import { describe, expect, it } from 'vitest';
import { toggle, toggleGroup } from '../toggle.js';

describe('toggle', () => {
  it('initializes with unchecked state by default', () => {
    const comp = toggle({ label: 'Enable feature' });
    const [model] = comp.init();
    expect(model.checked).toBe(false);
    expect(model.focused).toBe(false);
  });

  it('initializes with checked state when configured', () => {
    const comp = toggle({ label: 'Enable feature', checked: true });
    const [model] = comp.init();
    expect(model.checked).toBe(true);
  });

  it('toggles state on toggle message', () => {
    const comp = toggle({ label: 'Enable feature' });
    const [model] = comp.init();
    const [newModel] = comp.update({ type: 'toggle' }, model);
    expect(newModel.checked).toBe(true);
  });

  it('calls onChange callback when toggled', () => {
    let changed = false;
    const comp = toggle({
      label: 'Enable feature',
      onChange: () => {
        changed = true;
      },
    });
    const [model] = comp.init();
    comp.update({ type: 'toggle' }, model);
    expect(changed).toBe(true);
  });

  it('focuses and blurs correctly', () => {
    const comp = toggle({ label: 'Enable feature' });
    const [model] = comp.init();
    const [focused] = comp.update({ type: 'focus' }, model);
    expect(focused.focused).toBe(true);
    const [blurred] = comp.update({ type: 'blur' }, focused);
    expect(blurred.focused).toBe(false);
  });

  it('renders unchecked state', () => {
    const comp = toggle({ label: 'Enable feature' });
    const [model] = comp.init();
    const view = comp.view(model);
    expect(view).toBeDefined();
  });

  it('renders checked state', () => {
    const comp = toggle({ label: 'Enable feature', checked: true });
    const [model] = comp.init();
    const view = comp.view(model);
    expect(view).toBeDefined();
  });
});

describe('toggleGroup', () => {
  it('initializes with no selections', () => {
    const comp = toggleGroup({
      options: [
        { label: 'Option A', value: 'a' },
        { label: 'Option B', value: 'b' },
      ],
    });
    const [model] = comp.init();
    expect(model.checked.size).toBe(0);
    expect(model.highlighted).toBe(0);
  });

  it('initializes with pre-selected options', () => {
    const comp = toggleGroup({
      options: [
        { label: 'Option A', value: 'a', checked: true },
        { label: 'Option B', value: 'b' },
      ],
    });
    const [model] = comp.init();
    expect(model.checked.has('a')).toBe(true);
    expect(model.checked.has('b')).toBe(false);
  });

  it('toggles highlighted option', () => {
    const comp = toggleGroup({
      options: [
        { label: 'Option A', value: 'a' },
        { label: 'Option B', value: 'b' },
      ],
    });
    const [model] = comp.init();
    const [newModel] = comp.update({ type: 'toggle' }, model);
    expect(newModel.checked.has('a')).toBe(true);
  });

  it('navigates up and down', () => {
    const comp = toggleGroup({
      options: [
        { label: 'Option A', value: 'a' },
        { label: 'Option B', value: 'b' },
      ],
    });
    const [model] = comp.init();
    const [down] = comp.update({ type: 'down' }, model);
    expect(down.highlighted).toBe(1);
    const [up] = comp.update({ type: 'up' }, down);
    expect(up.highlighted).toBe(0);
  });

  it('clamps navigation at boundaries', () => {
    const comp = toggleGroup({
      options: [
        { label: 'Option A', value: 'a' },
        { label: 'Option B', value: 'b' },
      ],
    });
    const [model] = comp.init();
    const [up] = comp.update({ type: 'up' }, model);
    expect(up.highlighted).toBe(0);
    const [down] = comp.update({ type: 'down' }, up);
    const [down2] = comp.update({ type: 'down' }, down);
    expect(down2.highlighted).toBe(1);
  });
});
