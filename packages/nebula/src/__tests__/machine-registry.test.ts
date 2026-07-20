import { describe, expect, it, vi } from 'vitest';
import { createMachineRegistry, type MachineRegistryEntry } from '../machine-registry.js';

function mockEntry(overrides?: Partial<MachineRegistryEntry>): MachineRegistryEntry {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    send: vi.fn(),
    onTransition: vi.fn(() => () => {}),
    running: false,
    machineRef: {},
    ...overrides,
  };
}

describe('createMachineRegistry', () => {
  it('should create a registry with get, register, unregister, has methods', () => {
    const registry = createMachineRegistry();
    expect(registry.get).toBeTypeOf('function');
    expect(registry.register).toBeTypeOf('function');
    expect(registry.unregister).toBeTypeOf('function');
    expect(registry.has).toBeTypeOf('function');
  });

  it('should return undefined for unknown IDs', () => {
    const registry = createMachineRegistry();
    expect(registry.get('unknown')).toBeUndefined();
  });

  it('should register and retrieve an entry', () => {
    const registry = createMachineRegistry();
    const entry = mockEntry();
    registry.register('machine-1', entry);
    expect(registry.get('machine-1')).toBe(entry);
  });

  it('should report has correctly', () => {
    const registry = createMachineRegistry();
    expect(registry.has('machine-1')).toBe(false);
    registry.register('machine-1', mockEntry());
    expect(registry.has('machine-1')).toBe(true);
  });

  it('should overwrite an existing entry on re-register', () => {
    const registry = createMachineRegistry();
    const entry1 = mockEntry();
    const entry2 = mockEntry();
    registry.register('m', entry1);
    registry.register('m', entry2);
    expect(registry.get('m')).toBe(entry2);
  });

  it('should call stop() on unregister when entry is running', () => {
    const registry = createMachineRegistry();
    const stop = vi.fn();
    const entry = mockEntry({ running: true, stop });
    registry.register('m', entry);
    registry.unregister('m');
    expect(stop).toHaveBeenCalledOnce();
    expect(registry.has('m')).toBe(false);
  });

  it('should not call stop() on unregister when entry is not running', () => {
    const registry = createMachineRegistry();
    const stop = vi.fn();
    const entry = mockEntry({ running: false, stop });
    registry.register('m', entry);
    registry.unregister('m');
    expect(stop).not.toHaveBeenCalled();
    expect(registry.has('m')).toBe(false);
  });

  it('should be a no-op when unregistering an unknown ID', () => {
    const registry = createMachineRegistry();
    expect(() => registry.unregister('nonexistent')).not.toThrow();
  });

  it('should handle multiple entries independently', () => {
    const registry = createMachineRegistry();
    const e1 = mockEntry();
    const e2 = mockEntry();
    registry.register('a', e1);
    registry.register('b', e2);
    expect(registry.get('a')).toBe(e1);
    expect(registry.get('b')).toBe(e2);
    registry.unregister('a');
    expect(registry.has('a')).toBe(false);
    expect(registry.has('b')).toBe(true);
  });
});
