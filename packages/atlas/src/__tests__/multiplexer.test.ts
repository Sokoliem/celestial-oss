import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyMultiplexerDowngrades, detectMultiplexer } from '../multiplexer.js';
import { DEFAULT_TERMINAL } from '../terminal-db.js';

afterEach(() => vi.unstubAllGlobals());

describe('detectMultiplexer()', () => {
  it('detects tmux from TMUX env var', () => {
    const result = detectMultiplexer({ TMUX: '/tmp/tmux-1000/default,12345,0' });
    expect(result).not.toBeNull();
    expect(result!.type).toBe('tmux');
  });

  it('detects screen from STY env var', () => {
    const result = detectMultiplexer({ STY: '12345.pts-0.hostname' });
    expect(result).not.toBeNull();
    expect(result!.type).toBe('screen');
  });

  it('detects zellij from ZELLIJ env var', () => {
    const result = detectMultiplexer({ ZELLIJ: '0' });
    expect(result).not.toBeNull();
    expect(result!.type).toBe('zellij');
  });

  it('extracts zellij version from ZELLIJ_VERSION', () => {
    const result = detectMultiplexer({ ZELLIJ: '0', ZELLIJ_VERSION: '0.40.0' });
    expect(result).not.toBeNull();
    expect(result!.type).toBe('zellij');
    expect(result!.version).toBe('0.40.0');
  });

  it('returns null when no multiplexer detected', () => {
    const result = detectMultiplexer({});
    expect(result).toBeNull();
  });

  it('TMUX takes precedence over STY', () => {
    const result = detectMultiplexer({ TMUX: '/tmp/tmux-1000/default,12345,0', STY: '12345.pts-0.hostname' });
    expect(result).not.toBeNull();
    expect(result!.type).toBe('tmux');
  });

  it('returns null when process is undefined', () => {
    vi.stubGlobal('process', undefined);
    const result = detectMultiplexer();
    expect(result).toBeNull();
  });
});

describe('applyMultiplexerDowngrades()', () => {
  it('returns record unchanged when info is null', () => {
    const record = { trueColor: true, kittyGraphics: true };
    const result = applyMultiplexerDowngrades(record, null);
    expect(result).toEqual(record);
  });

  it('tmux disables kittyGraphics and kittyKeyboard', () => {
    const record = { kittyGraphics: true, kittyKeyboard: true, trueColor: true };
    const info = detectMultiplexer({ TMUX: '/tmp/tmux-1000/default,12345,0' });
    const result = applyMultiplexerDowngrades(record, info);
    expect(result.kittyGraphics).toBe(false);
    expect(result.kittyKeyboard).toBe(false);
    expect(result.trueColor).toBe(true);
  });

  it('screen applies comprehensive downgrades', () => {
    const record = {
      kittyGraphics: true,
      iterm2Images: true,
      sixelGraphics: true,
      syncOutput: true,
      hyperlinks: true,
      styledUnderlines: true,
      overline: true,
    };
    const info = detectMultiplexer({ STY: '12345.pts-0.hostname' });
    const result = applyMultiplexerDowngrades(record, info);
    expect(result.kittyGraphics).toBe(false);
    expect(result.iterm2Images).toBe(false);
    expect(result.sixelGraphics).toBe(false);
    expect(result.syncOutput).toBe(false);
    expect(result.hyperlinks).toBe(false);
    expect(result.styledUnderlines).toBe(false);
    expect(result.overline).toBe(false);
  });

  it('downgrades never turn capabilities ON', () => {
    const info = detectMultiplexer({ ZELLIJ: '0' });
    const result = applyMultiplexerDowngrades({ ...DEFAULT_TERMINAL }, info);
    // kittyGraphics was already false in DEFAULT_TERMINAL — should stay false
    expect(result.kittyGraphics).toBe(false);
    // No key in the result should have been flipped from false to true
    for (const [key, value] of Object.entries(DEFAULT_TERMINAL)) {
      if (value === false) {
        expect((result as Record<string, unknown>)[key]).toBe(false);
      }
    }
  });
});
