import { describe, expect, it } from 'vitest';
import { getPreferredImageProtocol, resolveSurfaceCapabilities, shouldAnimate } from '../policy.js';
import type { AtlasCapabilities } from '../types.js';

function makeBase(overrides?: Partial<AtlasCapabilities>): AtlasCapabilities {
  return {
    surface: 'terminal',
    terminalName: 'test-terminal',
    colorLevel: '256',
    darkBackground: true,
    reducedMotion: false,
    kittyKeyboard: true,
    bracketedPaste: true,
    focusEvents: true,
    mouseTracking: true,
    kittyGraphics: true,
    iterm2Images: false,
    iterm2ImagesMultipart: false,
    sixelGraphics: false,
    syncOutput: true,
    hyperlinks: true,
    undercurl: true,
    styledUnderlines: true,
    overline: true,
    cursorShapes: true,
    unicodeLevel: 'full',
    unicodeVersion: 15,
    performanceClass: 'standard',
    ...overrides,
  };
}

describe('resolveSurfaceCapabilities()', () => {
  it('terminal passes through unchanged', () => {
    const base = makeBase();
    const result = resolveSurfaceCapabilities(base, 'terminal');
    expect(result).toEqual({ ...base, surface: 'terminal' });
  });

  it('portal disables input and forces truecolor', () => {
    const base = makeBase();
    const result = resolveSurfaceCapabilities(base, 'portal');
    expect(result.colorLevel).toBe('truecolor');
    expect(result.kittyKeyboard).toBe(false);
    expect(result.bracketedPaste).toBe(false);
    expect(result.focusEvents).toBe(false);
    expect(result.mouseTracking).toBe(false);
    expect(result.kittyGraphics).toBe(false);
    expect(result.iterm2Images).toBe(false);
    expect(result.sixelGraphics).toBe(false);
    expect(result.syncOutput).toBe(false);
    expect(result.hyperlinks).toBe(true);
    expect(result.unicodeLevel).toBe('full');
  });

  it('portal sets styledUnderlines and overline true, cursorShapes false', () => {
    const base = makeBase();
    const result = resolveSurfaceCapabilities(base, 'portal');
    expect(result.styledUnderlines).toBe(true);
    expect(result.overline).toBe(true);
    expect(result.cursorShapes).toBe(false);
  });

  it('lens enables interactive features', () => {
    const base = makeBase({
      bracketedPaste: false,
      focusEvents: false,
      mouseTracking: false,
      hyperlinks: false,
    });
    const result = resolveSurfaceCapabilities(base, 'lens');
    expect(result.bracketedPaste).toBe(true);
    expect(result.focusEvents).toBe(true);
    expect(result.mouseTracking).toBe(true);
    expect(result.hyperlinks).toBe(true);
  });

  it('test promotes none color to truecolor', () => {
    const base = makeBase({ colorLevel: 'none' });
    const result = resolveSurfaceCapabilities(base, 'test');
    expect(result.colorLevel).toBe('truecolor');
  });

  it('test preserves non-none color level', () => {
    const base = makeBase({ colorLevel: '256' });
    const result = resolveSurfaceCapabilities(base, 'test');
    expect(result.colorLevel).toBe('256');
  });

  it('warp promotes low to standard performance', () => {
    const base = makeBase({ performanceClass: 'low' });
    const result = resolveSurfaceCapabilities(base, 'warp');
    expect(result.performanceClass).toBe('standard');
  });

  it('warp preserves high performance', () => {
    const base = makeBase({ performanceClass: 'high' });
    const result = resolveSurfaceCapabilities(base, 'warp');
    expect(result.performanceClass).toBe('high');
  });
});

describe('getPreferredImageProtocol()', () => {
  it('kitty is highest priority', () => {
    expect(
      getPreferredImageProtocol({
        kittyGraphics: true,
        iterm2Images: true,
        sixelGraphics: true,
        colorLevel: 'truecolor',
        unicodeLevel: 'full',
      }),
    ).toBe('kitty');
  });

  it('iterm2 is second', () => {
    expect(
      getPreferredImageProtocol({
        kittyGraphics: false,
        iterm2Images: true,
        sixelGraphics: true,
        colorLevel: 'truecolor',
        unicodeLevel: 'full',
      }),
    ).toBe('iterm2');
  });

  it('sixel is third', () => {
    expect(
      getPreferredImageProtocol({
        kittyGraphics: false,
        iterm2Images: false,
        sixelGraphics: true,
        colorLevel: 'truecolor',
        unicodeLevel: 'full',
      }),
    ).toBe('sixel');
  });

  it('truecolor + full Unicode without graphics prefers sextant', () => {
    expect(
      getPreferredImageProtocol({
        kittyGraphics: false,
        iterm2Images: false,
        sixelGraphics: false,
        colorLevel: 'truecolor',
        unicodeLevel: 'full',
      }),
    ).toBe('sextant');
  });

  it('truecolor + wide Unicode without graphics falls back to blocks', () => {
    expect(
      getPreferredImageProtocol({
        kittyGraphics: false,
        iterm2Images: false,
        sixelGraphics: false,
        colorLevel: 'truecolor',
        unicodeLevel: 'wide',
      }),
    ).toBe('blocks');
  });

  it('truecolor + basic Unicode without graphics falls back to blocks', () => {
    expect(
      getPreferredImageProtocol({
        kittyGraphics: false,
        iterm2Images: false,
        sixelGraphics: false,
        colorLevel: 'truecolor',
        unicodeLevel: 'basic',
      }),
    ).toBe('blocks');
  });

  it('graphics protocols still win over sextant', () => {
    expect(
      getPreferredImageProtocol({
        kittyGraphics: false,
        iterm2Images: false,
        sixelGraphics: true,
        colorLevel: 'truecolor',
        unicodeLevel: 'full',
      }),
    ).toBe('sixel');
  });

  it('no color falls back to braille', () => {
    expect(
      getPreferredImageProtocol({
        kittyGraphics: false,
        iterm2Images: false,
        sixelGraphics: false,
        colorLevel: 'none',
        unicodeLevel: 'full',
      }),
    ).toBe('braille');
  });

  it('256 color without graphics falls back to braille', () => {
    expect(
      getPreferredImageProtocol({
        kittyGraphics: false,
        iterm2Images: false,
        sixelGraphics: false,
        colorLevel: '256',
        unicodeLevel: 'full',
      }),
    ).toBe('braille');
  });

  it('back-compat: omitting unicodeLevel falls back to blocks (never picks sextant)', () => {
    // Callers written against the pre-sextant signature should keep working.
    expect(
      getPreferredImageProtocol({
        kittyGraphics: false,
        iterm2Images: false,
        sixelGraphics: false,
        colorLevel: 'truecolor',
      }),
    ).toBe('blocks');
  });
});

describe('shouldAnimate()', () => {
  it('animates with standard perf and no reduced motion', () => {
    expect(shouldAnimate({ reducedMotion: false, performanceClass: 'standard' })).toBe(true);
  });

  it('disabled by reduced motion', () => {
    expect(shouldAnimate({ reducedMotion: true, performanceClass: 'standard' })).toBe(false);
  });

  it('disabled by low performance', () => {
    expect(shouldAnimate({ reducedMotion: false, performanceClass: 'low' })).toBe(false);
  });

  it('disabled when both', () => {
    expect(shouldAnimate({ reducedMotion: true, performanceClass: 'low' })).toBe(false);
  });
});
