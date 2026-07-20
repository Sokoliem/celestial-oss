// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { localState, text } from '../../elements.js';

// ─── localState() ──────────────────────────────────────────────────────────

describe('localState() builder', () => {
  it('should create a LocalStateNode with key, init, reducer, view', () => {
    const init = () => 0;
    const reducer = (s: number, a: number) => s + a;
    const view = (s: number, _dispatch: (a: number) => void) => text(`count: ${s}`);
    const node = localState('counter', init, reducer, view);
    expect(node.kind).toBe('localState');
    expect(node.key).toBe('counter');
    expect(node.init).toBe(init);
    expect(node.reducer).toBe(reducer);
    expect(node.view).toBe(view);
  });
});
