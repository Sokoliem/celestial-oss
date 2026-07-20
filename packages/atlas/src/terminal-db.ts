import type { TerminalRecord } from './types.js';

export const DEFAULT_TERMINAL: Readonly<TerminalRecord> = {
  colorLevel: 'none',
  kittyKeyboard: false,
  bracketedPaste: true,
  focusEvents: false,
  mouseTracking: true,
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
  performanceClass: 'standard',
};

export const TERMINAL_DB: Readonly<Record<string, Partial<TerminalRecord>>> = {
  kitty: {
    colorLevel: 'truecolor',
    kittyKeyboard: true,
    focusEvents: true,
    kittyGraphics: true,
    syncOutput: true,
    hyperlinks: true,
    undercurl: true,
    styledUnderlines: true,
    overline: true,
    cursorShapes: true,
    performanceClass: 'high',
  },
  wezterm: {
    colorLevel: 'truecolor',
    kittyKeyboard: true,
    focusEvents: true,
    kittyGraphics: true,
    iterm2Images: true,
    iterm2ImagesMultipart: true,
    sixelGraphics: true,
    syncOutput: true,
    hyperlinks: true,
    undercurl: true,
    styledUnderlines: true,
    overline: true,
    cursorShapes: true,
    performanceClass: 'high',
  },
  iterm2: {
    colorLevel: 'truecolor',
    focusEvents: true,
    iterm2Images: true,
    // iTerm2 3.5+ supports multipart; we can't detect minor version from env
    // alone, so leave this false by default. Callers who know they're on 3.5+
    // can opt in via renderITerm2Image({ multipart: true }) directly.
    iterm2ImagesMultipart: false,
    syncOutput: true,
    hyperlinks: true,
    undercurl: true,
    styledUnderlines: true,
    cursorShapes: true,
  },
  'windows-terminal': {
    colorLevel: 'truecolor',
    focusEvents: true,
    hyperlinks: true,
    cursorShapes: true,
    performanceClass: 'high',
  },
  ghostty: {
    colorLevel: 'truecolor',
    focusEvents: true,
    syncOutput: true,
    hyperlinks: true,
    undercurl: true,
    styledUnderlines: true,
    overline: true,
    cursorShapes: true,
    performanceClass: 'high',
  },
  alacritty: {
    colorLevel: '256',
    syncOutput: true,
    hyperlinks: true,
    cursorShapes: true,
  },
  foot: {
    colorLevel: '256',
    kittyKeyboard: true,
    focusEvents: true,
    sixelGraphics: true,
    syncOutput: true,
    hyperlinks: true,
    undercurl: true,
    styledUnderlines: true,
    overline: true,
    cursorShapes: true,
  },
  vscode: {
    colorLevel: '256',
    hyperlinks: true,
    cursorShapes: true,
  },
  hyper: {
    colorLevel: '256',
    hyperlinks: true,
  },
  tabby: {
    colorLevel: '256',
    hyperlinks: true,
  },
  contour: {
    colorLevel: '256',
    syncOutput: true,
    styledUnderlines: true,
    overline: true,
    cursorShapes: true,
  },
  rio: {
    colorLevel: '256',
    syncOutput: true,
    styledUnderlines: true,
    cursorShapes: true,
  },
  mintty: {
    colorLevel: '256',
    sixelGraphics: true,
    cursorShapes: true,
  },
  mlterm: {
    colorLevel: '256',
    sixelGraphics: true,
  },
  warp: {
    colorLevel: 'truecolor',
    performanceClass: 'high',
  },
};

export function lookupTerminal(name: string): Readonly<TerminalRecord> {
  const entry = TERMINAL_DB[name];
  if (!entry) return DEFAULT_TERMINAL;
  return { ...DEFAULT_TERMINAL, ...entry };
}
