import { describe, expect, it, vi } from 'vitest';
import {
  BRACKETED_PASTE_DISABLE,
  BRACKETED_PASTE_ENABLE,
  BRACKETED_PASTE_END,
  BRACKETED_PASTE_START,
  ClipboardCmd,
  fromBase64,
  osc52Copy,
  osc52PasteRequest,
  parseBracketedPaste,
  parseOsc52Response,
  wrapBracketedPaste,
} from '../clipboard.js';
import { cmdKind } from '../types.js';

// ─── OSC 52 protocol ────────────────────────────────────────────────────────

describe('osc52Copy', () => {
  it('encodes text as base64 in OSC 52 format', () => {
    const seq = osc52Copy('hello');
    const base64 = Buffer.from('hello', 'utf-8').toString('base64');
    expect(seq).toBe(`\x1b]52;c;${base64}\x07`);
  });

  it('handles empty string', () => {
    const seq = osc52Copy('');
    const base64 = Buffer.from('', 'utf-8').toString('base64');
    expect(seq).toBe(`\x1b]52;c;${base64}\x07`);
  });

  it('handles unicode text', () => {
    const seq = osc52Copy('hello 🌍');
    const base64 = Buffer.from('hello 🌍', 'utf-8').toString('base64');
    expect(seq).toBe(`\x1b]52;c;${base64}\x07`);
  });
});

describe('osc52PasteRequest', () => {
  it('generates paste request sequence', () => {
    expect(osc52PasteRequest()).toBe('\x1b]52;c;?\x07');
  });
});

describe('fromBase64', () => {
  it('decodes base64 to string', () => {
    const encoded = Buffer.from('hello world', 'utf-8').toString('base64');
    expect(fromBase64(encoded)).toBe('hello world');
  });
});

// ─── Bracketed paste ────────────────────────────────────────────────────────

describe('bracketed paste constants', () => {
  it('has correct enable sequence', () => {
    expect(BRACKETED_PASTE_ENABLE).toBe('\x1b[?2004h');
  });

  it('has correct disable sequence', () => {
    expect(BRACKETED_PASTE_DISABLE).toBe('\x1b[?2004l');
  });
});

describe('parseBracketedPaste', () => {
  it('returns pasted text from bracketed input', () => {
    const input = `${BRACKETED_PASTE_START}hello world${BRACKETED_PASTE_END}`;
    expect(parseBracketedPaste(input)).toBe('hello world');
  });

  it('returns null for non-bracketed input', () => {
    expect(parseBracketedPaste('hello world')).toBeNull();
  });

  it('returns null when start marker is present but end is missing', () => {
    expect(parseBracketedPaste(`${BRACKETED_PASTE_START}hello`)).toBeNull();
  });

  it('handles multi-line pasted text', () => {
    const text = 'line1\nline2\nline3';
    const input = `${BRACKETED_PASTE_START}${text}${BRACKETED_PASTE_END}`;
    expect(parseBracketedPaste(input)).toBe(text);
  });

  it('handles empty paste', () => {
    const input = `${BRACKETED_PASTE_START}${BRACKETED_PASTE_END}`;
    expect(parseBracketedPaste(input)).toBe('');
  });
});

describe('wrapBracketedPaste', () => {
  it('wraps text in start/end markers when bracketed=true', () => {
    expect(wrapBracketedPaste('hello\nworld', true)).toBe(`${BRACKETED_PASTE_START}hello\nworld${BRACKETED_PASTE_END}`);
  });

  it('preserves multi-line content as a single chunk so child apps do not see N submissions', () => {
    // Regression: cumulative bug was that pastes arrived line-by-line and Claude
    // submitted each line as a separate prompt. Bracketed wrapping must keep the
    // \n characters intact and surrounded by the markers.
    const text = 'line 1\nline 2\nline 3';
    const wrapped = wrapBracketedPaste(text, true);
    expect(wrapped).toBe(`${BRACKETED_PASTE_START}${text}${BRACKETED_PASTE_END}`);
    // Round-trip: parseBracketedPaste recovers the exact text.
    expect(parseBracketedPaste(wrapped)).toBe(text);
  });

  it('normalizes \\r\\n and bare \\r to \\n inside the brackets', () => {
    expect(wrapBracketedPaste('a\r\nb\rc\nd', true)).toBe(`${BRACKETED_PASTE_START}a\nb\nc\nd${BRACKETED_PASTE_END}`);
  });

  it('rewrites \\n to \\r when bracketed=false (treat as Enter keypresses)', () => {
    expect(wrapBracketedPaste('a\nb\nc', false)).toBe('a\rb\rc');
  });
});

// ─── OSC 52 response parsing ────────────────────────────────────────────────

describe('parseOsc52Response', () => {
  it('parses BEL-terminated response', () => {
    const text = 'clipboard content';
    const encoded = Buffer.from(text, 'utf-8').toString('base64');
    const input = `\x1b]52;c;${encoded}\x07`;
    expect(parseOsc52Response(input)).toBe(text);
  });

  it('parses ST-terminated response', () => {
    const text = 'clipboard content';
    const encoded = Buffer.from(text, 'utf-8').toString('base64');
    const input = `\x1b]52;c;${encoded}\x1b\\`;
    expect(parseOsc52Response(input)).toBe(text);
  });

  it('returns null for paste requests (? data)', () => {
    const input = '\x1b]52;c;?\x07';
    expect(parseOsc52Response(input)).toBeNull();
  });

  it('returns null for non-OSC52 input', () => {
    expect(parseOsc52Response('hello')).toBeNull();
  });

  it('returns null for unterminated OSC52', () => {
    const encoded = Buffer.from('test', 'utf-8').toString('base64');
    expect(parseOsc52Response(`\x1b]52;c;${encoded}`)).toBeNull();
  });

  it('rejects malformed and oversized clipboard payloads', () => {
    expect(parseOsc52Response('\x1b]52;c;not-base64!\x07')).toBeNull();
    const oversized = Buffer.alloc(1024 * 1024 + 1, 0x61).toString('base64');
    expect(parseOsc52Response(`\x1b]52;c;${oversized}\x07`)).toBeNull();
  });
});

// ─── ClipboardCmd ───────────────────────────────────────────────────────────

describe('ClipboardCmd', () => {
  it('copyToClipboard returns a Cmd', () => {
    const cmd = ClipboardCmd.copyToClipboard('test', (result) => ({ type: 'copied' as const, result }));
    expect(cmd._tag).toBe('cmd');
  });

  it('requestPaste returns a Cmd', () => {
    const cmd = ClipboardCmd.requestPaste((result) => ({ type: 'pasted' as const, result }));
    expect(cmd._tag).toBe('cmd');
  });

  it('enableBracketedPaste returns a Cmd', () => {
    const cmd = ClipboardCmd.enableBracketedPaste((result) => ({ type: 'enabled' as const, result }));
    expect(cmd._tag).toBe('cmd');
  });

  it('disableBracketedPaste returns a Cmd', () => {
    const cmd = ClipboardCmd.disableBracketedPaste((result) => ({ type: 'disabled' as const, result }));
    expect(cmd._tag).toBe('cmd');
  });

  it('copyToClipboard uses a runtime custom command instead of writing directly', () => {
    const stdoutWrite = vi.spyOn(process.stdout, 'write');
    const cmd = ClipboardCmd.copyToClipboard('test', (result) => ({ type: 'copied' as const, result }));

    const kind = cmdKind(cmd);
    expect(kind.kind).toBe('custom');
    if (kind.kind === 'custom') {
      expect(kind.tag).toBe('clipboard.copy');
      expect(kind.payload).toEqual({ text: 'test' });
    }
    expect(stdoutWrite).not.toHaveBeenCalled();
  });

  it('requestPaste uses a runtime custom command instead of writing directly', () => {
    const stdoutWrite = vi.spyOn(process.stdout, 'write');
    const cmd = ClipboardCmd.requestPaste((result) => ({ type: 'pasted' as const, result }));

    const kind = cmdKind(cmd);
    expect(kind.kind).toBe('custom');
    if (kind.kind === 'custom') {
      expect(kind.tag).toBe('clipboard.paste.request');
    }
    expect(stdoutWrite).not.toHaveBeenCalled();
  });
});
