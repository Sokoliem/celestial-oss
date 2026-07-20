/**
 * Kitty keyboard protocol parsing and control sequences for celesTUI TUI.
 *
 * The Kitty keyboard protocol extends the standard terminal key encoding with
 * unambiguous CSI u sequences that carry:
 * - Unicode codepoint of the key
 * - Modifier bitmask (shift, alt, ctrl, super, hyper, meta, caps/num lock)
 * - Event type (press, repeat, release)
 * - Shifted-key and base-key for full disambiguation
 *
 * Protocol reference: https://sw.kovidgoyal.net/kitty/keyboard-protocol/
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KittyKeyEvent {
  /** Normalized key name (e.g. 'a', 'enter', 'tab') */
  key: string;
  /** The printable character, if any */
  char?: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  /** 'press' | 'repeat' | 'release' */
  eventType: 'press' | 'repeat' | 'release';
  /** The unmodified key — disambiguates Ctrl+I from Tab */
  baseKey: string;
}

// ---------------------------------------------------------------------------
// KittyFlags — bitmask values for enabling protocol features
// ---------------------------------------------------------------------------

export enum KittyFlags {
  DisambiguateEscape = 1,
  ReportEventTypes = 2,
  ReportAlternateKeys = 4,
  ReportAllAsEscape = 8,
  ReportAssociatedText = 16,
}

// ---------------------------------------------------------------------------
// Control Sequences
// ---------------------------------------------------------------------------

const ESC = '\x1b';
const CSI = `${ESC}[`;

export const kittyKeyboard = {
  /** Push Kitty keyboard protocol flags onto the stack. CSI > flags u */
  enable(flags: number): string {
    return `${CSI}>${flags}u`;
  },

  /** Pop all Kitty keyboard protocol entries from the stack. CSI < 99 u */
  disable(): string {
    return `${CSI}<99u`;
  },

  /** Push Kitty keyboard protocol flags onto the stack. CSI > flags u */
  push(flags: number): string {
    return `${CSI}>${flags}u`;
  },

  /** Pop one Kitty keyboard protocol entry from the stack. CSI < 1 u */
  pop(): string {
    return `${CSI}<1u`;
  },
};

// ---------------------------------------------------------------------------
// Special Key Name Map — maps Unicode codepoints to named keys
// ---------------------------------------------------------------------------

const SPECIAL_KEY_NAMES: Record<number, string> = {
  9: 'tab',
  13: 'enter',
  27: 'escape',
  32: 'space',
  127: 'backspace',
};

// ---------------------------------------------------------------------------
// Event Type Map — maps protocol event-type numbers to string names
// ---------------------------------------------------------------------------

const EVENT_TYPE_MAP: Record<number, KittyKeyEvent['eventType']> = {
  1: 'press',
  2: 'repeat',
  3: 'release',
};

// ---------------------------------------------------------------------------
// Kitty Sequence Detection
// ---------------------------------------------------------------------------

/**
 * The Kitty CSI u regex matches sequences of the form:
 *   ESC [ <digits> [: <digits> [: <digits>]] [; <digits> [: <digits>]] u
 *
 * We use this to detect and extract Kitty sequences from a buffer.
 */
const KITTY_CSI_U_REGEX = /\x1b\[(\d+)(?::(\d*)(?::(\d+))?)?(?:;(\d+)(?::(\d+))?)?u/g;

/**
 * Returns true if the buffer contains at least one Kitty protocol CSI u sequence.
 */
export function isKittySequence(data: Buffer): boolean {
  const str = data.toString('utf-8');
  KITTY_CSI_U_REGEX.lastIndex = 0;
  return KITTY_CSI_U_REGEX.test(str);
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Resolve a Unicode codepoint to a normalized key name.
 * Special keys (tab, enter, escape, etc.) get named strings.
 * Printable characters get their string representation.
 */
function codepointToKeyName(codepoint: number): string {
  const special = SPECIAL_KEY_NAMES[codepoint];
  if (special) {
    return special;
  }
  // Printable character range
  return String.fromCodePoint(codepoint);
}

/**
 * Returns the printable character for a codepoint, or undefined for
 * non-printable/special keys.
 */
function codepointToChar(codepoint: number): string | undefined {
  // Space is printable
  if (codepoint === 32) return ' ';
  // Standard printable ASCII and beyond, excluding control/special
  if (SPECIAL_KEY_NAMES[codepoint]) return undefined;
  if (codepoint >= 0x20) return String.fromCodePoint(codepoint);
  return undefined;
}

/**
 * Parse a raw stdin buffer, extracting only Kitty keyboard protocol CSI u
 * sequences. Non-Kitty data is ignored (returns empty array for non-Kitty input).
 *
 * Format: CSI unicode-key-code [: shifted-key [: base-key]] ; [modifiers [: event-type]] u
 *
 * Modifier value = bitmask + 1:
 *   1=shift, 2=alt, 4=ctrl, 8=super, 16=hyper, 32=meta, 64=capslock, 128=numlock
 *
 * Event type: 1=press (default), 2=repeat, 3=release
 */
export function parseKittyKeyInput(data: Buffer): KittyKeyEvent[] {
  const str = data.toString('utf-8');
  const events: KittyKeyEvent[] = [];

  KITTY_CSI_U_REGEX.lastIndex = 0;
  let match = KITTY_CSI_U_REGEX.exec(str);

  while (match !== null) {
    const keycode = parseInt(match[1]!, 10);
    // match[2] = shifted-key (may be empty string)
    // match[3] = base-key
    const baseKeyCode = match[3] ? parseInt(match[3], 10) : keycode;
    const modifiersRaw = match[4] ? parseInt(match[4], 10) : 1;
    const eventTypeRaw = match[5] ? parseInt(match[5], 10) : 1;

    // Decode modifier bitmask (protocol sends bitmask + 1)
    const bitmask = modifiersRaw - 1;
    const shift = (bitmask & 1) !== 0;
    const alt = (bitmask & 2) !== 0;
    const ctrl = (bitmask & 4) !== 0;

    const eventType = EVENT_TYPE_MAP[eventTypeRaw] ?? 'press';

    match = KITTY_CSI_U_REGEX.exec(str);
    const key = codepointToKeyName(keycode);
    const baseKey = codepointToKeyName(baseKeyCode);
    const char = codepointToChar(keycode);

    events.push({
      key,
      char,
      ctrl,
      alt,
      shift,
      eventType,
      baseKey,
    });
  }

  return events;
}
