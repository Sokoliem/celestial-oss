import { extractNodeText } from '@celestial/nebula';
import { describe, expect, it, vi } from 'vitest';
import { segmentedControl, segmentedControlHitTest } from '../segmented-control.js';

describe('segmentedControl', () => {
  const options = ['S', 'M', 'L'];

  describe('init', () => {
    it('initializes with default selected index 0', () => {
      const comp = segmentedControl({ options });
      const [model] = comp.init();
      expect(model.selected).toBe(0);
      expect(model.highlighted).toBe(0);
      expect(model.focused).toBe(false);
    });

    it('initializes with custom selected index', () => {
      const comp = segmentedControl({ options, selected: 2 });
      const [model] = comp.init();
      expect(model.selected).toBe(2);
      expect(model.highlighted).toBe(2);
    });

    it('clamps selected above range to last index', () => {
      const comp = segmentedControl({ options, selected: 99 });
      const [model] = comp.init();
      expect(model.selected).toBe(2);
    });

    it('clamps selected below range to 0', () => {
      const comp = segmentedControl({ options, selected: -5 });
      const [model] = comp.init();
      expect(model.selected).toBe(0);
    });

    it('keeps an empty control in a stable unselected state', () => {
      const comp = segmentedControl({ options: [] });
      const [model] = comp.init();
      const [updated] = comp.update({ type: 'highlight-right' }, model);
      expect(updated).toEqual({ selected: -1, highlighted: -1, focused: false });
    });
  });

  describe('update', () => {
    it('select updates selected and highlighted', () => {
      const comp = segmentedControl({ options });
      const model = { selected: 0, highlighted: 0, focused: true };
      const [updated] = comp.update({ type: 'select', index: 2 }, model);
      expect(updated.selected).toBe(2);
      expect(updated.highlighted).toBe(2);
    });

    it('select calls onChange when index changes', () => {
      const onChange = vi.fn();
      const comp = segmentedControl({ options, onChange });
      const model = { selected: 0, highlighted: 0, focused: true };
      comp.update({ type: 'select', index: 1 }, model);
      expect(onChange).toHaveBeenCalledWith(1);
    });

    it('select does not call onChange when selecting same index', () => {
      const onChange = vi.fn();
      const comp = segmentedControl({ options, onChange });
      const model = { selected: 1, highlighted: 1, focused: true };
      comp.update({ type: 'select', index: 1 }, model);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('ignores non-finite and out-of-range selections', () => {
      const comp = segmentedControl({ options });
      const model = { selected: 0, highlighted: 0, focused: true };
      expect(comp.update({ type: 'select', index: Number.NaN }, model)[0]).toBe(model);
      expect(comp.update({ type: 'select', index: 99 }, model)[0]).toBe(model);
    });

    it('highlight-left wraps from first to last', () => {
      const comp = segmentedControl({ options });
      const model = { selected: 0, highlighted: 0, focused: true };
      const [updated] = comp.update({ type: 'highlight-left' }, model);
      expect(updated.highlighted).toBe(2);
    });

    it('highlight-left moves one step left', () => {
      const comp = segmentedControl({ options });
      const model = { selected: 0, highlighted: 2, focused: true };
      const [updated] = comp.update({ type: 'highlight-left' }, model);
      expect(updated.highlighted).toBe(1);
    });

    it('highlight-right wraps from last to first', () => {
      const comp = segmentedControl({ options });
      const model = { selected: 0, highlighted: 2, focused: true };
      const [updated] = comp.update({ type: 'highlight-right' }, model);
      expect(updated.highlighted).toBe(0);
    });

    it('highlight-right moves one step right', () => {
      const comp = segmentedControl({ options });
      const model = { selected: 0, highlighted: 0, focused: true };
      const [updated] = comp.update({ type: 'highlight-right' }, model);
      expect(updated.highlighted).toBe(1);
    });

    it('focus sets focused to true', () => {
      const comp = segmentedControl({ options });
      const model = { selected: 0, highlighted: 0, focused: false };
      const [updated] = comp.update({ type: 'focus' }, model);
      expect(updated.focused).toBe(true);
    });

    it('blur sets focused to false', () => {
      const comp = segmentedControl({ options });
      const model = { selected: 0, highlighted: 0, focused: true };
      const [updated] = comp.update({ type: 'blur' }, model);
      expect(updated.focused).toBe(false);
    });
  });

  describe('view', () => {
    it('renders a row node', () => {
      const comp = segmentedControl({ options });
      const [model] = comp.init();
      const vnode = comp.view(model);
      expect(vnode.kind).toBe('row');
    });

    it('includes option text in children', () => {
      const comp = segmentedControl({ options });
      const [model] = comp.init();
      const vnode = comp.view(model);
      expect(extractNodeText(vnode)).toContain('S');
      expect(extractNodeText(vnode)).toContain('M');
      expect(extractNodeText(vnode)).toContain('L');
    });

    it('selected option has bold styling', () => {
      const comp = segmentedControl({ options, selected: 1 });
      const [model] = comp.init();
      const vnode = comp.view(model);
      if (vnode.kind === 'row') {
        const optionNodes = vnode.children.filter((c) => c.kind === 'text' && !c.content.includes('│') && !c.content.includes('[') && !c.content.includes(']'));
        const selectedNode = optionNodes.find((c) => c.kind === 'text' && c.content === 'M');
        if (selectedNode && selectedNode.kind === 'text') {
          expect(selectedNode.style?.bold).toBe(true);
        }
      }
    });
  });

  describe('subscriptions', () => {
    it('keeps pointer selection active when not focused', () => {
      const comp = segmentedControl({ options });
      const sub = comp.subscriptions!({ selected: 0, highlighted: 0, focused: false });
      expect(sub._kind.kind).toBe('elementMouse');
    });

    it('returns batch of key subscriptions when focused', () => {
      const comp = segmentedControl({ options });
      const sub = comp.subscriptions!({ selected: 0, highlighted: 0, focused: true });
      expect(sub._kind.kind).toBe('batch');
    });

    it('snapshots options and focuses a direct pointer selection', () => {
      const mutable = ['Original'];
      const comp = segmentedControl({ options: mutable });
      mutable[0] = 'Changed';
      const [model] = comp.init();
      expect(extractNodeText(comp.view(model))).toContain('Original');
      const [updated] = comp.update({ type: 'select', index: 0 }, model);
      expect(updated.focused).toBe(true);
    });
  });
});

describe('segmentedControlHitTest', () => {
  it('returns null for empty options', () => {
    expect(segmentedControlHitTest([], 5)).toBeNull();
  });

  it('hits correct option by position', () => {
    // Layout: [ S │ M │ L ]
    // `[ ` = 2 chars, S at index 2
    const result = segmentedControlHitTest(['S', 'M', 'L'], 2);
    expect(result).toEqual({ type: 'select', index: 0 });
  });

  it('hits second option', () => {
    // S at 2, ` │ ` at 3-5, M at 6
    const result = segmentedControlHitTest(['S', 'M', 'L'], 6);
    expect(result).toEqual({ type: 'select', index: 1 });
  });

  it('falls back to nearest for clicks outside option text', () => {
    // Click on `[ ` bracket area (index 0) — falls back to first option
    const result = segmentedControlHitTest(['A', 'B', 'C'], 0);
    expect(result).toEqual({ type: 'select', index: 0 });
  });

  it('hit-tests wide option labels in terminal cells', () => {
    expect(segmentedControlHitTest(['界', 'B'], 3)).toEqual({ type: 'select', index: 0 });
    expect(segmentedControlHitTest(['界', 'B'], 7)).toEqual({ type: 'select', index: 1 });
    expect(segmentedControlHitTest(['界'], Number.NaN)).toBeNull();
  });
});
