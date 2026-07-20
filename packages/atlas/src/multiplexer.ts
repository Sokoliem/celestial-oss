import type { MultiplexerInfo, TerminalRecord } from './types.js';

const TMUX_DOWNGRADES: Partial<TerminalRecord> = {
  kittyKeyboard: false,
  kittyGraphics: false,
  sixelGraphics: false,
  syncOutput: false,
};

const SCREEN_DOWNGRADES: Partial<TerminalRecord> = {
  kittyKeyboard: false,
  kittyGraphics: false,
  iterm2Images: false,
  sixelGraphics: false,
  syncOutput: false,
  hyperlinks: false,
  styledUnderlines: false,
  overline: false,
};

const ZELLIJ_DOWNGRADES: Partial<TerminalRecord> = {
  kittyGraphics: false,
  sixelGraphics: false,
};

export function detectMultiplexer(env?: NodeJS.ProcessEnv): MultiplexerInfo | null {
  const resolvedEnv = env ?? (typeof process !== 'undefined' && process.env ? process.env : {});

  const tmux = resolvedEnv['TMUX'];
  if (tmux) {
    return { type: 'tmux', version: undefined, downgrades: TMUX_DOWNGRADES };
  }

  const sty = resolvedEnv['STY'];
  if (sty) {
    return { type: 'screen', version: undefined, downgrades: SCREEN_DOWNGRADES };
  }

  const zellij = resolvedEnv['ZELLIJ'];
  if (zellij !== undefined) {
    return { type: 'zellij', version: resolvedEnv['ZELLIJ_VERSION'], downgrades: ZELLIJ_DOWNGRADES };
  }

  return null;
}

export function applyMultiplexerDowngrades<T extends Partial<TerminalRecord>>(record: T, info: MultiplexerInfo | null): T {
  if (!info) return record;
  const result = { ...record };
  for (const [key, value] of Object.entries(info.downgrades)) {
    if (value === false) {
      (result as Record<string, unknown>)[key] = false;
    }
  }
  return result;
}
