import { describe, expect, it } from 'vitest';
import { mouseDisable, mouseEnable, parseMouseEvent } from '../mouse.js';

describe('parseMouseEvent', () => {
  it('parses left click', () => {
    const event = parseMouseEvent('\x1b[<0;10;5M');
    expect(event).toEqual({
      type: 'press',
      button: 0,
      x: 9,
      y: 4,
      ctrl: false,
      alt: false,
      shift: false,
      encoding: 'sgr',
    });
  });

  it('parses left release', () => {
    const event = parseMouseEvent('\x1b[<0;10;5m');
    expect(event).toEqual({
      type: 'release',
      button: 0,
      x: 9,
      y: 4,
      ctrl: false,
      alt: false,
      shift: false,
      encoding: 'sgr',
    });
  });

  it('parses right click', () => {
    const event = parseMouseEvent('\x1b[<2;1;1M');
    expect(event).toEqual({
      type: 'press',
      button: 2,
      x: 0,
      y: 0,
      ctrl: false,
      alt: false,
      shift: false,
      encoding: 'sgr',
    });
  });

  it('parses middle click', () => {
    const event = parseMouseEvent('\x1b[<1;5;5M');
    expect(event).toEqual({
      type: 'press',
      button: 1,
      x: 4,
      y: 4,
      ctrl: false,
      alt: false,
      shift: false,
      encoding: 'sgr',
    });
  });

  it('parses mouse move', () => {
    const event = parseMouseEvent('\x1b[<32;15;10M');
    expect(event).toEqual({
      type: 'move',
      button: 'none',
      x: 14,
      y: 9,
      ctrl: false,
      alt: false,
      shift: false,
      encoding: 'sgr',
    });
  });

  it('parses scroll up', () => {
    const event = parseMouseEvent('\x1b[<64;5;5M');
    expect(event).toEqual({
      type: 'scroll-up',
      button: 'none',
      x: 4,
      y: 4,
      ctrl: false,
      alt: false,
      shift: false,
      encoding: 'sgr',
    });
  });

  it('parses scroll down', () => {
    const event = parseMouseEvent('\x1b[<65;5;5M');
    expect(event).toEqual({
      type: 'scroll-down',
      button: 'none',
      x: 4,
      y: 4,
      ctrl: false,
      alt: false,
      shift: false,
      encoding: 'sgr',
    });
  });

  it('parses ctrl+click', () => {
    // ctrl adds 16 to button code: 0 + 16 = 16
    const event = parseMouseEvent('\x1b[<16;3;3M');
    expect(event).toEqual({
      type: 'press',
      button: 0,
      x: 2,
      y: 2,
      ctrl: true,
      alt: false,
      shift: false,
      encoding: 'sgr',
    });
  });

  it('parses shift+click', () => {
    // shift adds 4 to button code: 0 + 4 = 4
    const event = parseMouseEvent('\x1b[<4;3;3M');
    expect(event).toEqual({
      type: 'press',
      button: 0,
      x: 2,
      y: 2,
      ctrl: false,
      alt: false,
      shift: true,
      encoding: 'sgr',
    });
  });

  it('parses alt+click', () => {
    // alt adds 8 to button code: 0 + 8 = 8
    const event = parseMouseEvent('\x1b[<8;3;3M');
    expect(event).toEqual({
      type: 'press',
      button: 0,
      x: 2,
      y: 2,
      ctrl: false,
      alt: true,
      shift: false,
      encoding: 'sgr',
    });
  });

  it('parses ctrl+alt+shift+click', () => {
    // 0 + 4 + 8 + 16 = 28
    const event = parseMouseEvent('\x1b[<28;3;3M');
    expect(event).toEqual({
      type: 'press',
      button: 0,
      x: 2,
      y: 2,
      ctrl: true,
      alt: true,
      shift: true,
      encoding: 'sgr',
    });
  });

  it('returns null for invalid input', () => {
    expect(parseMouseEvent('')).toBeNull();
    expect(parseMouseEvent('not-a-mouse-event')).toBeNull();
    expect(parseMouseEvent('\x1b[<abc;def;ghiM')).toBeNull();
    expect(parseMouseEvent('\x1b[<0;10M')).toBeNull(); // missing y
  });

  it('mouseEnable is correct escape string', () => {
    expect(mouseEnable).toBe('\x1b[?1000h\x1b[?1002h\x1b[?1006h');
  });

  it('mouseDisable is correct escape string', () => {
    expect(mouseDisable).toBe('\x1b[?1000l\x1b[?1002l\x1b[?1006l');
  });
});
