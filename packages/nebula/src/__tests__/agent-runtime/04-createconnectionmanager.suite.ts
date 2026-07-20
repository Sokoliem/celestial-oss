import { describe, expect, it } from 'vitest';
import { createConnectionManager } from '../../agent-runtime.js';
import type { AgentEvent } from '../../agent-types.js';

// ─── createConnectionManager ────────────────────────────────────────────────

describe('createConnectionManager', () => {
  // The connection manager internally spawns real transports via createTransport.
  // We test the synchronous API surface and error paths that don't require
  // actually running the async connection loop.

  type WrappedMsg = { type: string; event: AgentEvent };

  describe('send error paths', () => {
    it('throws when sending to a non-existent agent', async () => {
      const manager = createConnectionManager<WrappedMsg>();
      await expect(manager.send('nonexistent', { role: 'user', content: 'hello' })).rejects.toThrow('No active agent connection for id "nonexistent"');
    });
  });

  describe('stop / stopAll on empty manager', () => {
    it('stop is a no-op for unknown ids', () => {
      const manager = createConnectionManager<WrappedMsg>();
      expect(() => manager.stop('unknown-id')).not.toThrow();
    });

    it('stopAll is a no-op with no connections', () => {
      const manager = createConnectionManager<WrappedMsg>();
      expect(() => manager.stopAll()).not.toThrow();
    });
  });

  describe('interface', () => {
    it('returns an object with start, stop, send, stopAll', () => {
      const manager = createConnectionManager<WrappedMsg>();
      expect(typeof manager.start).toBe('function');
      expect(typeof manager.stop).toBe('function');
      expect(typeof manager.send).toBe('function');
      expect(typeof manager.stopAll).toBe('function');
    });
  });
});
