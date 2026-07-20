import { describe, expect, it } from 'vitest';
import { setIconAndTitle, setTabColor, setWindowTitle } from '../window-title.js';

describe('setWindowTitle', () => {
  it('emits OSC 2 wrapped with BEL (AC-8.1)', () => {
    expect(setWindowTitle('Claude: Compacting…')).toBe('\x1b]2;Claude: Compacting…\x07');
  });

  it('sanitizes embedded ESC / BEL / ST so titles cannot inject', () => {
    const hostile = 'safe\x1b]2;evil\x07\x9cmore';
    expect(setWindowTitle(hostile)).toBe('\x1b]2;safe]2;evilmore\x07');
  });

  it('handles empty', () => {
    expect(setWindowTitle('')).toBe('\x1b]2;\x07');
  });
});

describe('setIconAndTitle', () => {
  it('emits OSC 0', () => {
    expect(setIconAndTitle('hello')).toBe('\x1b]0;hello\x07');
  });
});

describe('setTabColor', () => {
  it('emits OSC 6 iTerm2 form by default', () => {
    expect(setTabColor('#ff8800')).toBe('\x1b]6;1;preset;#ff8800\x07');
  });

  it('emits OSC 30 on Windows Terminal', () => {
    expect(setTabColor('#ff8800', { terminalName: 'windows-terminal' })).toBe('\x1b]30;#ff8800\x07');
  });

  it('emits OSC 6 reset on null', () => {
    expect(setTabColor(null)).toBe('\x1b]6;;\x07');
  });

  it('sanitizes hostile colors', () => {
    expect(setTabColor('red\x1b]7;evil\x07')).toBe('\x1b]6;1;preset;red]7;evil\x07');
  });
});
