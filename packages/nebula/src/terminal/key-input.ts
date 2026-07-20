export interface KeyEvent {
  /** Normalized key name: 'a', 'enter', 'up', 'f1', etc. */
  key: string;
  /** The printable Unicode scalar, if any. */
  char?: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}

export interface KeyInputDecoder {
  /** Bytes currently retained for a split UTF-8 or terminal escape sequence. */
  readonly pendingBytes: number;
  push(data: Buffer): KeyEvent[];
  flush(): KeyEvent[];
  reset(): void;
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

const MAX_PENDING_BYTES = 64;

function makeKey(key: string, options?: { char?: string; ctrl?: boolean; alt?: boolean; shift?: boolean }): KeyEvent {
  return {
    key,
    char: options?.char,
    ctrl: options?.ctrl ?? false,
    alt: options?.alt ?? false,
    shift: options?.shift ?? false,
  };
}

function parseXtermModifiers(params: string): Pick<KeyEvent, 'ctrl' | 'alt' | 'shift'> | null {
  const parts = params.split(';');
  if (parts.length === 1) return { ctrl: false, alt: false, shift: false };
  if (parts.length !== 2) return null;

  const encoded = Number(parts[1]);
  if (!Number.isInteger(encoded) || encoded < 1 || encoded > 8) return null;

  const mask = encoded - 1;
  return {
    shift: (mask & 1) !== 0,
    alt: (mask & 2) !== 0,
    ctrl: (mask & 4) !== 0,
  };
}

function utf8SequenceLength(first: number): number {
  if (first <= 0x7f) return 1;
  if (first >= 0xc2 && first <= 0xdf) return 2;
  if (first >= 0xe0 && first <= 0xef) return 3;
  if (first >= 0xf0 && first <= 0xf4) return 4;
  return 1;
}

type ScalarResult = { char: string; nextIndex: number } | 'incomplete';

function decodeScalar(data: Buffer, index: number, final: boolean): ScalarResult {
  const length = utf8SequenceLength(data[index]!);
  if (index + length > data.length) {
    if (!final) return 'incomplete';
    return { char: '\uFFFD', nextIndex: data.length };
  }

  if (length > 1) {
    for (let offset = 1; offset < length; offset++) {
      const continuation = data[index + offset]!;
      if ((continuation & 0xc0) !== 0x80) return { char: '\uFFFD', nextIndex: index + 1 };
    }
  }

  const char = data.subarray(index, index + length).toString('utf8');
  return { char: char.includes('\uFFFD') ? '\uFFFD' : char, nextIndex: index + length };
}

type CsiResult = { event: KeyEvent; nextIndex: number } | 'incomplete' | null;

function parseCSI(data: Buffer, start: number, final: boolean): CsiResult {
  let i = start;
  let params = '';
  while (i < data.length) {
    const byte = data[i]!;
    if ((byte >= 0x30 && byte <= 0x39) || byte === 0x3b) {
      params += String.fromCharCode(byte);
      i++;
    } else {
      break;
    }
  }

  if (i >= data.length) return final ? null : 'incomplete';

  const finalChar = String.fromCharCode(data[i]!);
  i++;

  if (finalChar === '~') {
    const keyName = TILDE_KEY_MAP[params.split(';')[0] ?? ''];
    const modifiers = parseXtermModifiers(params);
    return keyName && modifiers ? { event: makeKey(keyName, modifiers), nextIndex: i } : null;
  }

  if (finalChar === 'M' && params === '' && i + 2 >= data.length) return final ? null : 'incomplete';

  if (finalChar === '<') {
    while (i < data.length && data[i] !== 0x4d && data[i] !== 0x6d) i++;
    if (i >= data.length) return final ? null : 'incomplete';
    return null;
  }

  if (finalChar === 'Z') return { event: makeKey('tab', { shift: true }), nextIndex: i };

  const letterKey = CSI_LETTER_MAP[finalChar];
  const modifiers = parseXtermModifiers(params);
  return letterKey && modifiers ? { event: makeKey(letterKey, modifiers), nextIndex: i } : null;
}

function parseChunk(data: Buffer, final: boolean): { events: KeyEvent[]; consumed: number } {
  const events: KeyEvent[] = [];
  let i = 0;

  while (i < data.length) {
    const byte = data[i]!;
    if (byte === 0x1b) {
      if (i + 1 >= data.length) {
        if (!final) break;
        events.push(makeKey('escape'));
        i++;
        continue;
      }

      const next = data[i + 1]!;
      if (next === 0x5b) {
        const result = parseCSI(data, i + 2, final);
        if (result === 'incomplete') break;
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
        if (i + 2 >= data.length) {
          if (!final) break;
        } else {
          const keyName = SS3_MAP[String.fromCharCode(data[i + 2]!)];
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

      if (next >= 0x20) {
        const scalar = decodeScalar(data, i + 1, final);
        if (scalar === 'incomplete') break;
        const isUpper = /^[A-Z]$/.test(scalar.char);
        events.push(makeKey(scalar.char === ' ' ? 'space' : scalar.char, { char: scalar.char, alt: true, shift: isUpper }));
        i = scalar.nextIndex;
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
    if (byte === 0x0d || byte === 0x0a) {
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
      events.push(makeKey(String.fromCharCode(byte + 0x60), { ctrl: true }));
      i++;
      continue;
    }
    if (byte >= 0x20 && byte <= 0x7e) {
      const char = String.fromCharCode(byte);
      events.push(makeKey(char === ' ' ? 'space' : char, { char, shift: /^[A-Z]$/.test(char) }));
      i++;
      continue;
    }
    if (byte >= 0x80) {
      const scalar = decodeScalar(data, i, final);
      if (scalar === 'incomplete') break;
      events.push(makeKey(scalar.char, { char: scalar.char }));
      i = scalar.nextIndex;
      continue;
    }
    i++;
  }

  return { events, consumed: i };
}

/** Parse a complete terminal input chunk. */
export function parseKeyInput(data: Buffer): KeyEvent[] {
  return parseChunk(data, true).events;
}

/**
 * Create a streaming decoder for terminals that split UTF-8 or escape
 * sequences across data callbacks.
 */
export function createKeyInputDecoder(): KeyInputDecoder {
  let pending = Buffer.alloc(0);
  return {
    get pendingBytes(): number {
      return pending.length;
    },
    push(data: Buffer): KeyEvent[] {
      const input = pending.length === 0 ? data : Buffer.concat([pending, data]);
      const final = input.length > MAX_PENDING_BYTES;
      const parsed = parseChunk(input, final);
      pending = parsed.consumed < input.length ? Buffer.from(input.subarray(parsed.consumed)) : Buffer.alloc(0);
      return parsed.events;
    },
    flush(): KeyEvent[] {
      const events = parseChunk(pending, true).events;
      pending = Buffer.alloc(0);
      return events;
    },
    reset(): void {
      pending = Buffer.alloc(0);
    },
  };
}
