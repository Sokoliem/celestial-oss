/**
 * Atlas capability fixtures for Telescope.
 *
 * Provides pre-configured capability presets for common terminal emulators,
 * letting tests exercise rendering and feature-detection paths without a
 * real terminal.
 */

// ── Types ──────────────────────────────────────────────────────────────

export interface CapabilityPreset {
  /** Human-friendly preset name. */
  name: string;
  /** Capability flags (booleans, strings, numbers). */
  capabilities: Record<string, boolean | string | number>;
  /** Optional environment variable overrides. */
  env?: Record<string, string>;
}

// ── Presets ─────────────────────────────────────────────────────────────

export const CAPABILITY_PRESETS: {
  kitty: CapabilityPreset;
  wezterm: CapabilityPreset;
  iterm2: CapabilityPreset;
  xterm256: CapabilityPreset;
  tmux: CapabilityPreset;
  vscode: CapabilityPreset;
  windowsTerminal: CapabilityPreset;
  minimal: CapabilityPreset;
} = {
  kitty: {
    name: 'Kitty',
    capabilities: {
      surface: 'terminal',
      terminalName: 'kitty',
      colorLevel: 'truecolor',
      darkBackground: true,
      reducedMotion: false,
      kittyKeyboard: true,
      bracketedPaste: true,
      focusEvents: true,
      mouseTracking: true,
      kittyGraphics: true,
      iterm2Images: false,
      sixelGraphics: false,
      syncOutput: true,
      hyperlinks: true,
      undercurl: true,
      styledUnderlines: true,
      overline: true,
      cursorShapes: true,
      unicodeLevel: 'full',
      unicodeVersion: 15,
      performanceClass: 'high',
    },
    env: { TERM: 'xterm-kitty', TERM_PROGRAM: 'kitty' },
  },

  wezterm: {
    name: 'WezTerm',
    capabilities: {
      surface: 'terminal',
      terminalName: 'wezterm',
      colorLevel: 'truecolor',
      darkBackground: true,
      reducedMotion: false,
      kittyKeyboard: true,
      bracketedPaste: true,
      focusEvents: true,
      mouseTracking: true,
      kittyGraphics: true,
      iterm2Images: true,
      sixelGraphics: true,
      syncOutput: true,
      hyperlinks: true,
      undercurl: true,
      styledUnderlines: true,
      overline: true,
      cursorShapes: true,
      unicodeLevel: 'full',
      unicodeVersion: 15,
      performanceClass: 'high',
    },
    env: { TERM: 'xterm-256color', TERM_PROGRAM: 'WezTerm' },
  },

  iterm2: {
    name: 'iTerm2',
    capabilities: {
      surface: 'terminal',
      terminalName: 'iterm2',
      colorLevel: 'truecolor',
      darkBackground: true,
      reducedMotion: false,
      kittyKeyboard: false,
      bracketedPaste: true,
      focusEvents: true,
      mouseTracking: true,
      kittyGraphics: false,
      iterm2Images: true,
      sixelGraphics: false,
      syncOutput: false,
      hyperlinks: true,
      undercurl: true,
      styledUnderlines: true,
      overline: false,
      cursorShapes: true,
      unicodeLevel: 'full',
      unicodeVersion: 15,
      performanceClass: 'high',
    },
    env: { TERM: 'xterm-256color', TERM_PROGRAM: 'iTerm.app' },
  },

  xterm256: {
    name: 'xterm (256-color)',
    capabilities: {
      surface: 'terminal',
      terminalName: 'xterm',
      colorLevel: '256',
      darkBackground: true,
      reducedMotion: false,
      kittyKeyboard: false,
      bracketedPaste: true,
      focusEvents: false,
      mouseTracking: true,
      kittyGraphics: false,
      iterm2Images: false,
      sixelGraphics: false,
      syncOutput: false,
      hyperlinks: false,
      undercurl: false,
      styledUnderlines: false,
      overline: false,
      cursorShapes: true,
      unicodeLevel: 'basic',
      unicodeVersion: 9,
      performanceClass: 'standard',
    },
    env: { TERM: 'xterm-256color' },
  },

  tmux: {
    name: 'tmux',
    capabilities: {
      surface: 'terminal',
      terminalName: 'tmux',
      colorLevel: '256',
      darkBackground: true,
      reducedMotion: false,
      kittyKeyboard: false,
      bracketedPaste: true,
      focusEvents: true,
      mouseTracking: true,
      kittyGraphics: false,
      iterm2Images: false,
      sixelGraphics: false,
      syncOutput: false,
      hyperlinks: true,
      undercurl: false,
      styledUnderlines: false,
      overline: false,
      cursorShapes: true,
      unicodeLevel: 'basic',
      unicodeVersion: 9,
      performanceClass: 'standard',
    },
    env: { TERM: 'tmux-256color', TMUX: '/tmp/tmux-1000/default,12345,0' },
  },

  vscode: {
    name: 'VS Code Terminal',
    capabilities: {
      surface: 'terminal',
      terminalName: 'vscode',
      colorLevel: 'truecolor',
      darkBackground: true,
      reducedMotion: false,
      kittyKeyboard: false,
      bracketedPaste: true,
      focusEvents: true,
      mouseTracking: true,
      kittyGraphics: false,
      iterm2Images: false,
      sixelGraphics: false,
      syncOutput: false,
      hyperlinks: true,
      undercurl: false,
      styledUnderlines: false,
      overline: false,
      cursorShapes: true,
      unicodeLevel: 'wide',
      unicodeVersion: 11,
      performanceClass: 'standard',
    },
    env: { TERM: 'xterm-256color', TERM_PROGRAM: 'vscode' },
  },

  windowsTerminal: {
    name: 'Windows Terminal',
    capabilities: {
      surface: 'terminal',
      terminalName: 'windows-terminal',
      colorLevel: 'truecolor',
      darkBackground: true,
      reducedMotion: false,
      kittyKeyboard: false,
      bracketedPaste: true,
      focusEvents: true,
      mouseTracking: true,
      kittyGraphics: false,
      iterm2Images: false,
      sixelGraphics: false,
      syncOutput: false,
      hyperlinks: true,
      undercurl: false,
      styledUnderlines: false,
      overline: false,
      cursorShapes: true,
      unicodeLevel: 'wide',
      unicodeVersion: 14,
      performanceClass: 'standard',
    },
    env: { TERM: 'xterm-256color', WT_SESSION: '1' },
  },

  minimal: {
    name: 'Minimal (dumb terminal)',
    capabilities: {
      surface: 'terminal',
      terminalName: 'dumb',
      colorLevel: 'none',
      darkBackground: false,
      reducedMotion: true,
      kittyKeyboard: false,
      bracketedPaste: false,
      focusEvents: false,
      mouseTracking: false,
      kittyGraphics: false,
      iterm2Images: false,
      sixelGraphics: false,
      syncOutput: false,
      hyperlinks: false,
      undercurl: false,
      styledUnderlines: false,
      overline: false,
      cursorShapes: false,
      unicodeLevel: 'none',
      unicodeVersion: 0,
      performanceClass: 'low',
    },
    env: { TERM: 'dumb' },
  },
};

for (const preset of Object.values(CAPABILITY_PRESETS)) {
  Object.freeze(preset.capabilities);
  if (preset.env) Object.freeze(preset.env);
  Object.freeze(preset);
}
Object.freeze(CAPABILITY_PRESETS);

// ── Fixture factory ────────────────────────────────────────────────────

/**
 * Create a capability fixture from a preset.
 *
 * Returns a mock capabilities object and a helper to run code in the
 * context of those capabilities.
 */
export function createCapabilityFixture(preset: CapabilityPreset): {
  /** The mock capability record derived from the preset. */
  mockCapabilities: Record<string, unknown>;
  /** Run a function with the mock capabilities passed in. */
  withCapability<T>(fn: (caps: Record<string, unknown>) => T): T;
} {
  const mockCapabilities: Record<string, unknown> = { ...preset.capabilities };

  if (preset.env) {
    mockCapabilities._env = { ...preset.env };
  }

  return {
    mockCapabilities,
    withCapability<T>(fn: (caps: Record<string, unknown>) => T): T {
      return fn(mockCapabilities);
    },
  };
}
