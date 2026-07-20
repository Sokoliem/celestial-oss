import { describe, expect, it } from 'vitest';
import { resolve } from '../../spinner/engine.js';
import { all } from '../../spinner/spinners.js';

describe('built-in spinners', () => {
  const spinnerNames = Object.keys(all);

  it('has at least 80 built-in spinners', () => {
    expect(spinnerNames.length).toBeGreaterThanOrEqual(80);
  });

  for (const name of spinnerNames) {
    describe(name, () => {
      it('has a valid name matching its key', () => {
        expect(all[name]!.name).toBe(name);
      });

      it('resolves without error', () => {
        expect(() => resolve(all[name]!)).not.toThrow();
      });

      it('produces non-empty frames', () => {
        const resolved = resolve(all[name]!);
        for (let i = 0; i < Math.min(10, resolved.length === Infinity ? 10 : resolved.length); i++) {
          const frame = resolved.frame(i);
          expect(typeof frame).toBe('string');
          expect(frame.length).toBeGreaterThan(0);
        }
      });

      it('has a positive interval', () => {
        const resolved = resolve(all[name]!);
        expect(resolved.interval).toBeGreaterThan(0);
      });
    });
  }
});

describe('spinner categories coverage', () => {
  it('includes classic spinners', () => {
    expect(all.line).toBeDefined();
    expect(all.star).toBeDefined();
    expect(all.pipe).toBeDefined();
  });

  it('includes braille spinners', () => {
    expect(all.dots).toBeDefined();
    expect(all.dots2).toBeDefined();
    expect(all.brailleWave).toBeDefined();
    expect(all.brailleSpiral).toBeDefined();
  });

  it('includes geometric spinners', () => {
    expect(all.circle).toBeDefined();
    expect(all.diamond).toBeDefined();
    expect(all.boxBounce).toBeDefined();
  });

  it('includes procedural spinners', () => {
    expect(all.matrix).toBeDefined();
    expect(all.matrix!.render).toBeDefined();
    expect(all.sineWave).toBeDefined();
    expect(all.sineWave!.render).toBeDefined();
    expect(all.glitch).toBeDefined();
    expect(all.glitch!.render).toBeDefined();
  });

  it('includes compound multi-character spinners', () => {
    expect(all.bouncingBall).toBeDefined();
    expect(all.material).toBeDefined();
    expect(all.pong).toBeDefined();
    expect(all.shark).toBeDefined();
  });
});
