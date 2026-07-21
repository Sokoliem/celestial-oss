import { BRACKETED_PASTE_END, BRACKETED_PASTE_START, matchOsc52Response } from '../clipboard.js';
import { parseMouseInputFromBuffer } from '../mouse.js';
import type { MouseEventData } from '../types.js';

const ESC = 0x1b;
const BEL = 0x07;
const ST = Buffer.from('\x1b\\', 'ascii');
const PASTE_START = Buffer.from(BRACKETED_PASTE_START, 'ascii');
const PASTE_END = Buffer.from(BRACKETED_PASTE_END, 'ascii');
const FOCUS_IN = Buffer.from('\x1b[I', 'ascii');
const FOCUS_OUT = Buffer.from('\x1b[O', 'ascii');
const SGR_MOUSE = Buffer.from('\x1b[<', 'ascii');
const X11_MOUSE = Buffer.from('\x1b[M', 'ascii');
const PRIMARY_ATTRIBUTES = Buffer.from('\x1b[?', 'ascii');
const SECONDARY_ATTRIBUTES = Buffer.from('\x1b[>', 'ascii');
const OSC = Buffer.from('\x1b]', 'ascii');
const MAX_INPUT_BYTES = 4 * 1024 * 1024;
const MAX_OSC_BYTES = 2 * 1024 * 1024;
const MAX_MOUSE_BYTES = 64;

export type TerminalInputEvent =
  | { type: 'keys'; data: Buffer }
  | { type: 'paste'; text: string }
  | { type: 'clipboard'; text: string }
  | { type: 'focus'; focused: boolean }
  | { type: 'mouse'; event: MouseEventData }
  | { type: 'discarded'; protocol: 'paste' | 'osc' | 'mouse' | 'query' | 'overflow' };

export type PendingInputKind = 'ambiguous' | 'paste' | 'osc' | 'mouse' | null;

function beginsWith(value: Buffer, prefix: Buffer): boolean {
  return value.length >= prefix.length && value.subarray(0, prefix.length).equals(prefix);
}

function isPrefixOf(value: Buffer, complete: Buffer): boolean {
  return value.length < complete.length && value.equals(complete.subarray(0, value.length));
}

function earliestTerminator(buffer: Buffer, from: number): { index: number; length: number } | null {
  const bel = buffer.indexOf(BEL, from);
  const st = buffer.indexOf(ST, from);
  if (bel === -1 && st === -1) return null;
  if (bel !== -1 && (st === -1 || bel < st)) return { index: bel, length: 1 };
  return { index: st, length: 2 };
}

function classifyPending(buffer: Buffer): PendingInputKind {
  if (beginsWith(buffer, PASTE_START)) return 'paste';
  if (beginsWith(buffer, OSC) || isPrefixOf(buffer, OSC)) return 'osc';
  if (beginsWith(buffer, SGR_MOUSE) || beginsWith(buffer, X11_MOUSE)) return 'mouse';
  return buffer.length > 0 ? 'ambiguous' : null;
}

/** Stateful terminal protocol decoder. Protocol frames take precedence over key parsing. */
export function createTerminalInputProtocolDecoder(): {
  push(data: Buffer): TerminalInputEvent[];
  flush(): TerminalInputEvent[];
  readonly pendingBytes: number;
  readonly pendingKind: PendingInputKind;
} {
  let pending = Buffer.alloc(0);

  function consume(length: number): void {
    pending = pending.subarray(length);
  }

  function push(data: Buffer): TerminalInputEvent[] {
    if (data.length > 0) pending = pending.length === 0 ? Buffer.from(data) : Buffer.concat([pending, data]);
    const events: TerminalInputEvent[] = [];

    if (pending.length > MAX_INPUT_BYTES && !beginsWith(pending, PASTE_START)) {
      pending = Buffer.alloc(0);
      return [{ type: 'discarded', protocol: 'overflow' }];
    }

    while (pending.length > 0) {
      const escapeIndex = pending.indexOf(ESC);
      if (escapeIndex === -1) {
        events.push({ type: 'keys', data: pending });
        pending = Buffer.alloc(0);
        break;
      }
      if (escapeIndex > 0) {
        events.push({ type: 'keys', data: pending.subarray(0, escapeIndex) });
        consume(escapeIndex);
        continue;
      }

      if (beginsWith(pending, PASTE_START)) {
        const end = pending.indexOf(PASTE_END, PASTE_START.length);
        if (end === -1) {
          if (pending.length > MAX_INPUT_BYTES) {
            pending = Buffer.alloc(0);
            events.push({ type: 'discarded', protocol: 'paste' });
          }
          break;
        }
        events.push({ type: 'paste', text: pending.subarray(PASTE_START.length, end).toString('utf8') });
        consume(end + PASTE_END.length);
        continue;
      }

      if (beginsWith(pending, OSC)) {
        const terminator = earliestTerminator(pending, OSC.length);
        if (!terminator) {
          if (pending.length > MAX_OSC_BYTES) {
            pending = Buffer.alloc(0);
            events.push({ type: 'discarded', protocol: 'osc' });
          }
          break;
        }
        const length = terminator.index + terminator.length;
        const sequence = pending.subarray(0, length).toString('utf8');
        const response = matchOsc52Response(sequence);
        if (response?.start === 0 && response.end === sequence.length) {
          events.push({ type: 'clipboard', text: response.text });
        }
        consume(length);
        continue;
      }

      if (beginsWith(pending, FOCUS_IN) || beginsWith(pending, FOCUS_OUT)) {
        const focused = beginsWith(pending, FOCUS_IN);
        consume(focused ? FOCUS_IN.length : FOCUS_OUT.length);
        events.push({ type: 'focus', focused });
        continue;
      }

      if (beginsWith(pending, SGR_MOUSE)) {
        let end = -1;
        for (let index = SGR_MOUSE.length; index < Math.min(pending.length, MAX_MOUSE_BYTES); index++) {
          if (pending[index] === 0x4d || pending[index] === 0x6d) {
            end = index + 1;
            break;
          }
        }
        if (end === -1) {
          if (pending.length >= MAX_MOUSE_BYTES) {
            consume(MAX_MOUSE_BYTES);
            events.push({ type: 'discarded', protocol: 'mouse' });
          }
          break;
        }
        const frame = pending.subarray(0, end);
        const event = parseMouseInputFromBuffer(frame);
        if (event) events.push({ type: 'mouse', event });
        else events.push({ type: 'discarded', protocol: 'mouse' });
        consume(end);
        continue;
      }

      if (beginsWith(pending, X11_MOUSE)) {
        if (pending.length < 6) break;
        const frame = pending.subarray(0, 6);
        const event = parseMouseInputFromBuffer(frame);
        if (event) events.push({ type: 'mouse', event });
        else events.push({ type: 'discarded', protocol: 'mouse' });
        consume(6);
        continue;
      }

      if (beginsWith(pending, PRIMARY_ATTRIBUTES) || beginsWith(pending, SECONDARY_ATTRIBUTES)) {
        const final = pending.indexOf(0x63, 3);
        if (final === -1) {
          if (pending.length >= MAX_MOUSE_BYTES) {
            consume(MAX_MOUSE_BYTES);
            events.push({ type: 'discarded', protocol: 'query' });
          }
          break;
        }
        const frame = pending.subarray(3, final).toString('ascii');
        if (/^[0-9;]*$/u.test(frame)) {
          consume(final + 1);
          events.push({ type: 'discarded', protocol: 'query' });
          continue;
        }
      }

      const knownPrefixes = [PASTE_START, OSC, FOCUS_IN, FOCUS_OUT, SGR_MOUSE, X11_MOUSE, PRIMARY_ATTRIBUTES, SECONDARY_ATTRIBUTES];
      if (knownPrefixes.some((marker) => isPrefixOf(pending, marker))) break;

      const nextEscape = pending.indexOf(ESC, 1);
      const keyLength = nextEscape === -1 ? pending.length : nextEscape;
      events.push({ type: 'keys', data: pending.subarray(0, keyLength) });
      consume(keyLength);
    }

    return events;
  }

  return {
    push,
    flush(): TerminalInputEvent[] {
      if (pending.length === 0) return [];
      const kind = classifyPending(pending);
      const value = pending;
      pending = Buffer.alloc(0);
      if (kind === 'paste' || kind === 'osc') return [{ type: 'discarded', protocol: kind }];
      return [{ type: 'keys', data: value }];
    },
    get pendingBytes() {
      return pending.length;
    },
    get pendingKind() {
      return classifyPending(pending);
    },
  };
}
