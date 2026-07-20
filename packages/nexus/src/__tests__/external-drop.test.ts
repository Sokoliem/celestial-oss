import { describe, expect, it } from 'vitest';
import { parseTerminalFileDrop } from '../external-drop.js';

function b64(s: string): string {
  return Buffer.from(s, 'utf-8').toString('base64');
}

describe('parseTerminalFileDrop', () => {
  it('parses an iTerm2 drag-drop payload', () => {
    const payload = b64('/Users/me/a.txt\n/Users/me/b.txt');
    const result = parseTerminalFileDrop(`\x1b]1337;DragDrop=Files=${payload}\x07`);
    expect(result).toEqual({
      paths: ['/Users/me/a.txt', '/Users/me/b.txt'],
      origin: 'iterm2',
    });
  });

  it('parses a kitty/WezTerm files= payload', () => {
    const payload = b64('/tmp/one.png');
    const result = parseTerminalFileDrop(`\x1b]50;files=${payload}\x1b\\`);
    expect(result).toEqual({
      paths: ['/tmp/one.png'],
      origin: 'kitty',
    });
  });

  it('parses a generic newline-paths bracketed-paste payload', () => {
    const result = parseTerminalFileDrop('\x1b[200~/a.txt\n/b.txt\x1b[201~');
    expect(result).toEqual({
      paths: ['/a.txt', '/b.txt'],
      origin: 'generic',
    });
  });

  it('accepts Windows-style absolute paths in the generic form', () => {
    const result = parseTerminalFileDrop('\x1b[200~C:\\Users\\me\\a.txt\n/posix/path\x1b[201~');
    expect(result?.origin).toBe('generic');
    expect(result?.paths).toEqual(['C:\\Users\\me\\a.txt', '/posix/path']);
  });

  it('returns null when bracketed-paste payload is not all paths', () => {
    expect(parseTerminalFileDrop('\x1b[200~hello world\x1b[201~')).toBeNull();
  });

  it('returns null on completely unrelated input', () => {
    expect(parseTerminalFileDrop('not-a-drop')).toBeNull();
    expect(parseTerminalFileDrop('')).toBeNull();
  });

  it('returns an empty paths array when payload base64 fails to decode usefully', () => {
    // An "empty" base64 payload yields zero paths but the parser still
    // surfaces origin so consumers can log "drop happened but unreadable".
    const result = parseTerminalFileDrop('\x1b]1337;DragDrop=Files=\x07');
    expect(result).toEqual({ paths: [], origin: 'iterm2' });
  });
});
