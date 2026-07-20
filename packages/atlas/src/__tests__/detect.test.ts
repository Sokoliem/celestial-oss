import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTerminalName, pinCapabilities, unpinCapabilities } from '../detect.js';
import {
  detectCapabilities,
  detectColorLevel,
  detectDarkBackground,
  detectReducedMotion,
  getCapabilities,
  getPreferredImageProtocol,
  resetCapabilitiesCache,
  resolveSurfaceCapabilities,
  shouldAnimate,
} from '../index.js';

afterEach(() => {
  vi.unstubAllGlobals();
  resetCapabilitiesCache();
  unpinCapabilities();
});

// ---------------------------------------------------------------------------
// getTerminalName()
// ---------------------------------------------------------------------------
describe('getTerminalName()', () => {
  it.each([
    [{ KITTY_PID: '1234' }, 'kitty'],
    [{ TERM_PROGRAM: 'kitty' }, 'kitty'],
    [{ TERM: 'xterm-kitty' }, 'kitty'],
    [{ TERM_PROGRAM: 'WezTerm' }, 'wezterm'],
    [{ TERM_PROGRAM: 'iTerm.app' }, 'iterm2'],
    [{ TERM_PROGRAM: 'iTerm2' }, 'iterm2'],
    [{ LC_TERMINAL: 'iTerm2' }, 'iterm2'],
    [{ WT_SESSION: 'abc-123' }, 'windows-terminal'],
    [{ TERM_PROGRAM: 'alacritty' }, 'alacritty'],
    [{ TERM_PROGRAM: 'foot' }, 'foot'],
    [{ TERM_PROGRAM: 'ghostty' }, 'ghostty'],
    [{ TERM_PROGRAM: 'vscode' }, 'vscode'],
    [{ TERM_PROGRAM: 'Hyper' }, 'hyper'],
    [{ TERM_PROGRAM: 'Tabby' }, 'tabby'],
    [{ TERM_PROGRAM: 'contour' }, 'contour'],
    [{ TERM_PROGRAM: 'rio' }, 'rio'],
    [{ TERM_PROGRAM: 'mintty' }, 'mintty'],
    [{ TERM_PROGRAM: 'mlterm' }, 'mlterm'],
    [{ TERM_PROGRAM: 'WarpTerminal' }, 'warp'],
    [{ TERM_PROGRAM: 'Warp' }, 'warp'],
    [{ TERM_PROGRAM: 'SomeCustomTerm' }, 'somecustomterm'],
  ] as [NodeJS.ProcessEnv, string][])('env %j -> %s', (env, expected) => {
    expect(getTerminalName(env)).toBe(expected);
  });

  it('KITTY_PID takes priority over TERM_PROGRAM', () => {
    expect(getTerminalName({ KITTY_PID: '1', TERM_PROGRAM: 'WezTerm' })).toBe('kitty');
  });

  it('returns unknown for empty env', () => {
    expect(getTerminalName({})).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// detectColorLevel()
// ---------------------------------------------------------------------------
describe('detectColorLevel()', () => {
  it('FORCE_COLOR=0 returns none', () => {
    expect(detectColorLevel({ FORCE_COLOR: '0' })).toBe('none');
  });

  it('FORCE_COLOR=1 returns 16', () => {
    expect(detectColorLevel({ FORCE_COLOR: '1' })).toBe('16');
  });

  it('FORCE_COLOR=2 returns 256', () => {
    expect(detectColorLevel({ FORCE_COLOR: '2' })).toBe('256');
  });

  it('FORCE_COLOR=3 returns truecolor', () => {
    expect(detectColorLevel({ FORCE_COLOR: '3' })).toBe('truecolor');
  });

  it('FORCE_COLOR beats NO_COLOR', () => {
    expect(detectColorLevel({ NO_COLOR: '1', FORCE_COLOR: '3' })).toBe('truecolor');
  });

  it('NO_COLOR disables color despite terminal', () => {
    expect(detectColorLevel({ NO_COLOR: '1', TERM_PROGRAM: 'WezTerm' })).toBe('none');
  });

  it('COLORTERM=truecolor yields truecolor', () => {
    expect(detectColorLevel({ COLORTERM: 'truecolor' })).toBe('truecolor');
  });

  it('COLORTERM=24bit yields truecolor', () => {
    expect(detectColorLevel({ COLORTERM: '24bit' })).toBe('truecolor');
  });

  it('TERM with 256color yields 256', () => {
    expect(detectColorLevel({ TERM: 'xterm-256color' })).toBe('256');
  });

  it('TERM=dumb yields none', () => {
    expect(detectColorLevel({ TERM: 'dumb' })).toBe('none');
  });

  it('bare TERM yields 16', () => {
    expect(detectColorLevel({ TERM: 'xterm' })).toBe('16');
  });

  it('empty env yields none', () => {
    expect(detectColorLevel({})).toBe('none');
  });
});

// ---------------------------------------------------------------------------
// detectDarkBackground()
// ---------------------------------------------------------------------------
describe('detectDarkBackground()', () => {
  it('detects dark background from COLORFGBG', () => {
    expect(detectDarkBackground({ COLORFGBG: '15;0' })).toBe(true);
    expect(detectDarkBackground({ COLORFGBG: '0;15' })).toBe(false);
  });

  it('three-part COLORFGBG uses last part', () => {
    // e.g. "15;default;0" — last part is bg
    expect(detectDarkBackground({ COLORFGBG: '15;default;0' })).toBe(true);
    expect(detectDarkBackground({ COLORFGBG: '15;default;15' })).toBe(false);
  });

  it('non-numeric bg defaults to dark', () => {
    expect(detectDarkBackground({ COLORFGBG: '15;abc' })).toBe(true);
  });

  it('missing COLORFGBG defaults to dark', () => {
    expect(detectDarkBackground({})).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// detectReducedMotion()
// ---------------------------------------------------------------------------
describe('detectReducedMotion()', () => {
  it('detects reduced motion from REDUCE_MOTION', () => {
    expect(detectReducedMotion({ REDUCE_MOTION: 'true' })).toBe(true);
    expect(detectReducedMotion({ REDUCE_MOTION: '1' })).toBe(true);
  });

  it('NO_MOTION=0 is false', () => {
    expect(detectReducedMotion({ NO_MOTION: '0' })).toBe(false);
  });

  it('missing env vars is false', () => {
    expect(detectReducedMotion({})).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// detectCapabilities()
// ---------------------------------------------------------------------------
describe('detectCapabilities()', () => {
  it('detects Windows Terminal hyperlink and focus support', () => {
    const caps = detectCapabilities({ env: { WT_SESSION: '1' } });
    expect(caps.terminalName).toBe('windows-terminal');
    expect(caps.hyperlinks).toBe(true);
    expect(caps.focusEvents).toBe(true);
  });

  it('detects foot sixel via DB lookup', () => {
    const caps = detectCapabilities({ env: { TERM_PROGRAM: 'foot' } });
    expect(caps.sixelGraphics).toBe(true);
    expect(getPreferredImageProtocol(caps)).toBe('sixel');
  });

  it('VTE_VERSION >= 5000 enables hyperlinks', () => {
    const caps = detectCapabilities({ env: { VTE_VERSION: '5400', TERM: 'xterm' } });
    expect(caps.hyperlinks).toBe(true);
  });

  it('VTE_VERSION >= 7200 enables sixel', () => {
    const caps = detectCapabilities({ env: { VTE_VERSION: '7200', TERM: 'xterm' } });
    expect(caps.sixelGraphics).toBe(true);
  });

  it('VTE_VERSION non-numeric is safe', () => {
    const caps = detectCapabilities({ env: { VTE_VERSION: 'abc', TERM: 'xterm' } });
    expect(caps.hyperlinks).toBe(false);
    expect(caps.sixelGraphics).toBe(false);
  });

  it('kitty has styledUnderlines, overline, and cursorShapes from DB', () => {
    const caps = detectCapabilities({ env: { KITTY_PID: '1' } });
    expect(caps.styledUnderlines).toBe(true);
    expect(caps.overline).toBe(true);
    expect(caps.cursorShapes).toBe(true);
  });

  it('dumb terminal disables bracketedPaste and mouseTracking', () => {
    const caps = detectCapabilities({ env: { TERM: 'dumb' } });
    expect(caps.bracketedPaste).toBe(false);
    expect(caps.mouseTracking).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TERM_FEATURES
// ---------------------------------------------------------------------------
describe('TERM_FEATURES', () => {
  it('parses comma-separated list enabling features', () => {
    const caps = detectCapabilities({ env: { TERM: 'xterm', TERM_FEATURES: 'sixel,hyperlinks' } });
    expect(caps.sixelGraphics).toBe(true);
    expect(caps.hyperlinks).toBe(true);
  });

  it('negation with - prefix disables features', () => {
    const caps = detectCapabilities({ env: { KITTY_PID: '1', TERM_FEATURES: '-hyperlinks' } });
    expect(caps.hyperlinks).toBe(false);
  });

  it('no_ prefix disables features', () => {
    const caps = detectCapabilities({ env: { KITTY_PID: '1', TERM_FEATURES: 'no_sixel' } });
    expect(caps.sixelGraphics).toBe(false);
  });

  it('empty string is a no-op', () => {
    const base = detectCapabilities({ env: { TERM: 'xterm' } });
    const withEmpty = detectCapabilities({ env: { TERM: 'xterm', TERM_FEATURES: '' } });
    expect(withEmpty.sixelGraphics).toBe(base.sixelGraphics);
  });

  it('unknown feature names are ignored', () => {
    const base = detectCapabilities({ env: { TERM: 'xterm' } });
    const caps = detectCapabilities({ env: { TERM: 'xterm', TERM_FEATURES: 'flying_pigs,wormhole' } });
    expect(caps.sixelGraphics).toBe(base.sixelGraphics);
    expect(caps.hyperlinks).toBe(base.hyperlinks);
  });
});

// ---------------------------------------------------------------------------
// capability pinning
// ---------------------------------------------------------------------------
describe('capability pinning', () => {
  it('pinCapabilities overrides detection', () => {
    pinCapabilities({ colorLevel: 'truecolor' });
    const caps = detectCapabilities({ env: {} });
    expect(caps.colorLevel).toBe('truecolor');
  });

  it('pinned values survive cache reset', () => {
    pinCapabilities({ colorLevel: '256' });
    resetCapabilitiesCache();
    const caps = detectCapabilities({ env: {} });
    expect(caps.colorLevel).toBe('256');
  });

  it('unpinCapabilities removes pins', () => {
    pinCapabilities({ colorLevel: 'truecolor' });
    unpinCapabilities();
    const caps = detectCapabilities({ env: {} });
    expect(caps.colorLevel).toBe('none');
  });

  it('pin merges, does not replace all fields', () => {
    pinCapabilities({ hyperlinks: true });
    const caps = detectCapabilities({ env: { KITTY_PID: '1' } });
    expect(caps.hyperlinks).toBe(true);
    expect(caps.kittyGraphics).toBe(true); // from DB, not wiped
  });

  it('pinned values appear via getCapabilities', () => {
    pinCapabilities({ colorLevel: 'truecolor' });
    const caps = getCapabilities();
    expect(caps.colorLevel).toBe('truecolor');
  });
});

// ---------------------------------------------------------------------------
// process unavailable
// ---------------------------------------------------------------------------
describe('process unavailable', () => {
  it('falls back to an empty env when process is unavailable', () => {
    vi.stubGlobal('process', undefined);

    expect(detectColorLevel()).toBe('none');
    expect(detectDarkBackground()).toBe(true);
    expect(detectReducedMotion()).toBe(false);
    expect(detectCapabilities()).toMatchObject({
      terminalName: 'unknown',
      colorLevel: 'none',
      surface: 'terminal',
    });
  });
});

// ---------------------------------------------------------------------------
// surface overrides
// ---------------------------------------------------------------------------
describe('surface overrides', () => {
  it('applies portal surface overrides without inventing runtime input support', () => {
    const caps = resolveSurfaceCapabilities(detectCapabilities({ env: { TERM_PROGRAM: 'WezTerm' } }), 'portal');

    expect(caps.hyperlinks).toBe(true);
    expect(caps.mouseTracking).toBe(false);
    expect(caps.kittyGraphics).toBe(false);
    expect(caps.colorLevel).toBe('truecolor');
  });

  it('disables animation when reduced motion is requested', () => {
    expect(shouldAnimate(detectCapabilities({ env: { REDUCE_MOTION: '1' } }))).toBe(false);
  });
});
