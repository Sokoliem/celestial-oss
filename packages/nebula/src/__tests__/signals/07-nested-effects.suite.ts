// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { effect, signal } from '../../signals.js';

describe('nested effects', () => {
  it('should dispose inner effect when outer re-runs', () => {
    const [outer, setOuter] = signal(0);
    const [inner, setInner] = signal(0);
    const log: string[] = [];

    const dispose = effect(() => {
      const outerVal = outer();
      effect(() => {
        log.push(`outer=${outerVal},inner=${inner()}`);
      });
    });

    expect(log).toEqual(['outer=0,inner=0']);

    // Changing inner signal triggers inner effect
    setInner(1);
    expect(log).toEqual(['outer=0,inner=0', 'outer=0,inner=1']);

    // Changing outer signal should dispose inner effect and create new one
    setOuter(1);
    // The outer re-runs, creating a new inner effect
    expect(log).toEqual(['outer=0,inner=0', 'outer=0,inner=1', 'outer=1,inner=1']);

    // Changing inner again should only trigger the NEW inner effect
    setInner(2);
    expect(log).toEqual(['outer=0,inner=0', 'outer=0,inner=1', 'outer=1,inner=1', 'outer=1,inner=2']);

    dispose();

    // After dispose, nothing should trigger
    setInner(3);
    setOuter(2);
    expect(log).toEqual(['outer=0,inner=0', 'outer=0,inner=1', 'outer=1,inner=1', 'outer=1,inner=2']);
  });
});
