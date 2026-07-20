import { describe, expect, it } from 'vitest';
import { isKittySequence, KittyFlags, type KittyKeyEvent, kittyKeyboard, parseKittyKeyInput } from '../kitty-keyboard.js';

// ---------------------------------------------------------------------------
// Helper — build a Kitty CSI u sequence from parts
// ---------------------------------------------------------------------------

/**
 * Build a Kitty keyboard protocol escape sequence.
 *
 * Format: CSI unicode-key-code [: shifted-key [: base-key]] ; [modifiers [: event-type]] u
 *
 * @param keycode  Unicode codepoint of the key
 * @param options  Optional modifiers/event-type/base-key
 */
function kittySeq(
  keycode: number,
  options?: {
    modifiers?: number;
    eventType?: number;
    shiftedKey?: number;
    baseKey?: number;
  },
): Buffer {
  let seq = `\x1b[${keycode}`;

  // Add shifted-key and/or base-key after colon separators
  if (options?.shiftedKey !== undefined || options?.baseKey !== undefined) {
    seq += `:${options.shiftedKey ?? ''}`;
    if (options?.baseKey !== undefined) {
      seq += `:${options.baseKey}`;
    }
  }

  // Add modifiers (and optionally event-type) after semicolon
  if (options?.modifiers !== undefined || options?.eventType !== undefined) {
    const mod = options?.modifiers ?? 1; // 1 means no modifiers (value = bitmask + 1)
    seq += `;${mod}`;
    if (options?.eventType !== undefined) {
      seq += `:${options.eventType}`;
    }
  }

  seq += 'u';
  return Buffer.from(seq);
}

// ---------------------------------------------------------------------------
// parseKittyKeyInput
// ---------------------------------------------------------------------------

describe('parseKittyKeyInput', () => {
  it('parses simple "a" press', () => {
    const buf = kittySeq(97); // 'a' = 97
    const events = parseKittyKeyInput(buf);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      key: 'a',
      char: 'a',
      ctrl: false,
      alt: false,
      shift: false,
      eventType: 'press',
      baseKey: 'a',
    } satisfies KittyKeyEvent);
  });

  it('parses key with shift modifier', () => {
    // modifiers value = bitmask + 1, shift bitmask = 1, so modifiers = 2
    const buf = kittySeq(97, { modifiers: 2 });
    const events = parseKittyKeyInput(buf);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      key: 'a',
      shift: true,
      ctrl: false,
      alt: false,
    });
  });

  it('parses key with ctrl modifier', () => {
    // ctrl bitmask = 4, so modifiers = 5
    const buf = kittySeq(97, { modifiers: 5 });
    const events = parseKittyKeyInput(buf);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      key: 'a',
      ctrl: true,
      shift: false,
      alt: false,
    });
  });

  it('parses key with alt modifier', () => {
    // alt bitmask = 2, so modifiers = 3
    const buf = kittySeq(97, { modifiers: 3 });
    const events = parseKittyKeyInput(buf);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      key: 'a',
      alt: true,
      ctrl: false,
      shift: false,
    });
  });

  it('parses key with combined ctrl+shift modifiers', () => {
    // ctrl(4) + shift(1) = 5, modifiers = 6
    const buf = kittySeq(97, { modifiers: 6 });
    const events = parseKittyKeyInput(buf);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      key: 'a',
      ctrl: true,
      shift: true,
      alt: false,
    });
  });

  it('parses key release event', () => {
    // event-type 3 = release
    const buf = kittySeq(97, { modifiers: 1, eventType: 3 });
    const events = parseKittyKeyInput(buf);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      key: 'a',
      eventType: 'release',
    });
  });

  it('parses key repeat event', () => {
    // event-type 2 = repeat
    const buf = kittySeq(97, { modifiers: 1, eventType: 2 });
    const events = parseKittyKeyInput(buf);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      key: 'a',
      eventType: 'repeat',
    });
  });

  it('disambiguates Ctrl+I from Tab', () => {
    // Ctrl+I: keycode=105 ('i'), ctrl modifier
    // ctrl bitmask = 4, modifiers = 5
    const ctrlI = kittySeq(105, { modifiers: 5 });
    const ctrlIEvents = parseKittyKeyInput(ctrlI);

    expect(ctrlIEvents).toHaveLength(1);
    expect(ctrlIEvents[0]).toMatchObject({
      key: 'i',
      ctrl: true,
      baseKey: 'i',
    });

    // Tab: keycode=9
    const tab = kittySeq(9);
    const tabEvents = parseKittyKeyInput(tab);

    expect(tabEvents).toHaveLength(1);
    expect(tabEvents[0]).toMatchObject({
      key: 'tab',
      ctrl: false,
      baseKey: 'tab',
    });
  });

  it('parses Enter key (keycode 13)', () => {
    const buf = kittySeq(13);
    const events = parseKittyKeyInput(buf);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      key: 'enter',
      eventType: 'press',
      baseKey: 'enter',
    });
  });

  it('parses Escape key (keycode 27)', () => {
    const buf = kittySeq(27);
    const events = parseKittyKeyInput(buf);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      key: 'escape',
      eventType: 'press',
      baseKey: 'escape',
    });
  });

  it('parses Backspace key (keycode 127)', () => {
    const buf = kittySeq(127);
    const events = parseKittyKeyInput(buf);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      key: 'backspace',
      eventType: 'press',
      baseKey: 'backspace',
    });
  });

  it('parses Space key (keycode 32)', () => {
    const buf = kittySeq(32);
    const events = parseKittyKeyInput(buf);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      key: 'space',
      char: ' ',
      eventType: 'press',
      baseKey: 'space',
    });
  });

  it('parses sequence with base-key for disambiguation', () => {
    // Ctrl+I with explicit base-key: keycode=105, baseKey=105
    // ctrl bitmask = 4, modifiers = 5
    const buf = kittySeq(105, { modifiers: 5, baseKey: 105 });
    const events = parseKittyKeyInput(buf);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      key: 'i',
      ctrl: true,
      baseKey: 'i',
    });
  });

  it('returns empty array for non-Kitty input', () => {
    // Regular ASCII 'a'
    const buf = Buffer.from('a');
    const events = parseKittyKeyInput(buf);

    expect(events).toEqual([]);
  });

  it('returns empty array for standard CSI arrow sequence', () => {
    // Standard arrow up: ESC [ A
    const buf = Buffer.from('\x1b[A');
    const events = parseKittyKeyInput(buf);

    expect(events).toEqual([]);
  });

  it('parses multiple Kitty sequences in one buffer', () => {
    const seqA = kittySeq(97);
    const seqB = kittySeq(98);
    const combined = Buffer.concat([seqA, seqB]);
    const events = parseKittyKeyInput(combined);

    expect(events).toHaveLength(2);
    expect(events[0]!.key).toBe('a');
    expect(events[1]!.key).toBe('b');
  });
});

// ---------------------------------------------------------------------------
// isKittySequence
// ---------------------------------------------------------------------------

describe('isKittySequence', () => {
  it('returns true for Kitty format CSI u sequence', () => {
    const buf = kittySeq(97);
    expect(isKittySequence(buf)).toBe(true);
  });

  it('returns true for Kitty sequence with modifiers', () => {
    const buf = kittySeq(97, { modifiers: 5, eventType: 2 });
    expect(isKittySequence(buf)).toBe(true);
  });

  it('returns false for standard CSI arrow sequence', () => {
    const buf = Buffer.from('\x1b[A');
    expect(isKittySequence(buf)).toBe(false);
  });

  it('returns false for regular ASCII input', () => {
    const buf = Buffer.from('hello');
    expect(isKittySequence(buf)).toBe(false);
  });

  it('returns false for empty buffer', () => {
    const buf = Buffer.alloc(0);
    expect(isKittySequence(buf)).toBe(false);
  });

  it('returns false for standard CSI tilde sequence', () => {
    // Page Up: ESC [ 5 ~
    const buf = Buffer.from('\x1b[5~');
    expect(isKittySequence(buf)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// kittyKeyboard control sequences
// ---------------------------------------------------------------------------

describe('kittyKeyboard', () => {
  describe('enable', () => {
    it('produces correct escape sequence for DisambiguateEscape flag', () => {
      expect(kittyKeyboard.enable(KittyFlags.DisambiguateEscape)).toBe('\x1b[>1u');
    });

    it('produces correct escape sequence for combined flags', () => {
      const flags = KittyFlags.DisambiguateEscape | KittyFlags.ReportEventTypes | KittyFlags.ReportAlternateKeys;
      expect(kittyKeyboard.enable(flags)).toBe('\x1b[>7u');
    });

    it('produces correct escape sequence for all flags', () => {
      const allFlags =
        KittyFlags.DisambiguateEscape |
        KittyFlags.ReportEventTypes |
        KittyFlags.ReportAlternateKeys |
        KittyFlags.ReportAllAsEscape |
        KittyFlags.ReportAssociatedText;
      expect(kittyKeyboard.enable(allFlags)).toBe('\x1b[>31u');
    });
  });

  describe('disable', () => {
    it('pops all stack entries', () => {
      expect(kittyKeyboard.disable()).toBe('\x1b[<99u');
    });
  });

  describe('push', () => {
    it('produces correct escape sequence (same as enable)', () => {
      expect(kittyKeyboard.push(KittyFlags.DisambiguateEscape)).toBe('\x1b[>1u');
    });
  });

  describe('pop', () => {
    it('pops one stack entry', () => {
      expect(kittyKeyboard.pop()).toBe('\x1b[<1u');
    });
  });
});

// ---------------------------------------------------------------------------
// KittyFlags enum values
// ---------------------------------------------------------------------------

describe('KittyFlags', () => {
  it('has correct bitmask values', () => {
    expect(KittyFlags.DisambiguateEscape).toBe(1);
    expect(KittyFlags.ReportEventTypes).toBe(2);
    expect(KittyFlags.ReportAlternateKeys).toBe(4);
    expect(KittyFlags.ReportAllAsEscape).toBe(8);
    expect(KittyFlags.ReportAssociatedText).toBe(16);
  });
});
