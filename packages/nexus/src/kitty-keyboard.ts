/**
 * Kitty keyboard progressive-enhancement protocol (CSI u).
 *
 * Atlas declares `kittyKeyboard` per `packages/atlas/src/types.ts:14`.
 * Callers MUST gate the enable sequence on that flag — terminals that
 * don't support the protocol will echo the escape as visible text.
 * Use `withKittyKeyboard(caps, flags)` for safe gating.
 *
 * Per PRD §10 Failure mode 7: nested-enable callers should always emit
 * `kittyKeyboardDisable` on unmount even if the outer's flags are
 * presumed restored.
 */

export interface KittyKeyboardFlags {
  /** Disambiguate ambiguous escapes (Esc / Alt-key). 0b00001 */
  readonly disambiguateEscape: boolean;
  /** Report release + repeat as well as press. 0b00010 */
  readonly reportEvents: boolean;
  /** Include alternate codepoints for keys with multiple layouts. 0b00100 */
  readonly reportAlternateKeys: boolean;
  /** Report all keys as escape codes (no plain printable). 0b01000 */
  readonly reportAllAsEscape: boolean;
  /** Include associated text (e.g. composed input). 0b10000 */
  readonly reportAssociatedText: boolean;
}

export const DEFAULT_KITTY_KEYBOARD_FLAGS: KittyKeyboardFlags = {
  disambiguateEscape: true,
  reportEvents: true,
  reportAlternateKeys: true,
  reportAllAsEscape: false,
  reportAssociatedText: false,
};

function flagBits(flags: KittyKeyboardFlags): number {
  let bits = 0;
  if (flags.disambiguateEscape) bits |= 0b00001;
  if (flags.reportEvents) bits |= 0b00010;
  if (flags.reportAlternateKeys) bits |= 0b00100;
  if (flags.reportAllAsEscape) bits |= 0b01000;
  if (flags.reportAssociatedText) bits |= 0b10000;
  return bits;
}

/** Push a flag set onto the terminal's progressive-enhancement stack. */
export function kittyKeyboardEnable(flags?: Partial<KittyKeyboardFlags>): string {
  const resolved: KittyKeyboardFlags = { ...DEFAULT_KITTY_KEYBOARD_FLAGS, ...flags };
  return `\x1b[>${flagBits(resolved)}u`;
}

/** Pop most-recently-pushed flag set. */
export const kittyKeyboardDisable = '\x1b[<u' as const;

/** Defensive cleanup — pops up to 5 nested flag sets. Use in app-exit paths. */
export const kittyKeyboardReset = '\x1b[<u\x1b[<u\x1b[<u\x1b[<u\x1b[<u' as const;

export interface KittyKeyEvent {
  readonly type: 'press' | 'release' | 'repeat';
  readonly codepoint: number;
  readonly altCodepoint?: number;
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
  readonly meta: boolean;
  readonly hyper: boolean;
  readonly superKey: boolean;
  readonly capsLock: boolean;
  readonly numLock: boolean;
  /** Associated text — excluded from telemetry (PRD §13). */
  readonly text?: string;
}

// Modifier bitfield from the kitty protocol (subtract 1 from raw value).
const MOD_SHIFT = 0b00000001;
const MOD_ALT = 0b00000010;
const MOD_CTRL = 0b00000100;
const MOD_SUPER = 0b00001000;
const MOD_HYPER = 0b00010000;
const MOD_META = 0b00100000;
const MOD_CAPS = 0b01000000;
const MOD_NUM = 0b10000000;

function decodeKittyEventKind(rawEvent: number): KittyKeyEvent['type'] {
  // Encoding: 1 = press, 2 = repeat, 3 = release.
  if (rawEvent === 2) return 'repeat';
  if (rawEvent === 3) return 'release';
  return 'press';
}

/**
 * Parse a kitty keyboard CSI u event:
 *   `\x1b[codepoint[:altCodepoint];modifiers[:eventType];textCodepoint(s)u`
 *
 * All sections after the codepoint are optional.
 */
export function parseKittyKeyboardEvent(data: string): KittyKeyEvent | null {
  const match = /^\x1b\[((?:\d+)(?::\d+)*)?(?:;((?:\d+)(?::\d+)*))?(?:;((?:\d+)(?::\d+)*))?u$/.exec(data);
  if (!match) return null;

  const codeSection = match[1];
  if (!codeSection) return null;
  const codeParts = codeSection.split(':');
  const codepoint = parseInt(codeParts[0]!, 10);
  if (Number.isNaN(codepoint)) return null;
  const altRaw = codeParts[1] !== undefined ? parseInt(codeParts[1]!, 10) : undefined;
  const altCodepoint = altRaw !== undefined && !Number.isNaN(altRaw) ? altRaw : undefined;

  let modifiers = 0;
  let eventKind: KittyKeyEvent['type'] = 'press';
  if (match[2]) {
    const modParts = match[2].split(':');
    const rawMod = parseInt(modParts[0]!, 10);
    if (!Number.isNaN(rawMod)) modifiers = Math.max(0, rawMod - 1);
    if (modParts[1] !== undefined) {
      const rawEvent = parseInt(modParts[1]!, 10);
      if (!Number.isNaN(rawEvent)) eventKind = decodeKittyEventKind(rawEvent);
    }
  }

  let text: string | undefined;
  if (match[3]) {
    const textParts = match[3]
      .split(':')
      .map((p) => parseInt(p, 10))
      .filter((n) => !Number.isNaN(n) && n > 0);
    if (textParts.length > 0) {
      text = String.fromCodePoint(...textParts);
    }
  }

  return {
    type: eventKind,
    codepoint,
    altCodepoint,
    ctrl: (modifiers & MOD_CTRL) !== 0,
    alt: (modifiers & MOD_ALT) !== 0,
    shift: (modifiers & MOD_SHIFT) !== 0,
    meta: (modifiers & MOD_META) !== 0,
    hyper: (modifiers & MOD_HYPER) !== 0,
    superKey: (modifiers & MOD_SUPER) !== 0,
    capsLock: (modifiers & MOD_CAPS) !== 0,
    numLock: (modifiers & MOD_NUM) !== 0,
    text,
  };
}

/** Capability-gated convenience wrapper. Returns empty strings when unsupported. */
export function withKittyKeyboard(
  caps: { readonly kittyKeyboard: boolean },
  flags?: Partial<KittyKeyboardFlags>,
): { readonly enable: string; readonly disable: string } {
  if (!caps.kittyKeyboard) return { enable: '', disable: '' };
  return { enable: kittyKeyboardEnable(flags), disable: kittyKeyboardDisable };
}
