import type { KeyModifiers } from './types.js';

/** Map of key names to the raw bytes that parseKeyInput expects */
const KEY_MAP: Record<string, Buffer> = {
  enter: Buffer.from([0x0d]),
  return: Buffer.from([0x0d]),
  tab: Buffer.from([0x09]),
  backspace: Buffer.from([0x7f]),
  escape: Buffer.from([0x1b]),
  space: Buffer.from([0x20]),
  up: Buffer.from('\x1b[A'),
  down: Buffer.from('\x1b[B'),
  right: Buffer.from('\x1b[C'),
  left: Buffer.from('\x1b[D'),
  home: Buffer.from('\x1b[1~'),
  end: Buffer.from('\x1b[4~'),
  insert: Buffer.from('\x1b[2~'),
  delete: Buffer.from('\x1b[3~'),
  pageup: Buffer.from('\x1b[5~'),
  pagedown: Buffer.from('\x1b[6~'),
  f1: Buffer.from('\x1bOP'),
  f2: Buffer.from('\x1bOQ'),
  f3: Buffer.from('\x1bOR'),
  f4: Buffer.from('\x1bOS'),
  f5: Buffer.from('\x1b[15~'),
  f6: Buffer.from('\x1b[17~'),
  f7: Buffer.from('\x1b[18~'),
  f8: Buffer.from('\x1b[19~'),
  f9: Buffer.from('\x1b[20~'),
  f10: Buffer.from('\x1b[21~'),
  f11: Buffer.from('\x1b[23~'),
  f12: Buffer.from('\x1b[24~'),
};

const CSI_LETTER_KEYS: Readonly<Record<string, string>> = {
  up: 'A',
  down: 'B',
  right: 'C',
  left: 'D',
  home: 'H',
  end: 'F',
  f1: 'P',
  f2: 'Q',
  f3: 'R',
  f4: 'S',
};

const CSI_TILDE_KEYS: Readonly<Record<string, string>> = {
  insert: '2',
  delete: '3',
  pageup: '5',
  pagedown: '6',
  f5: '15',
  f6: '17',
  f7: '18',
  f8: '19',
  f9: '20',
  f10: '21',
  f11: '23',
  f12: '24',
};

export function keyToBuffer(key: string, modifiers?: KeyModifiers): Buffer {
  const ctrl = modifiers?.ctrl ?? false;
  const alt = modifiers?.alt ?? false;
  const shift = modifiers?.shift ?? false;

  if (shift && key.toLowerCase() === 'tab' && !ctrl && !alt) {
    return Buffer.from('\x1b[Z');
  }

  const lowerKey = key.toLowerCase();
  if (ctrl && lowerKey.length === 1 && lowerKey >= 'a' && lowerKey <= 'z') {
    const byte = lowerKey.charCodeAt(0) - 0x60;
    if (alt) {
      return Buffer.from([0x1b, byte]);
    }
    return Buffer.from([byte]);
  }

  const printableKey = shift && /^[a-z]$/.test(key) ? key.toUpperCase() : key;
  const scalars = [...printableKey];
  if (alt && scalars.length === 1 && scalars[0]!.codePointAt(0)! >= 0x20) {
    return Buffer.concat([Buffer.from([0x1b]), Buffer.from(printableKey, 'utf8')]);
  }

  const mapped = KEY_MAP[lowerKey];
  if (mapped) {
    const modifierCode = 1 + (shift ? 1 : 0) + (alt ? 2 : 0) + (ctrl ? 4 : 0);
    if (modifierCode > 1) {
      const letter = CSI_LETTER_KEYS[lowerKey];
      if (letter) return Buffer.from(`\x1b[1;${modifierCode}${letter}`);
      const tilde = CSI_TILDE_KEYS[lowerKey];
      if (tilde) return Buffer.from(`\x1b[${tilde};${modifierCode}~`);
      throw new Error(`telescope: Modifiers are not supported for the named key "${key}".`);
    }
    return Buffer.from(mapped);
  }

  if (scalars.length === 1 && scalars[0]!.codePointAt(0)! >= 0x20) {
    return Buffer.from(printableKey, 'utf8');
  }

  throw new Error(
    `telescope: Unknown key "${key}". Use a single printable Unicode scalar or a named key ` +
      `(enter, tab, backspace, escape, space, up, down, left, right, home, end, ` +
      `insert, delete, pageup, pagedown, f1-f12).`,
  );
}
