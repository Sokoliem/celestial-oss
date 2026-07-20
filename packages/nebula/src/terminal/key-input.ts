export interface KeyEvent {
  /** Normalized key name: 'a', 'enter', 'up', 'f1', etc. */
  key: string;
  /** The printable character, if any */
  char?: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}

const TILDE_KEY_MAP: Record<string, string> = {
  '1': 'home',
  '2': 'insert',
  '3': 'delete',
  '4': 'end',
  '5': 'pageup',
  '6': 'pagedown',
  '15': 'f5',
  '17': 'f6',
  '18': 'f7',
  '19': 'f8',
  '20': 'f9',
  '21': 'f10',
  '23': 'f11',
  '24': 'f12',
};

const CSI_LETTER_MAP: Record<string, string> = {
  A: 'up',
  B: 'down',
  C: 'right',
  D: 'left',
  H: 'home',
  F: 'end',
};

const SS3_MAP: Record<string, string> = {
  P: 'f1',
  Q: 'f2',
  R: 'f3',
  S: 'f4',
};

function makeKey(key: string, options?: { char?: string; ctrl?: boolean; alt?: boolean; shift?: boolean }): KeyEvent {
  return {
    key,
    char: options?.char,
    ctrl: options?.ctrl ?? false,
    alt: options?.alt ?? false,
    shift: options?.shift ?? false,
  };
}

export function parseKeyInput(data: Buffer): KeyEvent[] {
  const events: KeyEvent[] = [];
  let i = 0;

  while (i < data.length) {
    const byte = data[i]!;
    if (byte === 0x1b) {
      if (i + 1 >= data.length) {
        events.push(makeKey('escape'));
        i++;
        continue;
      }

      const next = data[i + 1]!;
      if (next === 0x5b) {
        const result = parseCSI(data, i + 2);
        if (result) {
          events.push(result.event);
          i = result.nextIndex;
          continue;
        }
        events.push(makeKey('escape'));
        i++;
        continue;
      }

      if (next === 0x4f) {
        if (i + 2 < data.length) {
          const ss3Char = String.fromCharCode(data[i + 2]!);
          const keyName = SS3_MAP[ss3Char];
          if (keyName) {
            events.push(makeKey(keyName));
            i += 3;
            continue;
          }
        }
        events.push(makeKey('escape'));
        i++;
        continue;
      }

      if (next >= 0x20 && next <= 0x7e) {
        const ch = String.fromCharCode(next);
        const isUpper = next >= 0x41 && next <= 0x5a;
        events.push(makeKey(ch, { char: ch, alt: true, shift: isUpper }));
        i += 2;
        continue;
      }

      events.push(makeKey('escape'));
      i++;
      continue;
    }

    if (byte === 0x09) {
      events.push(makeKey('tab'));
      i++;
      continue;
    }

    if (byte === 0x0d) {
      events.push(makeKey('enter'));
      i++;
      continue;
    }

    if (byte === 0x7f || byte === 0x08) {
      events.push(makeKey('backspace'));
      i++;
      continue;
    }

    if (byte >= 0x01 && byte <= 0x1a) {
      const letter = String.fromCharCode(byte + 0x60);
      events.push(makeKey(letter, { ctrl: true }));
      i++;
      continue;
    }

    if (byte >= 0x20 && byte <= 0x7e) {
      const ch = String.fromCharCode(byte);
      if (ch === ' ') {
        events.push(makeKey('space', { char: ' ' }));
      } else {
        const isUpper = byte >= 0x41 && byte <= 0x5a;
        events.push(makeKey(ch, { char: ch, shift: isUpper }));
      }
      i++;
      continue;
    }

    i++;
  }

  return events;
}

function parseCSI(data: Buffer, start: number): { event: KeyEvent; nextIndex: number } | null {
  let i = start;
  let params = '';
  while (i < data.length) {
    const b = data[i]!;
    if ((b >= 0x30 && b <= 0x39) || b === 0x3b) {
      params += String.fromCharCode(b);
      i++;
    } else {
      break;
    }
  }

  if (i >= data.length) {
    return null;
  }

  const finalByte = data[i]!;
  const finalChar = String.fromCharCode(finalByte);
  i++;

  if (finalChar === '~') {
    const keyName = TILDE_KEY_MAP[params];
    if (keyName) {
      return { event: makeKey(keyName), nextIndex: i };
    }
    return null;
  }

  if (finalChar === 'M' && params === '' && i + 2 < data.length) {
    return null;
  }

  if (finalChar === '<') {
    while (i < data.length && data[i] !== 0x4d && data[i] !== 0x6d) i++;
    if (i < data.length) i++;
    return null;
  }

  if (finalChar === 'Z') {
    return { event: makeKey('tab', { shift: true }), nextIndex: i };
  }

  const letterKey = CSI_LETTER_MAP[finalChar];
  if (letterKey) {
    return { event: makeKey(letterKey), nextIndex: i };
  }

  return null;
}
