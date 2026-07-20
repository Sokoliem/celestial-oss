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

export function keyToBuffer(key: string, modifiers?: KeyModifiers): Buffer {
  const ctrl = modifiers?.ctrl ?? false;
  const alt = modifiers?.alt ?? false;
  const shift = modifiers?.shift ?? false;

  if (shift && key.toLowerCase() === 'tab' && !ctrl && !alt) {
    return Buffer.from('\x1b[Z');
  }

  if (ctrl && key.length === 1 && key >= 'a' && key <= 'z') {
    const byte = key.charCodeAt(0) - 0x60;
    if (alt) {
      return Buffer.from([0x1b, byte]);
    }
    return Buffer.from([byte]);
  }

  if (alt && key.length === 1 && key.charCodeAt(0) >= 0x20 && key.charCodeAt(0) <= 0x7e) {
    return Buffer.from([0x1b, key.charCodeAt(0)]);
  }

  const mapped = KEY_MAP[key.toLowerCase()];
  if (mapped) {
    if (alt) {
      return Buffer.concat([Buffer.from([0x1b]), mapped]);
    }
    return mapped;
  }

  if (key.length === 1) {
    const code = key.charCodeAt(0);
    if (code >= 0x20 && code <= 0x7e) {
      if (alt) {
        return Buffer.from([0x1b, code]);
      }
      return Buffer.from([code]);
    }
  }

  throw new Error(
    `telescope: Unknown key "${key}". Use a single printable character or a named key ` +
      `(enter, tab, backspace, escape, space, up, down, left, right, home, end, ` +
      `insert, delete, pageup, pagedown, f1-f12).`,
  );
}
