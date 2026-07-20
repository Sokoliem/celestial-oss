import { afterEach, describe, expect, it, vi } from 'vitest';
import { pinCapabilities, unpinCapabilities } from '../detect.js';
import { detectCapabilities, getCapabilities, resetCapabilitiesCache } from '../index.js';

afterEach(() => {
  vi.useRealTimers();
  resetCapabilitiesCache();
  unpinCapabilities();
});

describe('basic caching', () => {
  it('returns same reference on repeated calls', () => {
    const a = getCapabilities('terminal');
    const b = getCapabilities('terminal');
    expect(a).toBe(b);
  });

  it('caches per surface independently', () => {
    const terminal = getCapabilities('terminal');
    const test = getCapabilities('test');
    expect(terminal).not.toBe(test);
    expect(terminal.surface).toBe('terminal');
    expect(test.surface).toBe('test');
  });

  it('resetCapabilitiesCache forces re-detection', () => {
    const a = getCapabilities('terminal');
    resetCapabilitiesCache();
    const b = getCapabilities('terminal');
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

describe('TTL expiration', () => {
  it('returns cached result before TTL expires', () => {
    vi.useFakeTimers();
    const a = getCapabilities('terminal', { ttl: 1000 });
    vi.advanceTimersByTime(999);
    const b = getCapabilities('terminal', { ttl: 1000 });
    expect(a).toBe(b);
  });

  it('re-detects after TTL expires', () => {
    vi.useFakeTimers();
    const a = getCapabilities('terminal', { ttl: 1000 });
    vi.advanceTimersByTime(1001);
    const b = getCapabilities('terminal', { ttl: 1000 });
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it('uses default TTL when not specified', () => {
    vi.useFakeTimers();
    const a = getCapabilities('terminal');
    vi.advanceTimersByTime(29_999);
    const b = getCapabilities('terminal');
    expect(a).toBe(b);

    vi.advanceTimersByTime(2);
    const c = getCapabilities('terminal');
    expect(a).not.toBe(c);
  });
});

describe('pinning interaction with cache', () => {
  it('pinned capabilities override cached values', () => {
    const before = getCapabilities('terminal');
    const override = before.colorLevel === 'none' ? '16' : 'none';
    pinCapabilities({ colorLevel: override });
    const after = getCapabilities('terminal');
    expect(after.colorLevel).toBe(override);
    expect(before.colorLevel).not.toBe(override);
  });

  it('unpinning restores detection', () => {
    const original = detectCapabilities();
    pinCapabilities({ colorLevel: 'none' });
    expect(getCapabilities('terminal').colorLevel).toBe('none');
    unpinCapabilities();
    expect(getCapabilities('terminal').colorLevel).toBe(original.colorLevel);
  });
});
