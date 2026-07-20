import { describe, expect, it } from 'vitest';
import { fieldArray } from '../field-array.js';
import { dragKeyToMoveMsg, dropToMoveMsg, swapMsg } from '../field-array-view.js';

describe('dropToMoveMsg', () => {
  it('produces a field-array:move msg', () => {
    expect(dropToMoveMsg(0, 3)).toEqual({ type: 'field-array:move', from: 0, to: 3 });
  });

  it('returns null when from === to', () => {
    expect(dropToMoveMsg(2, 2)).toBeNull();
  });

  it('returns null for negative indices', () => {
    expect(dropToMoveMsg(-1, 0)).toBeNull();
    expect(dropToMoveMsg(0, -1)).toBeNull();
  });
});

describe('dragKeyToMoveMsg', () => {
  it('translates stable keys into move msgs', () => {
    const ctor = fieldArray<{ value: string }, never>({
      createItem: () => [{ value: 'x' }, { _tag: 'cmd', _kind: { kind: 'none' } } as never],
      minItems: 3,
    });
    let [model] = ctor.init();
    // Initial keys: [0, 1, 2]
    const move = dragKeyToMoveMsg<{ value: string }, never>(model, 0, 2);
    expect(move).toEqual({ type: 'field-array:move', from: 0, to: 2 });

    [model] = ctor.update({ type: 'field-array:move', from: 0, to: 2 }, model);
    // After move keys → [1, 2, 0]
    const moveBack = dragKeyToMoveMsg<{ value: string }, never>(model, 0, 1);
    expect(moveBack).toEqual({ type: 'field-array:move', from: 2, to: 0 });
  });

  it('returns null for unknown keys', () => {
    const ctor = fieldArray<{ value: string }, never>({
      createItem: () => [{ value: 'x' }, { _tag: 'cmd', _kind: { kind: 'none' } } as never],
      minItems: 1,
    });
    const [model] = ctor.init();
    expect(dragKeyToMoveMsg(model, 999, 0)).toBeNull();
    expect(dragKeyToMoveMsg(model, 0, 999)).toBeNull();
  });
});

describe('swapMsg', () => {
  it('emits a swap message for valid indices', () => {
    expect(swapMsg(0, 1)).toEqual({ type: 'field-array:swap', indexA: 0, indexB: 1 });
  });

  it('returns null for self-swap or negative indices', () => {
    expect(swapMsg(0, 0)).toBeNull();
    expect(swapMsg(-1, 0)).toBeNull();
    expect(swapMsg(0, -1)).toBeNull();
  });
});
