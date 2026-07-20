import { describe, expect, it } from 'vitest';
import { bracketedPaste, osc52ReadRequest, osc52Write, parseBracketedPaste, parseOsc52Response } from '../clipboard.js';

describe('osc52Write', () => {
  it('produces correct escape sequence with base64 encoding', () => {
    const result = osc52Write('hello');
    // 'hello' in base64 is 'aGVsbG8='
    expect(result).toBe('\x1b]52;c;aGVsbG8=\x07');
  });

  it('handles empty string', () => {
    const result = osc52Write('');
    // '' in base64 is ''
    expect(result).toBe('\x1b]52;c;\x07');
  });

  it('handles unicode text', () => {
    const result = osc52Write('\u{1F600}'); // emoji
    // Verify it starts and ends with the correct escape sequences
    expect(result).toMatch(/^\x1b\]52;c;[A-Za-z0-9+/]+=*\x07$/);
    // Verify round-trip: decode the base64 part
    const match = result.match(/^\x1b\]52;c;(.*)\x07$/);
    expect(match).not.toBeNull();
    const decoded = Buffer.from(match![1]!, 'base64').toString('utf-8');
    expect(decoded).toBe('\u{1F600}');
  });

  it('handles multiline text', () => {
    const text = 'line1\nline2\nline3';
    const result = osc52Write(text);
    const match = result.match(/^\x1b\]52;c;(.*)\x07$/);
    expect(match).not.toBeNull();
    const decoded = Buffer.from(match![1]!, 'base64').toString('utf-8');
    expect(decoded).toBe(text);
  });

  it('matches Nebula clipboard encoding contract', () => {
    const expected = `\x1b]52;c;${Buffer.from('shared').toString('base64')}\x07`;
    expect(osc52Write('shared')).toBe(expected);
  });
});

describe('osc52ReadRequest', () => {
  it('produces correct request sequence', () => {
    const result = osc52ReadRequest();
    expect(result).toBe('\x1b]52;c;?\x07');
  });

  it('matches Nebula clipboard request contract', () => {
    expect(osc52ReadRequest()).toBe('\x1b]52;c;?\x07');
  });
});

describe('parseOsc52Response', () => {
  it('extracts text from response', () => {
    // 'hello' in base64 is 'aGVsbG8='
    const response = '\x1b]52;c;aGVsbG8=\x07';
    const result = parseOsc52Response(response);
    expect(result).toBe('hello');
  });

  it('returns null for non-OSC52 data', () => {
    expect(parseOsc52Response('not an osc52 response')).toBeNull();
    expect(parseOsc52Response('')).toBeNull();
    expect(parseOsc52Response('\x1b[200~some data\x1b[201~')).toBeNull();
  });

  it('handles response with ST terminator (ESC backslash)', () => {
    const response = '\x1b]52;c;aGVsbG8=\x1b\\';
    const result = parseOsc52Response(response);
    expect(result).toBe('hello');
  });

  it('handles unicode in response', () => {
    const encoded = Buffer.from('\u{1F600}').toString('base64');
    const response = `\x1b]52;c;${encoded}\x07`;
    const result = parseOsc52Response(response);
    expect(result).toBe('\u{1F600}');
  });
});

describe('bracketedPaste', () => {
  it('has correct enable sequence', () => {
    expect(bracketedPaste.enable).toBe('\x1b[?2004h');
  });

  it('has correct disable sequence', () => {
    expect(bracketedPaste.disable).toBe('\x1b[?2004l');
  });
});

describe('parseBracketedPaste', () => {
  it('extracts pasted content between markers', () => {
    const data = '\x1b[200~pasted text here\x1b[201~';
    const result = parseBracketedPaste(data);
    expect(result).toBe('pasted text here');
  });

  it('returns null for non-paste data', () => {
    expect(parseBracketedPaste('just regular text')).toBeNull();
    expect(parseBracketedPaste('')).toBeNull();
    expect(parseBracketedPaste('\x1b]52;c;aGVsbG8=\x07')).toBeNull();
  });

  it('handles multiline pasted content', () => {
    const data = '\x1b[200~line1\nline2\nline3\x1b[201~';
    const result = parseBracketedPaste(data);
    expect(result).toBe('line1\nline2\nline3');
  });

  it('handles empty paste', () => {
    const data = '\x1b[200~\x1b[201~';
    const result = parseBracketedPaste(data);
    expect(result).toBe('');
  });
});
