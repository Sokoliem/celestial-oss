const ESC = '\x1b';
const CSI = `${ESC}[`;

export const ansi = {
  /** Move cursor to column x, row y (0-based) */
  cursorTo(x: number, y: number): string {
    return `${CSI}${y + 1};${x + 1}H`;
  },

  /** Move cursor up by n rows (default 1) */
  cursorUp(n = 1): string {
    return `${CSI}${n}A`;
  },

  /** Move cursor down by n rows (default 1) */
  cursorDown(n = 1): string {
    return `${CSI}${n}B`;
  },

  /** Move cursor forward (right) by n columns (default 1) */
  cursorForward(n = 1): string {
    return `${CSI}${n}C`;
  },

  /** Move cursor backward (left) by n columns (default 1) */
  cursorBackward(n = 1): string {
    return `${CSI}${n}D`;
  },

  /** Hide the cursor */
  cursorHide: `${CSI}?25l`,

  /** Show the cursor */
  cursorShow: `${CSI}?25h`,

  /** Clear the entire screen */
  clearScreen: `${CSI}2J`,

  /** Clear the current line */
  clearLine: `${CSI}2K`,

  /** Enter the alternate screen buffer */
  altScreenEnter: `${CSI}?1049h`,

  /** Exit the alternate screen buffer */
  altScreenExit: `${CSI}?1049l`,

  /** Enable mouse tracking (X10 + SGR extended mode) */
  mouseEnable: `${CSI}?1000h${CSI}?1006h`,

  /** Disable mouse tracking (SGR first, then X10) */
  mouseDisable: `${CSI}?1006l${CSI}?1000l`,

  /** Reset all text attributes */
  reset: `${CSI}0m`,

  /**
   * DEC private mode 2026 Synchronized Output sequences to eliminate tearing.
   * Wrapping output between begin and end causes the terminal to
   * buffer all changes and apply them atomically.
   * Supported by Kitty, WezTerm, foot, Windows Terminal, and others.
   */
  syncOutput: {
    /** Begin Synchronized Update — enable mode 2026 */
    begin: `${CSI}?2026h`,
    /** End Synchronized Update — disable mode 2026 */
    end: `${CSI}?2026l`,
  } as const,
};
