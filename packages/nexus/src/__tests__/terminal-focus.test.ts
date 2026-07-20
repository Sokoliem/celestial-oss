import { describe, expect, it } from 'vitest';
import { parseTerminalFocusEvent, terminalFocusDisable, terminalFocusEnable } from '../terminal-focus.js';

describe('terminalFocusEnable / terminalFocusDisable', () => {
  it('emits CSI ?1004h to enable', () => {
    expect(terminalFocusEnable).toBe('\x1b[?1004h');
  });

  it('emits CSI ?1004l to disable', () => {
    expect(terminalFocusDisable).toBe('\x1b[?1004l');
  });
});

describe('parseTerminalFocusEvent', () => {
  it('parses focus-in (AC-5.1)', () => {
    expect(parseTerminalFocusEvent('\x1b[I')).toEqual({ type: 'focus-in' });
  });

  it('parses focus-out (AC-5.2)', () => {
    expect(parseTerminalFocusEvent('\x1b[O')).toEqual({ type: 'focus-out' });
  });

  it('returns null for unrelated input (AC-5.3)', () => {
    expect(parseTerminalFocusEvent('')).toBeNull();
    expect(parseTerminalFocusEvent('not-a-sequence')).toBeNull();
    expect(parseTerminalFocusEvent('\x1b[<0;1;1M')).toBeNull();
    expect(parseTerminalFocusEvent('\x1b[?1004h')).toBeNull();
  });
});
