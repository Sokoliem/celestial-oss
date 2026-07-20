import { beforeEach, describe, expect, it } from 'vitest';
import type { CapabilityRegistry } from '../registry.js';
import { createCapabilityRegistry, getDefaultCapabilityRegistry } from '../registry.js';

describe('createCapabilityRegistry()', () => {
  let registry: CapabilityRegistry;

  beforeEach(() => {
    registry = createCapabilityRegistry();
  });

  it('starts empty', () => {
    expect(registry.ids()).toEqual([]);
  });

  it('registers a detector and lists its id', () => {
    registry.register({ id: 'foo', detect: () => 42, default: 0 });
    expect(registry.ids()).toContain('foo');
  });

  it('replaces an existing detector on re-registration', () => {
    registry.register({ id: 'foo', detect: () => 1, default: 0 });
    registry.register({ id: 'foo', detect: () => 2, default: 0 });
    expect(registry.ids().filter((id) => id === 'foo')).toHaveLength(1);
  });

  it('unregisters a detector', () => {
    registry.register({ id: 'foo', detect: () => 42, default: 0 });
    registry.unregister('foo');
    expect(registry.ids()).not.toContain('foo');
  });

  it('unregister is a no-op for unknown ids', () => {
    expect(() => registry.unregister('does-not-exist')).not.toThrow();
  });

  it('detectAll returns a profile keyed by id', async () => {
    registry.register({ id: 'a', detect: () => 1, default: 0 });
    registry.register({ id: 'b', detect: () => 'hello', default: '' });
    const profile = await registry.detectAll();
    expect(profile['a']).toBe(1);
    expect(profile['b']).toBe('hello');
  });

  it('detectAll uses default on sync throw', async () => {
    registry.register({
      id: 'boom',
      detect: () => {
        throw new Error('bang');
      },
      default: 'safe',
    });
    const profile = await registry.detectAll();
    expect(profile['boom']).toBe('safe');
  });

  it('detectAll uses default on async rejection', async () => {
    registry.register({
      id: 'async-boom',
      detect: async () => {
        throw new Error('bang');
      },
      default: 99,
    });
    const profile = await registry.detectAll();
    expect(profile['async-boom']).toBe(99);
  });

  it('detectAll forwards env to detectors', async () => {
    const captured: NodeJS.ProcessEnv[] = [];
    registry.register({
      id: 'env-spy',
      detect: (env) => {
        captured.push(env);
        return true;
      },
      default: false,
    });
    const env = { CUSTOM_VAR: '1' };
    await registry.detectAll({ env });
    expect(captured[0]).toBe(env);
  });

  it('detect runs a single detector by id', async () => {
    registry.register({ id: 'single', detect: () => 'value', default: '' });
    const result = await registry.detect('single');
    expect(result).toBe('value');
  });

  it('detect returns undefined for unknown id', async () => {
    const result = await registry.detect('unknown');
    expect(result).toBeUndefined();
  });

  it('detect returns default on error', async () => {
    registry.register({
      id: 'err',
      detect: () => {
        throw new Error();
      },
      default: 'fallback',
    });
    const result = await registry.detect('err');
    expect(result).toBe('fallback');
  });

  it('getDefault returns the registered default', () => {
    registry.register({ id: 'x', detect: () => true, default: false });
    expect(registry.getDefault('x')).toBe(false);
  });

  it('getDefault returns undefined for unknown id', () => {
    expect(registry.getDefault('unknown')).toBeUndefined();
  });

  it('async detectors are supported', async () => {
    registry.register({
      id: 'async',
      detect: async () => Promise.resolve(42),
      default: 0,
    });
    const profile = await registry.detectAll();
    expect(profile['async']).toBe(42);
  });

  it('preserves insertion order in ids()', () => {
    registry.register({ id: 'c', detect: () => 1, default: 0 });
    registry.register({ id: 'a', detect: () => 2, default: 0 });
    registry.register({ id: 'b', detect: () => 3, default: 0 });
    expect(registry.ids()).toEqual(['c', 'a', 'b']);
  });
});

describe('getDefaultCapabilityRegistry()', () => {
  it('returns the same instance on multiple calls', () => {
    const r1 = getDefaultCapabilityRegistry();
    const r2 = getDefaultCapabilityRegistry();
    expect(r1).toBe(r2);
  });

  it('has built-in atlas detectors registered', () => {
    const r = getDefaultCapabilityRegistry();
    expect(r.ids()).toContain('atlas.colorLevel');
    expect(r.ids()).toContain('atlas.reducedMotion');
    expect(r.ids()).toContain('atlas.unicodeLevel');
  });

  it('detectAll resolves built-in atlas.colorLevel', async () => {
    const r = getDefaultCapabilityRegistry();
    const profile = await r.detectAll({ env: { FORCE_COLOR: '3' } });
    expect(profile['atlas.colorLevel']).toBe('truecolor');
  });
});
