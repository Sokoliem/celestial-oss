/**
 * Nexus capability projection.
 *
 * Atlas owns the canonical capability snapshot. Nexus keeps its richer
 * interaction-centric projection and helper APIs for compatibility.
 */

import { detectCapabilities as detectAtlasCapabilities } from '@celestial/atlas';

export interface TerminalCapabilities {
  color: 'none' | '16' | '256' | 'truecolor';
  mouse: boolean;
  hyperlinks: boolean;
  images: 'kitty' | 'iterm2' | 'none';
  kittyKeyboard: boolean;
  synchronizedOutput: boolean;
  unicode: 'none' | 'basic' | 'wide' | 'full';
  bracketedPaste: boolean;
}

const LEGACY_HYPERLINK_TERMINALS = new Set(['iterm2', 'wezterm', 'ghostty', 'vscode', 'hyper', 'tabby', 'kitty']);
const LEGACY_SYNC_OUTPUT_TERMINALS = new Set(['wezterm', 'iterm2', 'kitty', 'contour', 'rio', 'ghostty']);

function pickLegacyEnv(): NodeJS.ProcessEnv {
  return {
    TERM_PROGRAM: process.env['TERM_PROGRAM'],
    TERM: process.env['TERM'],
    COLORTERM: process.env['COLORTERM'],
    NO_COLOR: process.env['NO_COLOR'],
    KITTY_PID: process.env['KITTY_PID'],
    VTE_VERSION: process.env['VTE_VERSION'],
    LANG: process.env['LANG'],
    LC_ALL: process.env['LC_ALL'],
    LC_TERMINAL: process.env['LC_TERMINAL'],
  };
}

function detectColor(env: NodeJS.ProcessEnv): TerminalCapabilities['color'] {
  if (env['NO_COLOR'] !== undefined) {
    return 'none';
  }

  const colorterm = env['COLORTERM'] ?? '';
  if (colorterm === 'truecolor' || colorterm === '24bit') {
    return 'truecolor';
  }

  const term = env['TERM'] ?? '';
  if (term.includes('256color')) {
    return '256';
  }

  if (term !== '' && term !== 'dumb') {
    return '16';
  }

  return 'none';
}

function detectUnicode(env: NodeJS.ProcessEnv): TerminalCapabilities['unicode'] {
  const locale = env['LC_ALL'] || env['LANG'] || '';
  if (/utf-?8/i.test(locale)) {
    return 'full';
  }

  return env['TERM'] === 'dumb' ? 'none' : 'basic';
}

export function detectCapabilities(): TerminalCapabilities {
  const env = pickLegacyEnv();
  const capabilities = detectAtlasCapabilities({ env });
  const term = env['TERM'] ?? '';
  const termProgram = env['TERM_PROGRAM'] ?? '';
  const kittyPid = env['KITTY_PID'] ?? '';
  const kittyTerm = term.includes('xterm-kitty');
  const vteVersion = parseInt(env['VTE_VERSION'] ?? '', 10);
  const supportsLegacyHyperlinks =
    LEGACY_HYPERLINK_TERMINALS.has(capabilities.terminalName) || kittyTerm || (Number.isFinite(vteVersion) && vteVersion >= 5000);
  const supportsLegacyKittyKeyboard = kittyPid !== '' || capabilities.terminalName === 'kitty' || kittyTerm;
  const supportsLegacyImages =
    kittyPid !== '' || capabilities.terminalName === 'kitty' || kittyTerm
      ? 'kitty'
      : termProgram === 'WezTerm' || capabilities.terminalName === 'iterm2'
        ? 'iterm2'
        : 'none';

  return {
    color: detectColor(env),
    mouse: term !== 'dumb',
    hyperlinks: supportsLegacyHyperlinks,
    images: supportsLegacyImages,
    kittyKeyboard: supportsLegacyKittyKeyboard,
    synchronizedOutput: LEGACY_SYNC_OUTPUT_TERMINALS.has(capabilities.terminalName) || kittyTerm,
    unicode: detectUnicode(env),
    bracketedPaste: term !== 'dumb',
  };
}

export interface FallbackChain<T> {
  when(cap: keyof TerminalCapabilities, value: unknown, result: T): FallbackChain<T>;
  otherwise(result: T): T;
}

export function fallback<T>(): FallbackChain<T> {
  const conditions: Array<{
    cap: keyof TerminalCapabilities;
    value: unknown;
    result: T;
  }> = [];

  const chain: FallbackChain<T> = {
    when(cap: keyof TerminalCapabilities, value: unknown, result: T): FallbackChain<T> {
      conditions.push({ cap, value, result });
      return chain;
    },

    otherwise(result: T): T {
      const capabilities = detectCapabilities();

      for (const condition of conditions) {
        if (capabilities[condition.cap] === condition.value) {
          return condition.result;
        }
      }

      return result;
    },
  };

  return chain;
}

export function withCapability<T>(
  capabilities: TerminalCapabilities,
  cap: keyof TerminalCapabilities,
  expectedValue: unknown,
  enhanced: T,
  fallbackValue: T,
): T {
  return capabilities[cap] === expectedValue ? enhanced : fallbackValue;
}
