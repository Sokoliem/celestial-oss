import { describe, expect, it } from 'vitest';
import { DEFAULT_TERMINAL, lookupTerminal, TERMINAL_DB } from '../terminal-db.js';

describe('terminal-db', () => {
  it('DEFAULT_TERMINAL has all TerminalRecord fields defined', () => {
    for (const value of Object.values(DEFAULT_TERMINAL)) {
      expect(value).not.toBeUndefined();
    }
  });

  it('TERMINAL_DB contains entries for all known terminals', () => {
    const expected = [
      'kitty',
      'wezterm',
      'iterm2',
      'windows-terminal',
      'ghostty',
      'alacritty',
      'foot',
      'vscode',
      'hyper',
      'tabby',
      'contour',
      'rio',
      'mintty',
      'mlterm',
      'warp',
    ];
    for (const name of expected) {
      expect(TERMINAL_DB).toHaveProperty(name);
    }
  });

  it('lookupTerminal returns DEFAULT_TERMINAL for unknown name', () => {
    expect(lookupTerminal('nonexistent')).toEqual(DEFAULT_TERMINAL);
  });

  it('lookupTerminal merges DB entry with defaults', () => {
    const kitty = lookupTerminal('kitty');
    expect(kitty.kittyGraphics).toBe(true);
    expect(kitty.bracketedPaste).toBe(true);
  });

  it.each([
    [
      'kitty',
      {
        colorLevel: 'truecolor',
        kittyKeyboard: true,
        kittyGraphics: true,
        sixelGraphics: false,
        hyperlinks: true,
        undercurl: true,
        syncOutput: true,
        styledUnderlines: true,
        overline: true,
        cursorShapes: true,
      },
    ],
    [
      'wezterm',
      {
        colorLevel: 'truecolor',
        kittyKeyboard: true,
        kittyGraphics: true,
        iterm2Images: true,
        iterm2ImagesMultipart: true,
        sixelGraphics: true,
        hyperlinks: true,
        styledUnderlines: true,
        overline: true,
      },
    ],
    [
      'iterm2',
      {
        colorLevel: 'truecolor',
        iterm2Images: true,
        iterm2ImagesMultipart: false,
        kittyGraphics: false,
        hyperlinks: true,
        undercurl: true,
        focusEvents: true,
        styledUnderlines: true,
        cursorShapes: true,
      },
    ],
    ['windows-terminal', { colorLevel: 'truecolor', hyperlinks: true, focusEvents: true, kittyGraphics: false, sixelGraphics: false, cursorShapes: true }],
    ['alacritty', { colorLevel: '256', hyperlinks: true, syncOutput: true, kittyGraphics: false, sixelGraphics: false, cursorShapes: true }],
    [
      'foot',
      {
        kittyKeyboard: true,
        sixelGraphics: true,
        hyperlinks: true,
        undercurl: true,
        syncOutput: true,
        focusEvents: true,
        styledUnderlines: true,
        overline: true,
      },
    ],
    [
      'ghostty',
      {
        colorLevel: 'truecolor',
        focusEvents: true,
        hyperlinks: true,
        undercurl: true,
        syncOutput: true,
        styledUnderlines: true,
        overline: true,
        cursorShapes: true,
      },
    ],
    ['vscode', { hyperlinks: true, kittyGraphics: false, sixelGraphics: false }],
    ['mintty', { sixelGraphics: true, cursorShapes: true }],
    ['mlterm', { sixelGraphics: true, cursorShapes: false }],
  ] as const)('%s has correct capabilities', (name, expected) => {
    const record = lookupTerminal(name);
    expect(record).toMatchObject(expected);
  });
});
