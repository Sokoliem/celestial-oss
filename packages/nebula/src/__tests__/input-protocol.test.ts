import { describe, expect, it } from 'vitest';
import { createTerminalInputProtocolDecoder, type TerminalInputEvent } from '../app/input-protocol.js';
import { BRACKETED_PASTE_END, BRACKETED_PASTE_START } from '../clipboard.js';

function bytewise(input: Buffer): TerminalInputEvent[] {
  const decoder = createTerminalInputProtocolDecoder();
  const events: TerminalInputEvent[] = [];
  for (const byte of input) events.push(...decoder.push(Buffer.from([byte])));
  return events;
}

describe('terminal input protocol decoder', () => {
  it('reassembles bracketed paste at every byte boundary before parsing mouse input', () => {
    const content = `one\n\x1b[<0;4;2Mtwo`;
    const events = bytewise(Buffer.from(`${BRACKETED_PASTE_START}${content}${BRACKETED_PASTE_END}a`));

    expect(events).toEqual([
      { type: 'paste', text: content },
      { type: 'keys', data: Buffer.from('a') },
    ]);
  });

  it('reassembles SGR and X11 mouse frames across chunks', () => {
    expect(bytewise(Buffer.from('\x1b[<2;12;7M'))).toEqual([
      {
        type: 'mouse',
        event: { type: 'press', button: 2, x: 11, y: 6, ctrl: false, alt: false, shift: false },
      },
    ]);

    expect(bytewise(Buffer.from([0x1b, 0x5b, 0x4d, 32, 42, 37]))).toEqual([
      {
        type: 'mouse',
        event: { type: 'press', button: 0, x: 9, y: 4, ctrl: false, alt: false, shift: false },
      },
    ]);
  });

  it('reassembles focus and OSC 52 frames while preserving surrounding keys', () => {
    const encoded = Buffer.from('clipboard').toString('base64');
    const events = bytewise(Buffer.from(`a\x1b[I\x1b]52;c;${encoded}\x1b\\b`));

    expect(events).toEqual([
      { type: 'keys', data: Buffer.from('a') },
      { type: 'focus', focused: true },
      { type: 'clipboard', text: 'clipboard' },
      { type: 'keys', data: Buffer.from('b') },
    ]);
  });

  it('does not release an incomplete paste as ordinary key input', () => {
    const decoder = createTerminalInputProtocolDecoder();
    expect(decoder.push(Buffer.from(`${BRACKETED_PASTE_START}partial`))).toEqual([]);
    expect(decoder.pendingKind).toBe('paste');
    expect(decoder.flush()).toEqual([{ type: 'discarded', protocol: 'paste' }]);
  });

  it('reserves ESC ] for OSC instead of releasing it as an Alt+] key', () => {
    const decoder = createTerminalInputProtocolDecoder();
    expect(decoder.push(Buffer.from('\x1b]'))).toEqual([]);
    expect(decoder.pendingKind).toBe('osc');
    expect(decoder.flush()).toEqual([{ type: 'discarded', protocol: 'osc' }]);
  });

  it('consumes fragmented terminal capability responses instead of producing keys', () => {
    expect(bytewise(Buffer.from('\x1b[?1;2;4c'))).toEqual([{ type: 'discarded', protocol: 'query' }]);
    expect(bytewise(Buffer.from('\x1b[>1;4000;0c'))).toEqual([{ type: 'discarded', protocol: 'query' }]);
  });
});
