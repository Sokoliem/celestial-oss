import { describe, expect, it } from 'vitest';
import { canEmit, type EmitProtocol } from '../policy.js';
import type { AtlasCapabilities } from '../types.js';

function makeCaps(overrides?: Partial<AtlasCapabilities>): AtlasCapabilities {
  return {
    surface: 'terminal',
    terminalName: 'test-terminal',
    colorLevel: 'truecolor',
    darkBackground: true,
    reducedMotion: false,
    kittyKeyboard: false,
    bracketedPaste: false,
    focusEvents: false,
    mouseTracking: false,
    kittyGraphics: false,
    iterm2Images: false,
    iterm2ImagesMultipart: false,
    sixelGraphics: false,
    syncOutput: false,
    hyperlinks: false,
    undercurl: false,
    styledUnderlines: false,
    overline: false,
    cursorShapes: false,
    unicodeLevel: 'full',
    unicodeVersion: 15,
    performanceClass: 'standard',
    ...overrides,
  };
}

/**
 * The mapping between EmitProtocol values and AtlasCapabilities flags is
 * the public contract of this helper. One row per protocol, with the
 * capability key it depends on.
 */
const MAPPING: Array<[EmitProtocol, keyof AtlasCapabilities]> = [
  ['kitty-graphics', 'kittyGraphics'],
  ['iterm2-images', 'iterm2Images'],
  ['sixel', 'sixelGraphics'],
  ['hyperlinks', 'hyperlinks'],
  ['sync-output', 'syncOutput'],
  ['kitty-keyboard', 'kittyKeyboard'],
  ['bracketed-paste', 'bracketedPaste'],
  ['focus-events', 'focusEvents'],
  ['mouse-tracking', 'mouseTracking'],
  ['styled-underlines', 'styledUnderlines'],
  ['undercurl', 'undercurl'],
  ['overline', 'overline'],
  ['cursor-shapes', 'cursorShapes'],
];

describe('canEmit', () => {
  it.each(MAPPING)('returns true for "%s" only when capability "%s" is set', (protocol, capKey) => {
    // Default caps — every capability false except the one under test.
    const off = makeCaps();
    expect(canEmit(off, protocol)).toBe(false);

    const on = makeCaps({ [capKey]: true } as Partial<AtlasCapabilities>);
    expect(canEmit(on, protocol)).toBe(true);
  });

  it('does not bleed across protocols — turning on one capability does not enable another', () => {
    const caps = makeCaps({ kittyGraphics: true });
    expect(canEmit(caps, 'kitty-graphics')).toBe(true);
    // Every other protocol stays false.
    for (const [protocol] of MAPPING) {
      if (protocol === 'kitty-graphics') continue;
      expect(canEmit(caps, protocol)).toBe(false);
    }
  });

  it('a fully-capable terminal returns true for every protocol', () => {
    const everything = makeCaps({
      kittyGraphics: true,
      iterm2Images: true,
      sixelGraphics: true,
      hyperlinks: true,
      syncOutput: true,
      kittyKeyboard: true,
      bracketedPaste: true,
      focusEvents: true,
      mouseTracking: true,
      styledUnderlines: true,
      undercurl: true,
      overline: true,
      cursorShapes: true,
    });
    for (const [protocol] of MAPPING) {
      expect(canEmit(everything, protocol)).toBe(true);
    }
  });

  it('a fully-incapable terminal returns false for every protocol', () => {
    const nothing = makeCaps();
    for (const [protocol] of MAPPING) {
      expect(canEmit(nothing, protocol)).toBe(false);
    }
  });
});
