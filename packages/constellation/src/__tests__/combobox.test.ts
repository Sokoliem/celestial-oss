import { extractNodeText } from '@celestial/nebula';
import { describe, expect, it, vi } from 'vitest';
import type { ComboboxModel } from '../combobox.js';
import { combobox } from '../combobox.js';

const options = [
  { label: 'Apple', value: 'apple' },
  { label: 'Apricot', value: 'apricot' },
  { label: 'Banana', value: 'banana' },
  { label: 'Cherry', value: 'cherry' },
];

function model(overrides: Partial<ComboboxModel> = {}): ComboboxModel {
  return {
    inputBuffer: '',
    cursor: 0,
    open: false,
    highlighted: 0,
    filteredIndices: [0, 1, 2, 3],
    focused: false,
    ...overrides,
  };
}

describe('combobox', () => {
  // ─── init ───────────────────────────────────────────────────────────────

  describe('init', () => {
    it('defaults to empty input, closed, all options filtered', () => {
      const comp = combobox({ options });
      const [m] = comp.init();
      expect(m.inputBuffer).toBe('');
      expect(m.cursor).toBe(0);
      expect(m.open).toBe(false);
      expect(m.highlighted).toBe(0);
      expect(m.filteredIndices).toEqual([0, 1, 2, 3]);
      expect(m.focused).toBe(false);
    });

    it('accepts an initial value and positions cursor at end', () => {
      const comp = combobox({ options, value: 'Ban' });
      const [m] = comp.init();
      expect(m.inputBuffer).toBe('Ban');
      expect(m.cursor).toBe(3);
    });

    it('measures the cursor in grapheme clusters', () => {
      const comp = combobox({ options, value: `A👩‍🚀B` });
      expect(comp.init()[0].cursor).toBe(3);
    });

    it('computes filtered indices from initial value', () => {
      const comp = combobox({ options, value: 'an' });
      const [m] = comp.init();
      // 'an' matches 'Banana' (index 2) via case-insensitive substring
      expect(m.filteredIndices).toContain(2);
      // 'an' does NOT match 'Cherry'
      expect(m.filteredIndices).not.toContain(3);
    });
  });

  // ─── update ─────────────────────────────────────────────────────────────

  describe('update', () => {
    it('char inserts at cursor, filters, opens dropdown', () => {
      const onChange = vi.fn();
      const comp = combobox({ options, onChange });
      const m0 = model({ focused: true });
      const [m1] = comp.update({ type: 'char', char: 'a' }, m0);
      expect(m1.inputBuffer).toBe('a');
      expect(m1.cursor).toBe(1);
      expect(m1.open).toBe(true);
      // Should match Apple and Apricot (and Banana which contains 'a')
      expect(m1.filteredIndices).toContain(0);
      expect(m1.filteredIndices).toContain(1);
      expect(m1.highlighted).toBe(0);
      expect(onChange).toHaveBeenCalledWith('a');
    });

    it('char inserts in the middle of text', () => {
      const comp = combobox({ options });
      const m0 = model({ inputBuffer: 'ac', cursor: 1, focused: true });
      const [m1] = comp.update({ type: 'char', char: 'b' }, m0);
      expect(m1.inputBuffer).toBe('abc');
      expect(m1.cursor).toBe(2);
    });

    it('backspace removes char before cursor', () => {
      const onChange = vi.fn();
      const comp = combobox({ options, onChange });
      const m0 = model({ inputBuffer: 'ab', cursor: 2, focused: true });
      const [m1] = comp.update({ type: 'backspace' }, m0);
      expect(m1.inputBuffer).toBe('a');
      expect(m1.cursor).toBe(1);
      expect(onChange).toHaveBeenCalledWith('a');
    });

    it('backspace at start does nothing', () => {
      const comp = combobox({ options });
      const m0 = model({ inputBuffer: 'a', cursor: 0, focused: true });
      const [m1] = comp.update({ type: 'backspace' }, m0);
      expect(m1).toBe(m0);
    });

    it('delete removes char at cursor', () => {
      const onChange = vi.fn();
      const comp = combobox({ options, onChange });
      const m0 = model({ inputBuffer: 'abc', cursor: 1, focused: true });
      const [m1] = comp.update({ type: 'delete' }, m0);
      expect(m1.inputBuffer).toBe('ac');
      expect(m1.cursor).toBe(1);
      expect(onChange).toHaveBeenCalledWith('ac');
    });

    it('delete at end does nothing', () => {
      const comp = combobox({ options });
      const m0 = model({ inputBuffer: 'a', cursor: 1, focused: true });
      const [m1] = comp.update({ type: 'delete' }, m0);
      expect(m1).toBe(m0);
    });

    it('backspace removes a whole extended grapheme', () => {
      const comp = combobox({ options });
      const m0 = model({ inputBuffer: `A👩‍🚀`, cursor: 2, focused: true });
      const [m1] = comp.update({ type: 'backspace' }, m0);
      expect(m1.inputBuffer).toBe('A');
      expect(m1.cursor).toBe(1);
    });

    it('cursor-left moves cursor left', () => {
      const comp = combobox({ options });
      const m0 = model({ inputBuffer: 'abc', cursor: 2 });
      const [m1] = comp.update({ type: 'cursor-left' }, m0);
      expect(m1.cursor).toBe(1);
    });

    it('cursor-left at start stays at 0', () => {
      const comp = combobox({ options });
      const m0 = model({ inputBuffer: 'abc', cursor: 0 });
      const [m1] = comp.update({ type: 'cursor-left' }, m0);
      expect(m1.cursor).toBe(0);
    });

    it('cursor-right moves cursor right', () => {
      const comp = combobox({ options });
      const m0 = model({ inputBuffer: 'abc', cursor: 1 });
      const [m1] = comp.update({ type: 'cursor-right' }, m0);
      expect(m1.cursor).toBe(2);
    });

    it('cursor-right at end stays at end', () => {
      const comp = combobox({ options });
      const m0 = model({ inputBuffer: 'abc', cursor: 3 });
      const [m1] = comp.update({ type: 'cursor-right' }, m0);
      expect(m1.cursor).toBe(3);
    });

    it('home moves cursor to 0', () => {
      const comp = combobox({ options });
      const m0 = model({ inputBuffer: 'abc', cursor: 2 });
      const [m1] = comp.update({ type: 'home' }, m0);
      expect(m1.cursor).toBe(0);
    });

    it('end moves cursor to end', () => {
      const comp = combobox({ options });
      const m0 = model({ inputBuffer: 'abc', cursor: 0 });
      const [m1] = comp.update({ type: 'end' }, m0);
      expect(m1.cursor).toBe(3);
    });

    it('down navigates filtered options', () => {
      const comp = combobox({ options });
      const m0 = model({ open: true, highlighted: 0, filteredIndices: [0, 1, 2] });
      const [m1] = comp.update({ type: 'down' }, m0);
      expect(m1.highlighted).toBe(1);
    });

    it('down wraps from last to first', () => {
      const comp = combobox({ options });
      const m0 = model({ open: true, highlighted: 2, filteredIndices: [0, 1, 2] });
      const [m1] = comp.update({ type: 'down' }, m0);
      expect(m1.highlighted).toBe(0);
    });

    it('up navigates filtered options', () => {
      const comp = combobox({ options });
      const m0 = model({ open: true, highlighted: 1, filteredIndices: [0, 1, 2] });
      const [m1] = comp.update({ type: 'up' }, m0);
      expect(m1.highlighted).toBe(0);
    });

    it('up wraps from first to last', () => {
      const comp = combobox({ options });
      const m0 = model({ open: true, highlighted: 0, filteredIndices: [0, 1, 2] });
      const [m1] = comp.update({ type: 'up' }, m0);
      expect(m1.highlighted).toBe(2);
    });

    it('select picks highlighted option, closes dropdown, calls onChange', () => {
      const onChange = vi.fn();
      const comp = combobox({ options, onChange });
      const m0 = model({ open: true, highlighted: 1, filteredIndices: [0, 1, 2, 3] });
      const [m1] = comp.update({ type: 'select' }, m0);
      expect(m1.inputBuffer).toBe('Apricot');
      expect(m1.cursor).toBe(7);
      expect(m1.open).toBe(false);
      expect(onChange).toHaveBeenCalledWith('apricot');
    });

    it('select with no valid highlighted option is no-op', () => {
      const comp = combobox({ options });
      const m0 = model({ open: true, highlighted: 0, filteredIndices: [] });
      const [m1] = comp.update({ type: 'select' }, m0);
      expect(m1).toBe(m0);
    });

    it('submit calls onSubmit with current inputBuffer', () => {
      const onSubmit = vi.fn();
      const comp = combobox({ options, onSubmit });
      const m0 = model({ inputBuffer: 'custom text', cursor: 11 });
      comp.update({ type: 'submit' }, m0);
      expect(onSubmit).toHaveBeenCalledWith('custom text');
    });

    it('submit with allowCustom=false rejects non-matching input', () => {
      const onSubmit = vi.fn();
      const comp = combobox({ options, allowCustom: false, onSubmit });
      const m0 = model({ inputBuffer: 'xyz', cursor: 3 });
      comp.update({ type: 'submit' }, m0);
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('submit with allowCustom=false allows matching label', () => {
      const onSubmit = vi.fn();
      const comp = combobox({ options, allowCustom: false, onSubmit });
      const m0 = model({ inputBuffer: 'Apple', cursor: 5 });
      comp.update({ type: 'submit' }, m0);
      expect(onSubmit).toHaveBeenCalledWith('Apple');
    });

    it('submit with allowCustom=false allows matching value', () => {
      const onSubmit = vi.fn();
      const comp = combobox({ options, allowCustom: false, onSubmit });
      const m0 = model({ inputBuffer: 'banana', cursor: 6 });
      comp.update({ type: 'submit' }, m0);
      expect(onSubmit).toHaveBeenCalledWith('banana');
    });

    it('close closes dropdown and resets highlighted', () => {
      const comp = combobox({ options });
      const m0 = model({ open: true, highlighted: 2 });
      const [m1] = comp.update({ type: 'close' }, m0);
      expect(m1.open).toBe(false);
      expect(m1.highlighted).toBe(0);
    });

    it('focus sets focused to true', () => {
      const comp = combobox({ options });
      const [m1] = comp.update({ type: 'focus' }, model());
      expect(m1.focused).toBe(true);
    });

    it('blur sets focused to false and closes dropdown', () => {
      const comp = combobox({ options });
      const m0 = model({ focused: true, open: true });
      const [m1] = comp.update({ type: 'blur' }, m0);
      expect(m1.focused).toBe(false);
      expect(m1.open).toBe(false);
    });
  });

  // ─── view ───────────────────────────────────────────────────────────────

  describe('view', () => {
    it('shows placeholder when empty and unfocused', () => {
      const comp = combobox({ options, placeholder: 'Search...' });
      const vnode = comp.view(model());
      expect(vnode.kind).toBe('event');
      expect(extractNodeText(vnode)).toBe('Search...');
    });

    it('shows default placeholder when none specified', () => {
      const comp = combobox({ options });
      const vnode = comp.view(model());
      expect(vnode.kind).toBe('event');
      expect(extractNodeText(vnode)).toBe('Type or select...');
    });

    it('shows input text when closed with value', () => {
      const comp = combobox({ options });
      const vnode = comp.view(model({ inputBuffer: 'Banana' }));
      expect(vnode.kind).toBe('event');
      expect(extractNodeText(vnode)).toBe('Banana');
    });

    it('shows cursor when focused with text', () => {
      const comp = combobox({ options });
      const vnode = comp.view(model({ inputBuffer: 'abc', cursor: 1, focused: true }));
      expect(vnode.kind).toBe('event');
      if (vnode.kind === 'event' && vnode.child.kind === 'row') {
        // before cursor, cursor char, after cursor
        expect(vnode.child.children.length).toBe(3);
        const before = vnode.child.children[0];
        const cursorChar = vnode.child.children[1];
        const after = vnode.child.children[2];
        if (before?.kind === 'text') expect(before.content).toBe('a');
        if (cursorChar?.kind === 'text') expect(cursorChar.content).toBe('b');
        if (after?.kind === 'text') expect(after.content).toBe('c');
      }
    });

    it('shows dropdown with filtered options when open', () => {
      const comp = combobox({ options });
      const m = model({
        inputBuffer: 'ap',
        cursor: 2,
        focused: true,
        open: true,
        highlighted: 0,
        filteredIndices: [0, 1], // Apple, Apricot
      });
      const vnode = comp.view(m);
      expect(vnode.kind).toBe('column');
      if (vnode.kind === 'column') {
        // First child is input display, rest are dropdown items
        expect(vnode.children.length).toBe(3); // input + 2 filtered options
        const first = vnode.children[1];
        const second = vnode.children[2];
        expect(first?.kind).toBe('event');
        expect(extractNodeText(first!)).toContain('Apple');
        expect(extractNodeText(first!)).toContain('▸');
        expect(second?.kind).toBe('event');
        expect(extractNodeText(second!)).toContain('Apricot');
      }
    });

    it('highlighted item is marked with ▸', () => {
      const comp = combobox({ options });
      const m = model({
        inputBuffer: 'a',
        cursor: 1,
        focused: true,
        open: true,
        highlighted: 1,
        filteredIndices: [0, 1],
      });
      const vnode = comp.view(m);
      if (vnode.kind === 'column') {
        const item0 = vnode.children[1];
        const item1 = vnode.children[2];
        expect(extractNodeText(item0!)).not.toContain('▸');
        expect(extractNodeText(item1!)).toContain('▸');
      }
    });

    it('returns just input display when open but no filtered options', () => {
      const comp = combobox({ options });
      const m = model({
        inputBuffer: 'zzz',
        cursor: 3,
        focused: true,
        open: false,
        filteredIndices: [],
      });
      const vnode = comp.view(m);
      // Should NOT be a column since no dropdown items
      expect(vnode.kind).not.toBe('column');
    });
  });

  // ─── subscriptions ──────────────────────────────────────────────────────

  describe('subscriptions', () => {
    it('keeps pointer subscriptions active when not focused', () => {
      const comp = combobox({ options });
      const sub = comp.subscriptions!(model({ focused: false }));
      expect(sub._kind.kind).toBe('elementMouse');
    });

    it('includes decoded key and paste subscriptions when focused', () => {
      const comp = combobox({ options });
      const sub = comp.subscriptions!(model({ focused: true }));
      expect(sub._kind.kind).toBe('batch');
      if (sub._kind.kind === 'batch') {
        expect(sub._kind.subs.map((s) => s._kind.kind)).toEqual(['elementMouse', 'keyEvent', 'paste']);
      }
    });

    it('routes navigation through the decoded key event subscription', () => {
      const comp = combobox({ options });
      const sub = comp.subscriptions!(model({ focused: true }));
      if (sub._kind.kind === 'batch') {
        expect(sub._kind.subs.some((s) => s._kind.kind === 'keyEvent')).toBe(true);
      }
    });

    it('uses the same key event stream while open', () => {
      const comp = combobox({ options });
      const sub = comp.subscriptions!(model({ focused: true, open: true }));
      if (sub._kind.kind === 'batch') {
        expect(sub._kind.subs.some((s) => s._kind.kind === 'keyEvent')).toBe(true);
      }
    });

    it('uses the same key event stream while closed', () => {
      const comp = combobox({ options });
      const sub = comp.subscriptions!(model({ focused: true, open: false }));
      if (sub._kind.kind === 'batch') {
        expect(sub._kind.subs.some((s) => s._kind.kind === 'keyEvent')).toBe(true);
      }
    });

    it('inserts pasted Unicode at the grapheme cursor', () => {
      const comp = combobox({ options });
      const [next] = comp.update({ type: 'paste', value: '界' }, model({ inputBuffer: 'AB', cursor: 1, focused: true }));
      expect(next.inputBuffer).toBe('A界B');
      expect(next.cursor).toBe(2);
    });
  });

  it('snapshots options and rejects invalid pointer indices', () => {
    const mutable = [{ label: 'Original', value: 'original' }];
    const comp = combobox({ options: mutable });
    mutable[0]!.label = 'Mutated';
    const [model] = comp.init();
    expect(model.filteredIndices).toEqual([0]);
    expect(comp.update({ type: 'select-at', index: Number.NaN }, { ...model, open: true })[0].open).toBe(true);
    expect(extractNodeText(comp.view({ ...model, open: true, focused: true }))).toContain('Original');
  });

  it('windows large filtered lists around the highlighted option', () => {
    const many = Array.from({ length: 100 }, (_, index) => ({ label: `Item ${index}`, value: String(index) }));
    const comp = combobox({ options: many, maxVisibleOptions: 5 });
    const view = comp.view({ ...comp.init()[0], open: true, focused: true, highlighted: 50 });
    if (view.kind === 'column') expect(view.children).toHaveLength(6);
  });
});
