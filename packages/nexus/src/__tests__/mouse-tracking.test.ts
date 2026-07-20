import { describe, expect, it } from 'vitest';
import {
  disableMouseTracking,
  enableMouseTracking,
  mouseDisable,
  mouseEnable,
  parseMouseEvent,
  parseSgrPixelMouseEvent,
  parseUrxvt1015MouseEvent,
  parseX10MouseEvent,
} from '../mouse.js';

describe('enableMouseTracking / disableMouseTracking (G5)', () => {
  it('default opts emit 1000h + 1002h + 1006h', () => {
    expect(enableMouseTracking()).toBe('\x1b[?1000h\x1b[?1002h\x1b[?1006h');
    expect(disableMouseTracking()).toBe('\x1b[?1000l\x1b[?1002l\x1b[?1006l');
  });

  it('motion any emits 1000h + 1003h + 1006h (no 1002h)', () => {
    expect(enableMouseTracking({ motion: 'any' })).toBe('\x1b[?1000h\x1b[?1003h\x1b[?1006h');
  });

  it('motion none emits 1000h + 1006h (no motion sub-mode)', () => {
    expect(enableMouseTracking({ motion: 'none' })).toBe('\x1b[?1000h\x1b[?1006h');
  });

  it('pixelPrecision adds 1016h (AC-9.1)', () => {
    expect(enableMouseTracking({ motion: 'any', pixelPrecision: true })).toBe('\x1b[?1000h\x1b[?1003h\x1b[?1006h\x1b[?1016h');
  });

  it('focusEvents adds 1004h bundled with mouse enable', () => {
    expect(enableMouseTracking({ motion: 'button', focusEvents: true })).toBe('\x1b[?1000h\x1b[?1002h\x1b[?1006h\x1b[?1004h');
  });

  it('mouseEnable / mouseDisable constants remain byte-identical (AC-9.2)', () => {
    expect(mouseEnable).toBe('\x1b[?1000h\x1b[?1002h\x1b[?1006h');
    expect(mouseDisable).toBe('\x1b[?1000l\x1b[?1002l\x1b[?1006l');
    expect(enableMouseTracking({ motion: 'button' })).toBe(mouseEnable);
    expect(disableMouseTracking({ motion: 'button' })).toBe(mouseDisable);
  });

  it('sgrEncoding false drops 1006h', () => {
    expect(enableMouseTracking({ motion: 'button', sgrEncoding: false })).toBe('\x1b[?1000h\x1b[?1002h');
  });
});

describe('extended mouse buttons (G6)', () => {
  it('SGR button 3 (back) — press (AC-10.1)', () => {
    const ev = parseMouseEvent('\x1b[<128;10;5M');
    expect(ev).not.toBeNull();
    expect(ev!.type).toBe('press');
    expect(ev!.button).toBe(3);
  });

  it('SGR button 4 (forward) — press', () => {
    const ev = parseMouseEvent('\x1b[<129;10;5M');
    expect(ev!.button).toBe(4);
    expect(ev!.type).toBe('press');
  });

  it('SGR scroll-left = 66 (AC-10.2)', () => {
    const ev = parseMouseEvent('\x1b[<66;1;1M');
    expect(ev!.type).toBe('scroll-left');
  });

  it('SGR scroll-right = 67', () => {
    const ev = parseMouseEvent('\x1b[<67;1;1M');
    expect(ev!.type).toBe('scroll-right');
  });

  it('encoding tag is "sgr" for SGR', () => {
    const ev = parseMouseEvent('\x1b[<0;1;1M');
    expect(ev!.encoding).toBe('sgr');
  });
});

describe('parseUrxvt1015MouseEvent (G4)', () => {
  it('parses urxvt 1015 left press', () => {
    const ev = parseUrxvt1015MouseEvent('\x1b[0;3;4M');
    expect(ev).toEqual({
      type: 'press',
      button: 0,
      x: 2,
      y: 3,
      ctrl: false,
      alt: false,
      shift: false,
      encoding: 'urxvt',
    });
  });

  it('returns null on SGR-shaped input', () => {
    expect(parseUrxvt1015MouseEvent('\x1b[<0;1;1M')).toBeNull();
  });
});

describe('parseX10MouseEvent (G4)', () => {
  it('parses X10 left press', () => {
    const ev = parseX10MouseEvent('\x1b[M\x20\x21\x21');
    expect(ev).toEqual({
      type: 'press',
      button: 0,
      x: 0,
      y: 0,
      ctrl: false,
      alt: false,
      shift: false,
      encoding: 'x10',
    });
  });

  it('parses X10 release (button 3)', () => {
    const ev = parseX10MouseEvent('\x1b[M\x23\x21\x21');
    expect(ev!.type).toBe('release');
  });

  it('parses X10 scroll up', () => {
    const ev = parseX10MouseEvent('\x1b[M\x60\x25\x25');
    expect(ev!.type).toBe('scroll-up');
    expect(ev!.x).toBe(4);
    expect(ev!.y).toBe(4);
  });

  it('returns null on SGR input', () => {
    expect(parseX10MouseEvent('\x1b[<0;1;1M')).toBeNull();
  });
});

describe('parseMouseEvent fallback chain', () => {
  it('falls through to urxvt when SGR does not match', () => {
    const ev = parseMouseEvent('\x1b[0;1;1M');
    expect(ev!.encoding).toBe('urxvt');
  });

  it('falls through to X10 when neither SGR nor urxvt match', () => {
    const ev = parseMouseEvent('\x1b[M\x20\x21\x21');
    expect(ev!.encoding).toBe('x10');
  });
});

describe('parseSgrPixelMouseEvent (G5 ext)', () => {
  it('emits pixelX / pixelY and cell-snapped x / y', () => {
    const ev = parseSgrPixelMouseEvent('\x1b[<0;120;48M', 8, 16);
    expect(ev!.pixelX).toBe(120);
    expect(ev!.pixelY).toBe(48);
    expect(ev!.x).toBe(15);
    expect(ev!.y).toBe(3);
  });

  it('returns null on no-match', () => {
    expect(parseSgrPixelMouseEvent('not-mouse', 8, 16)).toBeNull();
  });
});
