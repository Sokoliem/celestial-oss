import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCapabilityRegistry } from '../registry.js';
import type { PolicySettings } from '../surface-policy.js';
import { createSurfacePolicy } from '../surface-policy.js';
import { createCapabilityWatcher } from '../watcher.js';

/** Flush all pending microtasks (Promise callbacks, async/await continuations). */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeProfile(overrides: Record<string, unknown> = {}) {
  return {
    'atlas.colorLevel': 'truecolor',
    'atlas.reducedMotion': false,
    'atlas.performanceClass': 'standard',
    ...overrides,
  };
}

// ─── evaluate() — pure rule evaluation without registry/watcher ───────────────

describe('createSurfacePolicy() — evaluate()', () => {
  it('returns empty settings when no rules match', () => {
    const policy = createSurfacePolicy([{ when: { 'atlas.reducedMotion': true }, apply: { animation: false } }]);
    const settings = policy.evaluate(makeProfile({ 'atlas.reducedMotion': false }));
    expect(settings).toEqual({});
  });

  it('matches a plain boolean equality condition', () => {
    const policy = createSurfacePolicy([{ when: { 'atlas.reducedMotion': true }, apply: { animation: false } }]);
    const settings = policy.evaluate(makeProfile({ 'atlas.reducedMotion': true }));
    expect(settings).toEqual({ animation: false });
  });

  it('matches a plain string equality condition', () => {
    const policy = createSurfacePolicy([{ when: { 'atlas.colorLevel': 'none' }, apply: { theme: 'mono' } }]);
    const settings = policy.evaluate(makeProfile({ 'atlas.colorLevel': 'none' }));
    expect(settings).toEqual({ theme: 'mono' });
  });

  it('matches colorLevel { lt } range condition', () => {
    const policy = createSurfacePolicy([{ when: { 'atlas.colorLevel': { lt: 'truecolor' } }, apply: { theme: 'mono' } }]);

    expect(policy.evaluate(makeProfile({ 'atlas.colorLevel': 'none' }))).toEqual({ theme: 'mono' });
    expect(policy.evaluate(makeProfile({ 'atlas.colorLevel': '16' }))).toEqual({ theme: 'mono' });
    expect(policy.evaluate(makeProfile({ 'atlas.colorLevel': '256' }))).toEqual({ theme: 'mono' });
    expect(policy.evaluate(makeProfile({ 'atlas.colorLevel': 'truecolor' }))).toEqual({});
  });

  it('matches colorLevel { lte } range condition', () => {
    const policy = createSurfacePolicy([{ when: { 'atlas.colorLevel': { lte: '256' } }, apply: { grayscale: true } }]);

    expect(policy.evaluate(makeProfile({ 'atlas.colorLevel': 'none' }))).toEqual({ grayscale: true });
    expect(policy.evaluate(makeProfile({ 'atlas.colorLevel': '256' }))).toEqual({ grayscale: true });
    expect(policy.evaluate(makeProfile({ 'atlas.colorLevel': 'truecolor' }))).toEqual({});
  });

  it('matches colorLevel { gte } range condition', () => {
    const policy = createSurfacePolicy([{ when: { 'atlas.colorLevel': { gte: '256' } }, apply: { richColors: true } }]);

    expect(policy.evaluate(makeProfile({ 'atlas.colorLevel': '256' }))).toEqual({ richColors: true });
    expect(policy.evaluate(makeProfile({ 'atlas.colorLevel': 'truecolor' }))).toEqual({ richColors: true });
    expect(policy.evaluate(makeProfile({ 'atlas.colorLevel': '16' }))).toEqual({});
  });

  it('matches colorLevel { gt } range condition', () => {
    const policy = createSurfacePolicy([{ when: { 'atlas.colorLevel': { gt: '16' } }, apply: { richColors: true } }]);

    expect(policy.evaluate(makeProfile({ 'atlas.colorLevel': '256' }))).toEqual({ richColors: true });
    expect(policy.evaluate(makeProfile({ 'atlas.colorLevel': '16' }))).toEqual({});
  });

  it('matches colorLevel { eq } range condition', () => {
    const policy = createSurfacePolicy([{ when: { 'atlas.colorLevel': { eq: 'truecolor' } }, apply: { full: true } }]);

    expect(policy.evaluate(makeProfile({ 'atlas.colorLevel': 'truecolor' }))).toEqual({ full: true });
    expect(policy.evaluate(makeProfile({ 'atlas.colorLevel': '256' }))).toEqual({});
  });

  it('matches a function predicate condition', () => {
    const policy = createSurfacePolicy([
      {
        when: { 'atlas.performanceClass': (v: unknown) => v === 'high' || v === 'standard' },
        apply: { fancy: true },
      },
    ]);

    expect(policy.evaluate(makeProfile({ 'atlas.performanceClass': 'high' }))).toEqual({ fancy: true });
    expect(policy.evaluate(makeProfile({ 'atlas.performanceClass': 'standard' }))).toEqual({ fancy: true });
    expect(policy.evaluate(makeProfile({ 'atlas.performanceClass': 'low' }))).toEqual({});
  });

  it('AND semantics: all when conditions must match', () => {
    const policy = createSurfacePolicy([
      {
        when: {
          'atlas.colorLevel': { lt: 'truecolor' },
          'atlas.reducedMotion': true,
        },
        apply: { minimal: true },
      },
    ]);

    // Both match
    expect(policy.evaluate(makeProfile({ 'atlas.colorLevel': 'none', 'atlas.reducedMotion': true }))).toEqual({ minimal: true });

    // Only one matches
    expect(policy.evaluate(makeProfile({ 'atlas.colorLevel': 'none', 'atlas.reducedMotion': false }))).toEqual({});
    expect(policy.evaluate(makeProfile({ 'atlas.colorLevel': 'truecolor', 'atlas.reducedMotion': true }))).toEqual({});
  });

  it('later rules override earlier rules for the same key', () => {
    const policy = createSurfacePolicy([
      { when: { 'atlas.colorLevel': { lt: 'truecolor' } }, apply: { theme: 'mono' } },
      { when: { 'atlas.colorLevel': { eq: 'none' } }, apply: { theme: 'ultra-mono' } },
    ]);

    // Both rules match for 'none' color level; second wins
    expect(policy.evaluate(makeProfile({ 'atlas.colorLevel': 'none' }))).toEqual({ theme: 'ultra-mono' });
    // Only first rule matches for '16'
    expect(policy.evaluate(makeProfile({ 'atlas.colorLevel': '16' }))).toEqual({ theme: 'mono' });
  });

  it('multiple then keys are merged', () => {
    const policy = createSurfacePolicy([
      { when: { 'atlas.reducedMotion': true }, apply: { animation: false } },
      { when: { 'atlas.colorLevel': { lt: 'truecolor' } }, apply: { theme: 'mono' } },
    ]);

    const settings = policy.evaluate(makeProfile({ 'atlas.reducedMotion': true, 'atlas.colorLevel': '16' }));
    expect(settings).toEqual({ animation: false, theme: 'mono' });
  });

  it('rules with no matching conditions return empty settings', () => {
    const policy = createSurfacePolicy([]);
    expect(policy.evaluate(makeProfile())).toEqual({});
  });

  it('current() returns the last evaluated settings', () => {
    const policy = createSurfacePolicy([{ when: { 'atlas.reducedMotion': true }, apply: { animation: false } }]);
    policy.evaluate(makeProfile({ 'atlas.reducedMotion': true }));
    expect(policy.current()).toEqual({ animation: false });
  });

  it('onChange fires when settings change', () => {
    const policy = createSurfacePolicy([{ when: { 'atlas.reducedMotion': true }, apply: { animation: false } }]);

    const received: PolicySettings[] = [];
    policy.onChange((s) => received.push(s));

    policy.evaluate(makeProfile({ 'atlas.reducedMotion': true }));
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ animation: false });
  });

  it('onChange does NOT fire when settings are unchanged', () => {
    const policy = createSurfacePolicy([{ when: { 'atlas.reducedMotion': true }, apply: { animation: false } }]);

    const received: PolicySettings[] = [];
    policy.onChange((s) => received.push(s));

    policy.evaluate(makeProfile({ 'atlas.reducedMotion': true }));
    policy.evaluate(makeProfile({ 'atlas.reducedMotion': true }));

    expect(received).toHaveLength(1);
  });

  it('onChange returns unsubscribe', () => {
    const policy = createSurfacePolicy([{ when: { 'atlas.reducedMotion': true }, apply: { animation: false } }]);

    const received: PolicySettings[] = [];
    const unsub = policy.onChange((s) => received.push(s));

    policy.evaluate(makeProfile({ 'atlas.reducedMotion': true }));
    unsub();
    policy.evaluate(makeProfile({ 'atlas.reducedMotion': false }));
    policy.evaluate(makeProfile({ 'atlas.reducedMotion': true }));

    // Only the first evaluation before unsub fires
    expect(received).toHaveLength(1);
  });

  it('onChange exception does not crash policy', () => {
    const policy = createSurfacePolicy([{ when: { 'atlas.reducedMotion': true }, apply: { animation: false } }]);
    policy.onChange(() => {
      throw new Error('crash');
    });
    expect(() => policy.evaluate(makeProfile({ 'atlas.reducedMotion': true }))).not.toThrow();
  });

  it('current() returns a copy, not the internal reference', () => {
    const policy = createSurfacePolicy([{ when: { 'atlas.reducedMotion': true }, apply: { animation: false } }]);
    policy.evaluate(makeProfile({ 'atlas.reducedMotion': true }));
    const s1 = policy.current();
    s1['animation'] = true; // mutate
    expect(policy.current()['animation']).toBe(false); // internal unchanged
  });
});

// ─── bind() — integration with registry + watcher ────────────────────────────

describe('createSurfacePolicy() — bind()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('evaluates on initial detectAll after bind', async () => {
    const registry = createCapabilityRegistry();
    registry.register({ id: 'atlas.colorLevel', detect: () => 'none', default: 'none' });

    const watcher = createCapabilityWatcher(registry, { pollMs: 0, listenTtyResize: false });
    const policy = createSurfacePolicy([{ when: { 'atlas.colorLevel': 'none' }, apply: { theme: 'mono' } }]);

    const received: PolicySettings[] = [];
    policy.onChange((s) => received.push(s));

    policy.bind(registry, watcher);
    await flushMicrotasks();

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ theme: 'mono' });
    vi.useRealTimers();
  });

  it('re-evaluates when watcher emits a change', async () => {
    const registry = createCapabilityRegistry();
    let colorLevel = 'truecolor';
    registry.register({ id: 'atlas.colorLevel', detect: () => colorLevel, default: 'none' });

    const watcher = createCapabilityWatcher(registry, { pollMs: 100, listenTtyResize: false });
    const policy = createSurfacePolicy([{ when: { 'atlas.colorLevel': { lt: 'truecolor' } }, apply: { theme: 'mono' } }]);

    const received: PolicySettings[] = [];
    policy.onChange((s) => received.push(s));

    watcher.start();
    await flushMicrotasks();

    policy.bind(registry, watcher);
    await flushMicrotasks();

    // Change color level and wait for a poll cycle
    colorLevel = 'none';
    await vi.advanceTimersByTimeAsync(150);
    await flushMicrotasks();

    watcher.stop();

    const monoSettings = received.find((s) => s['theme'] === 'mono');
    expect(monoSettings).toBeDefined();
    vi.useRealTimers();
  });

  it('bind returns unsubscribe that detaches from watcher', async () => {
    const registry = createCapabilityRegistry();
    let v = 0;
    registry.register({ id: 'v', detect: () => ++v, default: 0 });

    const watcher = createCapabilityWatcher(registry, { pollMs: 0, listenTtyResize: false });
    const policy = createSurfacePolicy([{ when: { v: (x: unknown) => (x as number) > 1 }, apply: { big: true } }]);

    const received: PolicySettings[] = [];
    policy.onChange((s) => received.push(s));

    const unbind = policy.bind(registry, watcher);
    await flushMicrotasks();

    unbind();

    // After unbind, watcher changes should no longer trigger policy evaluation
    const countAfterUnbind = received.length;
    await watcher.invalidate('v');
    await watcher.invalidate('v');
    await flushMicrotasks();

    expect(received.length).toBe(countAfterUnbind);
    vi.useRealTimers();
  });
});
