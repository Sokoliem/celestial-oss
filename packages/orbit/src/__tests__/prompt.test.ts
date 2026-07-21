import { describe, expect, it } from 'vitest';
import {
  confirmResult,
  createConfirmState,
  createInputState,
  createMultiSelectState,
  createSelectState,
  multiSelectResults,
  updateConfirmState,
  updateInputState,
  updateMultiSelectState,
  updateSelectState,
} from '../prompt.js';

describe('InputState', () => {
  it('initial state has empty value', () => {
    const state = createInputState();
    expect(state.value).toBe('');
    expect(state.done).toBe(false);
  });

  it('initial state uses default value', () => {
    const state = createInputState('default');
    expect(state.value).toBe('default');
  });

  it('appends characters', () => {
    let state = createInputState();
    state = updateInputState(state, 'h');
    state = updateInputState(state, 'i');
    expect(state.value).toBe('hi');
    expect(state.done).toBe(false);
  });

  it('handles backspace', () => {
    let state = createInputState('hello');
    state = updateInputState(state, 'backspace');
    expect(state.value).toBe('hell');
  });

  it('removes a whole extended grapheme on backspace', () => {
    const state = updateInputState(createInputState(`A👩‍🚀`), 'backspace');
    expect(state.value).toBe('A');
  });

  it('handles enter (marks as done)', () => {
    let state = createInputState('test');
    state = updateInputState(state, 'return');
    expect(state.done).toBe(true);
    expect(state.value).toBe('test');
  });

  it('ignores input after done', () => {
    let state = createInputState('test');
    state = updateInputState(state, 'return');
    state = updateInputState(state, 'x');
    expect(state.value).toBe('test');
  });
});

describe('ConfirmState', () => {
  it('default value applied', () => {
    const state = createConfirmState(true);
    expect(state.defaultValue).toBe(true);
    expect(state.value).toBeNull();
  });

  it('y confirms as true', () => {
    let state = createConfirmState();
    state = updateConfirmState(state, 'y');
    expect(state.done).toBe(true);
    expect(confirmResult(state)).toBe(true);
  });

  it('n confirms as false', () => {
    let state = createConfirmState();
    state = updateConfirmState(state, 'n');
    expect(state.done).toBe(true);
    expect(confirmResult(state)).toBe(false);
  });

  it('enter uses default value', () => {
    let state = createConfirmState(true);
    state = updateConfirmState(state, 'return');
    expect(state.done).toBe(true);
    expect(confirmResult(state)).toBe(true);
  });
});

describe('SelectState', () => {
  const options = ['Apple', 'Banana', 'Cherry'];

  it('initial highlight at 0', () => {
    const state = createSelectState(options);
    expect(state.highlighted).toBe(0);
    expect(state.done).toBe(false);
  });

  it('down moves highlight', () => {
    let state = createSelectState(options);
    state = updateSelectState(state, 'down');
    expect(state.highlighted).toBe(1);
    state = updateSelectState(state, 'down');
    expect(state.highlighted).toBe(2);
  });

  it('up moves highlight', () => {
    let state = createSelectState(options);
    state = updateSelectState(state, 'down');
    state = updateSelectState(state, 'down');
    state = updateSelectState(state, 'up');
    expect(state.highlighted).toBe(1);
  });

  it('does not go below 0', () => {
    let state = createSelectState(options);
    state = updateSelectState(state, 'up');
    expect(state.highlighted).toBe(0);
  });

  it('does not go beyond last', () => {
    let state = createSelectState(options);
    state = updateSelectState(state, 'down');
    state = updateSelectState(state, 'down');
    state = updateSelectState(state, 'down');
    expect(state.highlighted).toBe(2);
  });

  it('enter selects current', () => {
    let state = createSelectState(options);
    state = updateSelectState(state, 'down');
    state = updateSelectState(state, 'return');
    expect(state.done).toBe(true);
    expect(state.selected).toBe('Banana');
  });

  it('works with object options', () => {
    const objOptions = [
      { label: 'Apple', value: 'a' },
      { label: 'Banana', value: 'b' },
    ];
    let state = createSelectState(objOptions);
    state = updateSelectState(state, 'down');
    state = updateSelectState(state, 'return');
    expect(state.selected).toBe('b');
  });

  it('snapshots option objects and keeps empty lists stable', () => {
    const mutable = [{ label: 'Original', value: 'original' }];
    const state = createSelectState(mutable);
    mutable[0]!.label = 'Changed';
    mutable.push({ label: 'Injected', value: 'injected' });
    expect(state.options).toEqual([{ label: 'Original', value: 'original' }]);

    const empty = updateSelectState(createSelectState([]), 'down');
    expect(empty.highlighted).toBe(0);
    expect(updateSelectState(empty, 'return')).toBe(empty);
  });
});

describe('MultiSelectState', () => {
  const options = ['Red', 'Green', 'Blue'];

  it('nothing selected initially', () => {
    const state = createMultiSelectState(options);
    expect(state.selected.size).toBe(0);
    expect(state.highlighted).toBe(0);
  });

  it('space toggles selection on', () => {
    let state = createMultiSelectState(options);
    state = updateMultiSelectState(state, 'space');
    expect(state.selected.has(0)).toBe(true);
  });

  it('space toggles selection off', () => {
    let state = createMultiSelectState(options);
    state = updateMultiSelectState(state, 'space');
    state = updateMultiSelectState(state, 'space');
    expect(state.selected.has(0)).toBe(false);
  });

  it('can select multiple items', () => {
    let state = createMultiSelectState(options);
    state = updateMultiSelectState(state, 'space'); // select 0
    state = updateMultiSelectState(state, 'down');
    state = updateMultiSelectState(state, 'down');
    state = updateMultiSelectState(state, 'space'); // select 2
    expect(state.selected.has(0)).toBe(true);
    expect(state.selected.has(2)).toBe(true);
    expect(state.selected.has(1)).toBe(false);
  });

  it('enter confirms selection', () => {
    let state = createMultiSelectState(options);
    state = updateMultiSelectState(state, 'space');
    state = updateMultiSelectState(state, 'return');
    expect(state.done).toBe(true);
    expect(multiSelectResults(state)).toEqual(['Red']);
  });

  it('multiSelectResults returns values in order', () => {
    let state = createMultiSelectState(options);
    state = updateMultiSelectState(state, 'down');
    state = updateMultiSelectState(state, 'down');
    state = updateMultiSelectState(state, 'space'); // select 2
    state = updateMultiSelectState(state, 'up');
    state = updateMultiSelectState(state, 'up');
    state = updateMultiSelectState(state, 'space'); // select 0
    state = updateMultiSelectState(state, 'return');
    expect(multiSelectResults(state)).toEqual(['Red', 'Blue']);
  });

  it('ignores empty and corrupted selections safely', () => {
    const empty = createMultiSelectState([]);
    expect(updateMultiSelectState(empty, 'down').highlighted).toBe(0);
    expect(updateMultiSelectState(empty, 'space')).toBe(empty);

    const state = createMultiSelectState(options);
    expect(multiSelectResults({ ...state, selected: new Set([0, -1, Number.NaN, 99]) })).toEqual(['Red']);
  });
});
