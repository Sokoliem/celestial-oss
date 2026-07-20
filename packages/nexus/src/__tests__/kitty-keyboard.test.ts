import { describe, expect, it } from 'vitest';
import {
  DEFAULT_KITTY_KEYBOARD_FLAGS,
  kittyKeyboardDisable,
  kittyKeyboardEnable,
  kittyKeyboardReset,
  parseKittyKeyboardEvent,
  withKittyKeyboard,
} from '../kitty-keyboard.js';

describe('kittyKeyboardEnable', () => {
  it('emits CSI > 0 u when all flags off', () => {
    expect(
      kittyKeyboardEnable({
        disambiguateEscape: false,
        reportEvents: false,
        reportAlternateKeys: false,
        reportAllAsEscape: false,
        reportAssociatedText: false,
      }),
    ).toBe('\x1b[>0u');
  });

  it('emits CSI > 7 u for default flags (1|2|4)', () => {
    expect(kittyKeyboardEnable()).toBe('\x1b[>7u');
  });

  it('emits CSI > 1 u for disambiguate-only', () => {
    expect(
      kittyKeyboardEnable({
        disambiguateEscape: true,
        reportEvents: false,
        reportAlternateKeys: false,
        reportAllAsEscape: false,
        reportAssociatedText: false,
      }),
    ).toBe('\x1b[>1u');
  });

  it('emits CSI > 31 u when every flag is set (full level)', () => {
    expect(
      kittyKeyboardEnable({
        disambiguateEscape: true,
        reportEvents: true,
        reportAlternateKeys: true,
        reportAllAsEscape: true,
        reportAssociatedText: true,
      }),
    ).toBe('\x1b[>31u');
  });

  it('DEFAULT_KITTY_KEYBOARD_FLAGS produces level 7', () => {
    expect(kittyKeyboardEnable(DEFAULT_KITTY_KEYBOARD_FLAGS)).toBe('\x1b[>7u');
  });
});

describe('kittyKeyboardDisable / kittyKeyboardReset', () => {
  it('disable pops one entry', () => {
    expect(kittyKeyboardDisable).toBe('\x1b[<u');
  });

  it('reset pops up to 5 entries', () => {
    expect(kittyKeyboardReset).toBe('\x1b[<u\x1b[<u\x1b[<u\x1b[<u\x1b[<u');
  });
});

describe('parseKittyKeyboardEvent', () => {
  it('parses a bare keystroke (codepoint-only)', () => {
    const ev = parseKittyKeyboardEvent('\x1b[97u');
    expect(ev?.type).toBe('press');
    expect(ev?.codepoint).toBe(97);
    expect(ev?.ctrl).toBe(false);
  });

  it('parses modifiers (ctrl+a = mod 5 ⇒ -1 = 4 = CTRL)', () => {
    const ev = parseKittyKeyboardEvent('\x1b[97;5u');
    expect(ev?.codepoint).toBe(97);
    expect(ev?.ctrl).toBe(true);
    expect(ev?.shift).toBe(false);
  });

  it('parses shift+ctrl (mod 6 = bits 1|4)', () => {
    const ev = parseKittyKeyboardEvent('\x1b[97;6u');
    expect(ev?.ctrl).toBe(true);
    expect(ev?.shift).toBe(true);
  });

  it('parses release event (event type 3)', () => {
    const ev = parseKittyKeyboardEvent('\x1b[97;1:3u');
    expect(ev?.type).toBe('release');
  });

  it('parses repeat event (event type 2)', () => {
    const ev = parseKittyKeyboardEvent('\x1b[97;1:2u');
    expect(ev?.type).toBe('repeat');
  });

  it('parses alternate codepoint', () => {
    const ev = parseKittyKeyboardEvent('\x1b[97:65;1u');
    expect(ev?.codepoint).toBe(97);
    expect(ev?.altCodepoint).toBe(65);
  });

  it('parses associated text', () => {
    const ev = parseKittyKeyboardEvent('\x1b[97;1;97u');
    expect(ev?.text).toBe('a');
  });

  it('returns null on non-match', () => {
    expect(parseKittyKeyboardEvent('not-a-key')).toBeNull();
    expect(parseKittyKeyboardEvent('')).toBeNull();
    expect(parseKittyKeyboardEvent('\x1b[<0;1;1M')).toBeNull();
  });
});

describe('withKittyKeyboard', () => {
  it('returns empty strings when caps.kittyKeyboard is false', () => {
    const result = withKittyKeyboard({ kittyKeyboard: false });
    expect(result.enable).toBe('');
    expect(result.disable).toBe('');
  });

  it('returns real sequences when caps.kittyKeyboard is true', () => {
    const result = withKittyKeyboard({ kittyKeyboard: true });
    expect(result.enable).toBe('\x1b[>7u');
    expect(result.disable).toBe('\x1b[<u');
  });

  it('forwards flag overrides to kittyKeyboardEnable', () => {
    const result = withKittyKeyboard(
      { kittyKeyboard: true },
      { disambiguateEscape: true, reportEvents: false, reportAlternateKeys: false, reportAllAsEscape: false, reportAssociatedText: false },
    );
    expect(result.enable).toBe('\x1b[>1u');
  });
});
