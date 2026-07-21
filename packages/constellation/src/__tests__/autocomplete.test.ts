import { extractNodeText } from '@celestial/nebula';
import { describe, expect, it, vi } from 'vitest';
import { autocomplete } from '../autocomplete.js';

const fruits = ['apple', 'apricot', 'banana', 'blueberry', 'cherry'];
const source = (query: string) => fruits.filter((f) => f.startsWith(query.toLowerCase()));

describe('autocomplete', () => {
  it('init starts with empty query and no suggestions visible', () => {
    const comp = autocomplete({ source });
    const [model] = comp.init();
    expect(model.query).toBe('');
    expect(model.suggestions).toEqual([]);
    expect(model.highlighted).toBe(0);
    expect(model.open).toBe(false);
  });

  it('char input appends to query', () => {
    const comp = autocomplete({ source });
    const [model] = comp.init();
    const [m1] = comp.update({ type: 'input', char: 'a' }, model);
    expect(m1.query).toBe('a');
    const [m2] = comp.update({ type: 'input', char: 'p' }, m1);
    expect(m2.query).toBe('ap');
  });

  it('backspace removes last character', () => {
    const comp = autocomplete({ source });
    const model = { query: 'app', suggestions: ['apple'], highlighted: 0, open: true };
    const [updated] = comp.update({ type: 'backspace' }, model);
    expect(updated.query).toBe('ap');
  });

  it('source filtering returns matching items', () => {
    const comp = autocomplete({ source });
    const [model] = comp.init();
    const [m1] = comp.update({ type: 'input', char: 'b' }, model);
    expect(m1.suggestions).toEqual(['banana', 'blueberry']);
    expect(m1.open).toBe(true);
  });

  it('up/down navigation in suggestion list wraps', () => {
    const comp = autocomplete({ source });
    const model = { query: 'a', suggestions: ['apple', 'apricot'], highlighted: 0, open: true };
    // Down wraps from last to first
    const [m1] = comp.update({ type: 'down' }, model);
    expect(m1.highlighted).toBe(1);
    const [m2] = comp.update({ type: 'down' }, m1);
    expect(m2.highlighted).toBe(0); // wraps
    // Up wraps from first to last
    const [m3] = comp.update({ type: 'up' }, model);
    expect(m3.highlighted).toBe(1); // wraps to end
  });

  it('select suggestion calls onChange with selected value', () => {
    const onChange = vi.fn();
    const comp = autocomplete({ source, onChange });
    const model = { query: 'a', suggestions: ['apple', 'apricot'], highlighted: 1, open: true };
    const [updated] = comp.update({ type: 'select' }, model);
    expect(updated.query).toBe('apricot');
    expect(updated.open).toBe(false);
    expect(onChange).toHaveBeenCalledWith('apricot');
  });

  it('escape closes suggestions', () => {
    const comp = autocomplete({ source });
    const model = { query: 'a', suggestions: ['apple', 'apricot'], highlighted: 0, open: true };
    const [updated] = comp.update({ type: 'close' }, model);
    expect(updated.open).toBe(false);
  });

  it('subscribes to decoded key events and bracketed paste while focused', () => {
    const comp = autocomplete({ source });
    const [model] = comp.init();
    const sub = comp.subscriptions!({ ...model, focused: true });
    expect(sub._kind.kind).toBe('batch');
    if (sub._kind.kind === 'batch') {
      expect(sub._kind.subs.map((s) => s._kind.kind)).toEqual(['elementMouse', 'keyEvent', 'paste']);
    }
  });

  it('decoded key subscriptions preserve Unicode characters', () => {
    const comp = autocomplete({ source });
    const [model] = comp.init();
    const sub = comp.subscriptions!({ ...model, focused: true });
    expect(sub._kind.kind).toBe('batch');
    if (sub._kind.kind === 'batch') {
      const keySub = sub._kind.subs.find((s) => s._kind.kind === 'keyEvent');
      expect(keySub?._kind.kind).toBe('keyEvent');
      if (keySub?._kind.kind === 'keyEvent') {
        expect(keySub._kind.toMsg({ key: '界', char: '界', ctrl: false, alt: false, shift: false })).toEqual({
          type: 'key',
          event: { key: '界', char: '界', ctrl: false, alt: false, shift: false },
        });
      }
    }
  });

  it('backspace removes one extended grapheme instead of part of it', () => {
    const comp = autocomplete({ source: () => [] });
    const model = { query: `go👩‍🚀`, suggestions: [], highlighted: 0, open: false };
    expect(comp.update({ type: 'backspace' }, model)[0].query).toBe('go');
  });

  it('view renders input and suggestion list when open', () => {
    const comp = autocomplete({ source });
    const model = { query: 'a', suggestions: ['apple', 'apricot'], highlighted: 0, open: true };
    const vnode = comp.view(model);
    expect(vnode.kind).toBe('column');
    if (vnode.kind === 'column') {
      // First child is the input display (row with query text), rest are suggestions
      expect(vnode.children.length).toBe(3); // display + 2 suggestions
      const suggestion = vnode.children[1];
      expect(suggestion?.kind).toBe('event');
      expect(extractNodeText(suggestion!)).toContain('apple');
      expect(extractNodeText(suggestion!)).toContain('▸');
    }
  });

  it('does not capture keyboard input until its pointer target is focused', () => {
    const comp = autocomplete({ source });
    const [model] = comp.init();
    expect(comp.subscriptions!(model)._kind.kind).toBe('elementMouse');
    expect(comp.update({ type: 'focus' }, model)[0].focused).toBe(true);
  });

  it('bounds source results and invalid pointer indices', () => {
    const comp = autocomplete({ source: () => Array.from({ length: 100 }, (_, index) => `Item ${index}`), maxSuggestions: 5 });
    const [model] = comp.update({ type: 'input', char: 'x' }, comp.init()[0]);
    const view = comp.view({ ...model, focused: true });
    if (view.kind === 'column') expect(view.children).toHaveLength(6);
    expect(comp.update({ type: 'select-at', index: Number.NaN }, model)[0].query).toBe('x');
  });
});
