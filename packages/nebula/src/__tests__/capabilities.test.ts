import { beforeEach, describe, expect, it } from 'vitest';
import { detectCapabilities, getCapabilities, resetCapabilitiesCache } from '../capabilities.js';

/**
 * Helper: save current env, apply overrides, run fn, restore.
 */
function withEnv(overrides: Record<string, string | undefined>, fn: () => void): void {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    saved[key] = process.env[key];
  }
  // Apply overrides
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    fn();
  } finally {
    // Restore
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

/** Minimal clean env for deterministic tests */
const CLEAN_ENV: Record<string, string | undefined> = {
  TERM_PROGRAM: undefined,
  TERM_PROGRAM_VERSION: undefined,
  COLORTERM: undefined,
  TERM: undefined,
  KITTY_PID: undefined,
  WT_SESSION: undefined,
  VTE_VERSION: undefined,
  TMUX: undefined,
  LC_TERMINAL: undefined,
  LANG: undefined,
  LC_ALL: undefined,
  NO_COLOR: undefined,
};

describe('capabilities', () => {
  beforeEach(() => {
    resetCapabilitiesCache();
  });

  // ─── Type correctness ──────────────────────────────────────────────────────

  describe('type correctness', () => {
    it('returns all fields as the correct type', () => {
      withEnv(CLEAN_ENV, () => {
        const caps = detectCapabilities();

        // Booleans
        expect(typeof caps.trueColor).toBe('boolean');
        expect(typeof caps.color256).toBe('boolean');
        expect(typeof caps.kittyKeyboard).toBe('boolean');
        expect(typeof caps.bracketedPaste).toBe('boolean');
        expect(typeof caps.focusEvents).toBe('boolean');
        expect(typeof caps.mouseTracking).toBe('boolean');
        expect(typeof caps.kittyGraphics).toBe('boolean');
        expect(typeof caps.iterm2Images).toBe('boolean');
        expect(typeof caps.sixelGraphics).toBe('boolean');
        expect(typeof caps.syncOutput).toBe('boolean');
        expect(typeof caps.hyperlinks).toBe('boolean');
        expect(typeof caps.undercurl).toBe('boolean');

        // String
        expect(typeof caps.terminalName).toBe('string');

        // Number
        expect(typeof caps.unicodeVersion).toBe('number');
      });
    });
  });

  // ─── Caching ───────────────────────────────────────────────────────────────

  describe('caching', () => {
    it('returns cached result on subsequent calls', () => {
      withEnv({ ...CLEAN_ENV, KITTY_PID: '12345' }, () => {
        const first = getCapabilities();
        const second = getCapabilities();
        expect(first).toBe(second); // Same reference = cached
      });
    });

    it('resetCapabilitiesCache clears the cache', () => {
      withEnv({ ...CLEAN_ENV, KITTY_PID: '12345' }, () => {
        const first = getCapabilities();
        expect(first.terminalName).toBe('kitty');
      });

      resetCapabilitiesCache();

      withEnv({ ...CLEAN_ENV, TERM_PROGRAM: 'iTerm.app' }, () => {
        const second = getCapabilities();
        expect(second.terminalName).toBe('iterm2');
      });
    });
  });

  // ─── Terminal detection ────────────────────────────────────────────────────

  describe('terminal detection', () => {
    it('detects kitty when KITTY_PID is set', () => {
      withEnv({ ...CLEAN_ENV, KITTY_PID: '12345' }, () => {
        const caps = detectCapabilities();
        expect(caps.terminalName).toBe('kitty');
        expect(caps.kittyKeyboard).toBe(true);
        expect(caps.kittyGraphics).toBe(true);
        expect(caps.trueColor).toBe(true);
        expect(caps.syncOutput).toBe(true);
        expect(caps.hyperlinks).toBe(true);
        expect(caps.undercurl).toBe(true);
        expect(caps.focusEvents).toBe(true);
      });
    });

    it('detects kitty when TERM_PROGRAM is kitty', () => {
      withEnv({ ...CLEAN_ENV, TERM_PROGRAM: 'kitty' }, () => {
        const caps = detectCapabilities();
        expect(caps.terminalName).toBe('kitty');
        expect(caps.kittyKeyboard).toBe(true);
        expect(caps.kittyGraphics).toBe(true);
      });
    });

    it('detects iTerm2 when TERM_PROGRAM is iTerm.app', () => {
      withEnv({ ...CLEAN_ENV, TERM_PROGRAM: 'iTerm.app' }, () => {
        const caps = detectCapabilities();
        expect(caps.terminalName).toBe('iterm2');
        expect(caps.iterm2Images).toBe(true);
        expect(caps.trueColor).toBe(true);
        expect(caps.syncOutput).toBe(true);
        expect(caps.hyperlinks).toBe(true);
        expect(caps.undercurl).toBe(true);
        expect(caps.focusEvents).toBe(true);
      });
    });

    it('detects WezTerm when TERM_PROGRAM is WezTerm', () => {
      withEnv({ ...CLEAN_ENV, TERM_PROGRAM: 'WezTerm' }, () => {
        const caps = detectCapabilities();
        expect(caps.terminalName).toBe('wezterm');
        expect(caps.kittyKeyboard).toBe(true);
        expect(caps.kittyGraphics).toBe(true);
        expect(caps.iterm2Images).toBe(true);
        expect(caps.sixelGraphics).toBe(true);
        expect(caps.trueColor).toBe(true);
        expect(caps.syncOutput).toBe(true);
        expect(caps.hyperlinks).toBe(true);
        expect(caps.undercurl).toBe(true);
        expect(caps.focusEvents).toBe(true);
      });
    });

    it('detects Windows Terminal when WT_SESSION is set', () => {
      withEnv({ ...CLEAN_ENV, WT_SESSION: 'some-session-id' }, () => {
        const caps = detectCapabilities();
        expect(caps.terminalName).toBe('windows-terminal');
        expect(caps.trueColor).toBe(true);
        expect(caps.focusEvents).toBe(true);
        expect(caps.hyperlinks).toBe(true);
      });
    });

    it('detects alacritty when TERM_PROGRAM is alacritty', () => {
      withEnv({ ...CLEAN_ENV, TERM_PROGRAM: 'alacritty' }, () => {
        const caps = detectCapabilities();
        expect(caps.terminalName).toBe('alacritty');
        expect(caps.syncOutput).toBe(true);
        expect(caps.hyperlinks).toBe(true);
      });
    });

    it('detects foot when TERM_PROGRAM is foot', () => {
      withEnv({ ...CLEAN_ENV, TERM_PROGRAM: 'foot' }, () => {
        const caps = detectCapabilities();
        expect(caps.terminalName).toBe('foot');
        expect(caps.kittyKeyboard).toBe(true);
        expect(caps.sixelGraphics).toBe(true);
        expect(caps.syncOutput).toBe(true);
        expect(caps.hyperlinks).toBe(true);
        expect(caps.undercurl).toBe(true);
        expect(caps.focusEvents).toBe(true);
      });
    });

    it('unknown terminal returns "unknown" name', () => {
      withEnv(CLEAN_ENV, () => {
        const caps = detectCapabilities();
        expect(caps.terminalName).toBe('unknown');
      });
    });

    it('uses lowercased TERM_PROGRAM for unrecognized terminals', () => {
      withEnv({ ...CLEAN_ENV, TERM_PROGRAM: 'MyCustomTerm' }, () => {
        const caps = detectCapabilities();
        expect(caps.terminalName).toBe('mycustomterm');
      });
    });
  });

  // ─── Color detection ──────────────────────────────────────────────────────

  describe('color detection', () => {
    it('detects truecolor when COLORTERM is truecolor', () => {
      withEnv({ ...CLEAN_ENV, COLORTERM: 'truecolor' }, () => {
        const caps = detectCapabilities();
        expect(caps.trueColor).toBe(true);
      });
    });

    it('detects truecolor when COLORTERM is 24bit', () => {
      withEnv({ ...CLEAN_ENV, COLORTERM: '24bit' }, () => {
        const caps = detectCapabilities();
        expect(caps.trueColor).toBe(true);
      });
    });

    it('does not detect truecolor in a bare environment', () => {
      withEnv(CLEAN_ENV, () => {
        const caps = detectCapabilities();
        expect(caps.trueColor).toBe(false);
      });
    });

    it('detects 256-color from TERM variable', () => {
      withEnv({ ...CLEAN_ENV, TERM: 'xterm-256color' }, () => {
        const caps = detectCapabilities();
        expect(caps.color256).toBe(true);
      });
    });
  });

  // ─── Sixel graphics via VTE ────────────────────────────────────────────────

  describe('sixel graphics via VTE', () => {
    it('detects sixel when VTE_VERSION >= 7200', () => {
      withEnv({ ...CLEAN_ENV, VTE_VERSION: '7200' }, () => {
        const caps = detectCapabilities();
        expect(caps.sixelGraphics).toBe(true);
      });
    });

    it('does not detect sixel when VTE_VERSION < 7200', () => {
      withEnv({ ...CLEAN_ENV, VTE_VERSION: '5000' }, () => {
        const caps = detectCapabilities();
        expect(caps.sixelGraphics).toBe(false);
      });
    });
  });

  // ─── Default capabilities ─────────────────────────────────────────────────

  describe('default capabilities', () => {
    it('bracketedPaste is true by default', () => {
      withEnv(CLEAN_ENV, () => {
        const caps = detectCapabilities();
        expect(caps.bracketedPaste).toBe(true);
      });
    });

    it('mouseTracking is true by default', () => {
      withEnv(CLEAN_ENV, () => {
        const caps = detectCapabilities();
        expect(caps.mouseTracking).toBe(true);
      });
    });

    it('unicodeVersion defaults to 15', () => {
      withEnv(CLEAN_ENV, () => {
        const caps = detectCapabilities();
        expect(caps.unicodeVersion).toBe(15);
      });
    });
  });

  // ─── tmux passthrough ─────────────────────────────────────────────────────

  describe('tmux awareness', () => {
    it('still detects terminal inside tmux when TERM_PROGRAM is set', () => {
      withEnv({ ...CLEAN_ENV, TMUX: '/tmp/tmux-1000/default,1234,0', TERM_PROGRAM: 'kitty' }, () => {
        const caps = detectCapabilities();
        expect(caps.terminalName).toBe('kitty');
      });
    });
  });
});
