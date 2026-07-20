import { describe, expect, it } from 'vitest';
import { syncOutputBegin, syncOutputEnd, withSyncOutput } from '../sync-output.js';

describe('sync-output', () => {
  it('emits correct enable/disable constants', () => {
    expect(syncOutputBegin).toBe('\x1b[?2026h');
    expect(syncOutputEnd).toBe('\x1b[?2026l');
  });

  it('wraps frame when caps.synchronizedOutput true (AC-6.1)', () => {
    expect(withSyncOutput({ synchronizedOutput: true }, 'frame')).toBe('\x1b[?2026hframe\x1b[?2026l');
  });

  it('returns frame unwrapped when false (AC-6.2)', () => {
    expect(withSyncOutput({ synchronizedOutput: false }, 'frame')).toBe('frame');
  });

  it('handles empty frames', () => {
    expect(withSyncOutput({ synchronizedOutput: true }, '')).toBe('\x1b[?2026h\x1b[?2026l');
  });
});
