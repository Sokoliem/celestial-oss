/**
 * Nebula capability compatibility facade.
 *
 * Canonical detection now lives in @celestial/atlas. Nebula keeps the
 * historical boolean-oriented shape so existing runtime code and tests do not
 * need to change.
 */

import {
  type AtlasCapabilities,
  detectCapabilities as detectAtlasCapabilities,
  getCapabilities as getAtlasCapabilities,
  resetCapabilitiesCache as resetAtlasCapabilitiesCache,
} from '@celestial/atlas';

export interface TerminalCapabilities {
  trueColor: boolean;
  color256: boolean;
  kittyKeyboard: boolean;
  bracketedPaste: boolean;
  focusEvents: boolean;
  mouseTracking: boolean;
  kittyGraphics: boolean;
  iterm2Images: boolean;
  sixelGraphics: boolean;
  syncOutput: boolean;
  hyperlinks: boolean;
  undercurl: boolean;
  terminalName: string;
  unicodeVersion: number;
}

function fromAtlas(capabilities: AtlasCapabilities): TerminalCapabilities {
  return {
    trueColor: capabilities.colorLevel === 'truecolor',
    color256: capabilities.colorLevel === '256' || capabilities.colorLevel === 'truecolor',
    kittyKeyboard: capabilities.kittyKeyboard,
    bracketedPaste: capabilities.bracketedPaste,
    focusEvents: capabilities.focusEvents,
    mouseTracking: capabilities.mouseTracking,
    kittyGraphics: capabilities.kittyGraphics,
    iterm2Images: capabilities.iterm2Images,
    sixelGraphics: capabilities.sixelGraphics,
    syncOutput: capabilities.syncOutput,
    hyperlinks: capabilities.hyperlinks,
    undercurl: capabilities.undercurl,
    terminalName: capabilities.terminalName,
    unicodeVersion: capabilities.unicodeVersion,
  };
}

let cachedCapabilities: TerminalCapabilities | null = null;

export function detectCapabilities(): TerminalCapabilities {
  return fromAtlas(detectAtlasCapabilities());
}

export function getCapabilities(): TerminalCapabilities {
  if (cachedCapabilities !== null) {
    return cachedCapabilities;
  }

  cachedCapabilities = fromAtlas(getAtlasCapabilities());
  return cachedCapabilities;
}

export function resetCapabilitiesCache(): void {
  cachedCapabilities = null;
  resetAtlasCapabilitiesCache();
}
