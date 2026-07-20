// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { createSignalContext } from '../../signals.js';

describe('createSignalContext', () => {
  it('should accept configurable maxIterations', () => {
    const ctx = createSignalContext({ maxIterations: 5 });
    const [val, setVal] = ctx.signal(0);

    // Create an effect that triggers itself to exceed the limit
    expect(() => {
      ctx.effect(() => {
        const v = val();
        if (v < 100) setVal(v + 1);
      });
    }).toThrow(/infinite loop/);
  });

  it('should include diagnostics in infinite loop error message', () => {
    const ctx = createSignalContext({ maxIterations: 3 });
    const [val, setVal] = ctx.signal(0);

    // Effect that always writes to a signal it reads → infinite loop
    expect(() => {
      ctx.effect(() => {
        setVal(val() + 1);
      });
    }).toThrow(/iterations.*effects still pending.*circular signal writes/);
  });
});
