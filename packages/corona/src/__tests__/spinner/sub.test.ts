/**
 * Tests for the Elm-architecture spinner subscription integration.
 *
 * These tests verify that spinnerSub produces correct Sub data structures
 * and properly integrates with the spinner engine. The Sub.stream factory
 * is imported from @celestial/nebula, which is a peer dependency.
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { registerAll } from '../../spinner/engine.js';
import * as spinners from '../../spinner/spinners.js';
import { type SpinnerFrame, spinnerSub } from '../../spinner/sub.js';

// Ensure built-in spinners are registered before tests run.
beforeAll(() => {
  registerAll(Object.fromEntries(Object.entries(spinners).map(([key, def]) => [def.name ?? key, def])));
});

describe('spinnerSub', () => {
  it('returns a Sub with stream kind', () => {
    const sub = spinnerSub('dots', (frame: SpinnerFrame) => ({ type: 'SPIN', frame }));
    expect(sub).toBeDefined();
    expect((sub as any)._tag).toBe('sub');
    expect((sub as any)._kind.kind).toBe('stream');
  });

  it('uses the spinner name in the stream id', () => {
    const sub = spinnerSub('dots', (frame: SpinnerFrame) => frame);
    expect((sub as any)._kind.id).toBe('corona-spinner:dots');
  });

  it('throws for unknown spinner name', () => {
    expect(() => spinnerSub('nonexistent', (f: SpinnerFrame) => f)).toThrow('Unknown spinner: "nonexistent"');
  });

  it('maps frame data through toMsg', () => {
    const sub = spinnerSub('dots', (frame: SpinnerFrame) => ({
      type: 'TICK' as const,
      ...frame,
    }));
    const kind = (sub as any)._kind;
    const result = kind.toMsg({ text: '⠋', elapsed: 80 });
    expect(result).toEqual({ type: 'TICK', text: '⠋', elapsed: 80 });
  });

  it('accepts custom interval override', () => {
    // The sub itself is just data — the interval is baked into the setup closure.
    // We verify the sub is created without error.
    const sub = spinnerSub('dots', (f: SpinnerFrame) => f, 200);
    expect(sub).toBeDefined();
    expect((sub as any)._tag).toBe('sub');
  });

  it('setup produces a StreamSource with onData and teardown', () => {
    const sub = spinnerSub('line', (f: SpinnerFrame) => f);
    const setup = (sub as any)._kind.setup;
    expect(typeof setup).toBe('function');

    const source = setup();
    expect(typeof source.onData).toBe('function');
    expect(typeof source.teardown).toBe('function');
  });

  it('StreamSource emits SpinnerFrame shaped data', () => {
    vi.useFakeTimers();
    try {
      const sub = spinnerSub('line', (f: SpinnerFrame) => f, 100);
      const source = (sub as any)._kind.setup();

      const frames: unknown[] = [];
      source.onData((data: unknown) => frames.push(data));

      // Advance past two intervals
      vi.advanceTimersByTime(250);

      expect(frames.length).toBe(2);
      for (const frame of frames) {
        const f = frame as SpinnerFrame;
        expect(typeof f.text).toBe('string');
        expect(typeof f.elapsed).toBe('number');
        expect(f.elapsed).toBeGreaterThan(0);
      }

      source.teardown();
    } finally {
      vi.useRealTimers();
    }
  });

  it('teardown stops interval emissions', () => {
    vi.useFakeTimers();
    try {
      const sub = spinnerSub('line', (f: SpinnerFrame) => f, 100);
      const source = (sub as any)._kind.setup();

      const frames: unknown[] = [];
      source.onData((data: unknown) => frames.push(data));

      vi.advanceTimersByTime(100);
      expect(frames.length).toBe(1);

      source.teardown();

      // After teardown, no more frames should be emitted
      vi.advanceTimersByTime(500);
      expect(frames.length).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('elapsed accumulates correctly across frames', () => {
    vi.useFakeTimers();
    try {
      const sub = spinnerSub('dots', (f: SpinnerFrame) => f, 80);
      const source = (sub as any)._kind.setup();

      const frames: SpinnerFrame[] = [];
      source.onData((data: unknown) => frames.push(data as SpinnerFrame));

      vi.advanceTimersByTime(240);

      expect(frames.length).toBe(3);
      expect(frames[0]!.elapsed).toBe(80);
      expect(frames[1]!.elapsed).toBe(160);
      expect(frames[2]!.elapsed).toBe(240);

      source.teardown();
    } finally {
      vi.useRealTimers();
    }
  });
});
