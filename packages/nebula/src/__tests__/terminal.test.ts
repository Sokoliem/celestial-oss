import { describe, expect, it } from 'vitest';
import { ansi, createKeyInputDecoder, parseKeyInput } from '../terminal.js';

// Helper to create a Buffer from hex values
function buf(...bytes: number[]): Buffer {
  return Buffer.from(bytes);
}

// Helper to create a Buffer from a string (escape sequences)
function esc(str: string): Buffer {
  return Buffer.from(str, 'binary');
}

describe('parseKeyInput', () => {
  describe('regular characters', () => {
    it('should parse lowercase letters', () => {
      const events = parseKeyInput(buf(0x61)); // 'a'
      expect(events).toEqual([{ key: 'a', char: 'a', ctrl: false, alt: false, shift: false }]);
    });

    it('should parse uppercase letters', () => {
      const events = parseKeyInput(buf(0x41)); // 'A'
      expect(events).toEqual([{ key: 'A', char: 'A', ctrl: false, alt: false, shift: true }]);
    });

    it('should parse digits', () => {
      const events = parseKeyInput(buf(0x31)); // '1'
      expect(events).toEqual([{ key: '1', char: '1', ctrl: false, alt: false, shift: false }]);
    });

    it('should parse space', () => {
      const events = parseKeyInput(buf(0x20)); // ' '
      expect(events).toEqual([{ key: 'space', char: ' ', ctrl: false, alt: false, shift: false }]);
    });

    it('should parse symbols', () => {
      const events = parseKeyInput(buf(0x2f)); // '/'
      expect(events).toEqual([{ key: '/', char: '/', ctrl: false, alt: false, shift: false }]);
    });

    it('should parse multiple characters in one buffer', () => {
      const events = parseKeyInput(buf(0x61, 0x62, 0x63)); // 'abc'
      expect(events).toHaveLength(3);
      expect(events[0]!.key).toBe('a');
      expect(events[1]!.key).toBe('b');
      expect(events[2]!.key).toBe('c');
    });

    it('parses CJK, emoji, and combining scalars without dropping bytes', () => {
      const events = parseKeyInput(Buffer.from('界🙂e\u0301', 'utf8'));
      expect(events.map((event) => event.char)).toEqual(['界', '🙂', 'e', '\u0301']);
      expect(events.every((event) => event.ctrl === false && event.alt === false)).toBe(true);
    });
  });

  describe('ctrl key combinations', () => {
    it('should parse ctrl+a (0x01)', () => {
      const events = parseKeyInput(buf(0x01));
      expect(events).toEqual([{ key: 'a', char: undefined, ctrl: true, alt: false, shift: false }]);
    });

    it('should parse ctrl+c (0x03)', () => {
      const events = parseKeyInput(buf(0x03));
      expect(events).toEqual([{ key: 'c', char: undefined, ctrl: true, alt: false, shift: false }]);
    });

    it('should parse ctrl+z (0x1A)', () => {
      const events = parseKeyInput(buf(0x1a));
      expect(events).toEqual([{ key: 'z', char: undefined, ctrl: true, alt: false, shift: false }]);
    });

    it('should parse ctrl+l (0x0C)', () => {
      const events = parseKeyInput(buf(0x0c));
      expect(events).toEqual([{ key: 'l', char: undefined, ctrl: true, alt: false, shift: false }]);
    });
  });

  describe('special keys', () => {
    it('should parse enter (0x0D)', () => {
      const events = parseKeyInput(buf(0x0d));
      expect(events).toEqual([{ key: 'enter', char: undefined, ctrl: false, alt: false, shift: false }]);
    });

    it('should parse tab (0x09)', () => {
      const events = parseKeyInput(buf(0x09));
      expect(events).toEqual([{ key: 'tab', char: undefined, ctrl: false, alt: false, shift: false }]);
    });

    it('should parse backspace (0x7F)', () => {
      const events = parseKeyInput(buf(0x7f));
      expect(events).toEqual([{ key: 'backspace', char: undefined, ctrl: false, alt: false, shift: false }]);
    });

    it('should parse standalone escape (0x1B)', () => {
      const events = parseKeyInput(buf(0x1b));
      expect(events).toEqual([{ key: 'escape', char: undefined, ctrl: false, alt: false, shift: false }]);
    });
  });

  describe('arrow keys', () => {
    it('should parse up arrow (\\x1b[A)', () => {
      const events = parseKeyInput(esc('\x1b[A'));
      expect(events).toEqual([{ key: 'up', char: undefined, ctrl: false, alt: false, shift: false }]);
    });

    it('should parse down arrow (\\x1b[B)', () => {
      const events = parseKeyInput(esc('\x1b[B'));
      expect(events).toEqual([{ key: 'down', char: undefined, ctrl: false, alt: false, shift: false }]);
    });

    it('should parse right arrow (\\x1b[C)', () => {
      const events = parseKeyInput(esc('\x1b[C'));
      expect(events).toEqual([{ key: 'right', char: undefined, ctrl: false, alt: false, shift: false }]);
    });

    it('should parse left arrow (\\x1b[D)', () => {
      const events = parseKeyInput(esc('\x1b[D'));
      expect(events).toEqual([{ key: 'left', char: undefined, ctrl: false, alt: false, shift: false }]);
    });
  });

  describe('navigation keys', () => {
    it('should parse home (\\x1b[H)', () => {
      const events = parseKeyInput(esc('\x1b[H'));
      expect(events).toEqual([{ key: 'home', char: undefined, ctrl: false, alt: false, shift: false }]);
    });

    it('should parse home alternate (\\x1b[1~)', () => {
      const events = parseKeyInput(esc('\x1b[1~'));
      expect(events).toEqual([{ key: 'home', char: undefined, ctrl: false, alt: false, shift: false }]);
    });

    it('should parse end (\\x1b[F)', () => {
      const events = parseKeyInput(esc('\x1b[F'));
      expect(events).toEqual([{ key: 'end', char: undefined, ctrl: false, alt: false, shift: false }]);
    });

    it('should parse end alternate (\\x1b[4~)', () => {
      const events = parseKeyInput(esc('\x1b[4~'));
      expect(events).toEqual([{ key: 'end', char: undefined, ctrl: false, alt: false, shift: false }]);
    });

    it('should parse page up (\\x1b[5~)', () => {
      const events = parseKeyInput(esc('\x1b[5~'));
      expect(events).toEqual([{ key: 'pageup', char: undefined, ctrl: false, alt: false, shift: false }]);
    });

    it('should parse page down (\\x1b[6~)', () => {
      const events = parseKeyInput(esc('\x1b[6~'));
      expect(events).toEqual([{ key: 'pagedown', char: undefined, ctrl: false, alt: false, shift: false }]);
    });

    it('should parse delete (\\x1b[3~)', () => {
      const events = parseKeyInput(esc('\x1b[3~'));
      expect(events).toEqual([{ key: 'delete', char: undefined, ctrl: false, alt: false, shift: false }]);
    });

    it('should parse insert (\\x1b[2~)', () => {
      const events = parseKeyInput(esc('\x1b[2~'));
      expect(events).toEqual([{ key: 'insert', char: undefined, ctrl: false, alt: false, shift: false }]);
    });
  });

  describe('function keys', () => {
    it('should parse F1 (\\x1bOP)', () => {
      const events = parseKeyInput(esc('\x1bOP'));
      expect(events).toEqual([{ key: 'f1', char: undefined, ctrl: false, alt: false, shift: false }]);
    });

    it('should parse F2 (\\x1bOQ)', () => {
      const events = parseKeyInput(esc('\x1bOQ'));
      expect(events).toEqual([{ key: 'f2', char: undefined, ctrl: false, alt: false, shift: false }]);
    });

    it('should parse F3 (\\x1bOR)', () => {
      const events = parseKeyInput(esc('\x1bOR'));
      expect(events).toEqual([{ key: 'f3', char: undefined, ctrl: false, alt: false, shift: false }]);
    });

    it('should parse F4 (\\x1bOS)', () => {
      const events = parseKeyInput(esc('\x1bOS'));
      expect(events).toEqual([{ key: 'f4', char: undefined, ctrl: false, alt: false, shift: false }]);
    });

    it('should parse F5 (\\x1b[15~)', () => {
      const events = parseKeyInput(esc('\x1b[15~'));
      expect(events).toEqual([{ key: 'f5', char: undefined, ctrl: false, alt: false, shift: false }]);
    });

    it('should parse F6 (\\x1b[17~)', () => {
      const events = parseKeyInput(esc('\x1b[17~'));
      expect(events).toEqual([{ key: 'f6', char: undefined, ctrl: false, alt: false, shift: false }]);
    });

    it('should parse F7 (\\x1b[18~)', () => {
      const events = parseKeyInput(esc('\x1b[18~'));
      expect(events).toEqual([{ key: 'f7', char: undefined, ctrl: false, alt: false, shift: false }]);
    });

    it('should parse F8 (\\x1b[19~)', () => {
      const events = parseKeyInput(esc('\x1b[19~'));
      expect(events).toEqual([{ key: 'f8', char: undefined, ctrl: false, alt: false, shift: false }]);
    });

    it('should parse F9 (\\x1b[20~)', () => {
      const events = parseKeyInput(esc('\x1b[20~'));
      expect(events).toEqual([{ key: 'f9', char: undefined, ctrl: false, alt: false, shift: false }]);
    });

    it('should parse F10 (\\x1b[21~)', () => {
      const events = parseKeyInput(esc('\x1b[21~'));
      expect(events).toEqual([{ key: 'f10', char: undefined, ctrl: false, alt: false, shift: false }]);
    });

    it('parses Shift+F10 from the xterm modifier parameter', () => {
      const events = parseKeyInput(esc('\x1b[21;2~'));
      expect(events).toEqual([{ key: 'f10', char: undefined, ctrl: false, alt: false, shift: true }]);
    });

    it('should parse F11 (\\x1b[23~)', () => {
      const events = parseKeyInput(esc('\x1b[23~'));
      expect(events).toEqual([{ key: 'f11', char: undefined, ctrl: false, alt: false, shift: false }]);
    });

    it('should parse F12 (\\x1b[24~)', () => {
      const events = parseKeyInput(esc('\x1b[24~'));
      expect(events).toEqual([{ key: 'f12', char: undefined, ctrl: false, alt: false, shift: false }]);
    });
  });

  describe('xterm modifiers', () => {
    it('parses combined modifiers on CSI letter keys', () => {
      const events = parseKeyInput(esc('\x1b[1;8A'));
      expect(events).toEqual([{ key: 'up', char: undefined, ctrl: true, alt: true, shift: true }]);
    });

    it('parses modifiers on CSI function keys F1 through F4', () => {
      const events = parseKeyInput(esc('\x1b[1;3P'));
      expect(events).toEqual([{ key: 'f1', char: undefined, ctrl: false, alt: true, shift: false }]);
    });
  });

  describe('batch input (multiple keys in one buffer)', () => {
    it('should parse multiple regular characters', () => {
      const events = parseKeyInput(buf(0x68, 0x65, 0x6c, 0x6c, 0x6f)); // 'hello'
      expect(events).toHaveLength(5);
      expect(events.map((e) => e.key).join('')).toBe('hello');
    });

    it('should parse mixed regular and ctrl keys', () => {
      const events = parseKeyInput(buf(0x61, 0x03)); // 'a' then ctrl+c
      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({
        key: 'a',
        char: 'a',
        ctrl: false,
        alt: false,
        shift: false,
      });
      expect(events[1]).toEqual({
        key: 'c',
        char: undefined,
        ctrl: true,
        alt: false,
        shift: false,
      });
    });

    it('should parse escape sequence followed by regular char', () => {
      // Up arrow (\x1b[A) then 'x'
      const data = Buffer.concat([esc('\x1b[A'), buf(0x78)]);
      const events = parseKeyInput(data);
      expect(events).toHaveLength(2);
      expect(events[0]!.key).toBe('up');
      expect(events[1]!.key).toBe('x');
    });

    it('should parse multiple escape sequences in a row', () => {
      // Up arrow then Down arrow
      const data = Buffer.concat([esc('\x1b[A'), esc('\x1b[B')]);
      const events = parseKeyInput(data);
      expect(events).toHaveLength(2);
      expect(events[0]!.key).toBe('up');
      expect(events[1]!.key).toBe('down');
    });

    it('should handle empty buffer', () => {
      const events = parseKeyInput(Buffer.alloc(0));
      expect(events).toEqual([]);
    });
  });

  describe('alt key combinations', () => {
    it('should parse alt+a (\\x1b followed by a)', () => {
      const events = parseKeyInput(esc('\x1ba'));
      expect(events).toEqual([{ key: 'a', char: 'a', ctrl: false, alt: true, shift: false }]);
    });

    it('should parse alt+A (\\x1b followed by A)', () => {
      const events = parseKeyInput(esc('\x1bA'));
      expect(events).toEqual([{ key: 'A', char: 'A', ctrl: false, alt: true, shift: true }]);
    });

    it('parses alt plus a Unicode scalar', () => {
      const events = parseKeyInput(Buffer.concat([buf(0x1b), Buffer.from('界', 'utf8')]));
      expect(events).toEqual([{ key: '界', char: '界', ctrl: false, alt: true, shift: false }]);
    });
  });
});

describe('createKeyInputDecoder', () => {
  it('buffers UTF-8 sequences split across terminal chunks', () => {
    const decoder = createKeyInputDecoder();
    const bytes = Buffer.from('🙂', 'utf8');
    expect(decoder.push(bytes.subarray(0, 2))).toEqual([]);
    expect(decoder.pendingBytes).toBe(2);
    expect(decoder.push(bytes.subarray(2))).toEqual([{ key: '🙂', char: '🙂', ctrl: false, alt: false, shift: false }]);
    expect(decoder.pendingBytes).toBe(0);
  });

  it('buffers terminal escape sequences split across chunks', () => {
    const decoder = createKeyInputDecoder();
    expect(decoder.push(buf(0x1b))).toEqual([]);
    expect(decoder.push(Buffer.from('[A', 'ascii'))).toEqual([{ key: 'up', char: undefined, ctrl: false, alt: false, shift: false }]);
  });

  it('flushes a standalone Escape key', () => {
    const decoder = createKeyInputDecoder();
    expect(decoder.push(buf(0x1b))).toEqual([]);
    expect(decoder.flush()).toEqual([{ key: 'escape', char: undefined, ctrl: false, alt: false, shift: false }]);
  });
});

describe('ansi', () => {
  describe('cursor movement', () => {
    it('should produce cursorTo sequence', () => {
      expect(ansi.cursorTo(5, 10)).toBe('\x1b[11;6H');
    });

    it('should produce cursorTo for origin (0,0)', () => {
      expect(ansi.cursorTo(0, 0)).toBe('\x1b[1;1H');
    });

    it('should produce cursorUp with default n=1', () => {
      expect(ansi.cursorUp()).toBe('\x1b[1A');
    });

    it('should produce cursorUp with custom n', () => {
      expect(ansi.cursorUp(5)).toBe('\x1b[5A');
    });

    it('should produce cursorDown with default n=1', () => {
      expect(ansi.cursorDown()).toBe('\x1b[1B');
    });

    it('should produce cursorDown with custom n', () => {
      expect(ansi.cursorDown(3)).toBe('\x1b[3B');
    });

    it('should produce cursorForward with default n=1', () => {
      expect(ansi.cursorForward()).toBe('\x1b[1C');
    });

    it('should produce cursorForward with custom n', () => {
      expect(ansi.cursorForward(10)).toBe('\x1b[10C');
    });

    it('should produce cursorBackward with default n=1', () => {
      expect(ansi.cursorBackward()).toBe('\x1b[1D');
    });

    it('should produce cursorBackward with custom n', () => {
      expect(ansi.cursorBackward(2)).toBe('\x1b[2D');
    });
  });

  describe('cursor visibility', () => {
    it('should produce cursorHide sequence', () => {
      expect(ansi.cursorHide).toBe('\x1b[?25l');
    });

    it('should produce cursorShow sequence', () => {
      expect(ansi.cursorShow).toBe('\x1b[?25h');
    });
  });

  describe('screen control', () => {
    it('should produce clearScreen sequence', () => {
      expect(ansi.clearScreen).toBe('\x1b[2J');
    });

    it('should produce clearLine sequence', () => {
      expect(ansi.clearLine).toBe('\x1b[2K');
    });

    it('should produce altScreenEnter sequence', () => {
      expect(ansi.altScreenEnter).toBe('\x1b[?1049h');
    });

    it('should produce altScreenExit sequence', () => {
      expect(ansi.altScreenExit).toBe('\x1b[?1049l');
    });
  });

  describe('mouse control', () => {
    it('should produce mouseEnable sequence', () => {
      expect(ansi.mouseEnable).toBe('\x1b[?1000h\x1b[?1006h');
    });

    it('should produce mouseDisable sequence', () => {
      expect(ansi.mouseDisable).toBe('\x1b[?1006l\x1b[?1000l');
    });
  });

  describe('reset', () => {
    it('should produce reset sequence', () => {
      expect(ansi.reset).toBe('\x1b[0m');
    });
  });
});
