import { describe, expect, it } from 'vitest';
import { MOUSE_DISABLE, MOUSE_ENABLE, parseMouseInput } from '../mouse.js';

describe('parseMouseInput', () => {
  it('should parse a left click', () => {
    const event = parseMouseInput('\x1b[<0;10;5M');
    expect(event).toEqual({
      type: 'press',
      button: 0,
      x: 9,
      y: 4,
      ctrl: false,
      alt: false,
      shift: false,
    });
  });

  it('should parse a left release', () => {
    const event = parseMouseInput('\x1b[<0;10;5m');
    expect(event).toEqual({
      type: 'release',
      button: 0,
      x: 9,
      y: 4,
      ctrl: false,
      alt: false,
      shift: false,
    });
  });

  it('should parse a right click', () => {
    const event = parseMouseInput('\x1b[<2;1;1M');
    expect(event).not.toBeNull();
    expect(event!.button).toBe(2);
  });

  it('should parse a middle click', () => {
    const event = parseMouseInput('\x1b[<1;1;1M');
    expect(event).not.toBeNull();
    expect(event!.button).toBe(1);
  });

  it('should parse scroll up', () => {
    const event = parseMouseInput('\x1b[<64;5;5M');
    expect(event).not.toBeNull();
    expect(event!.type).toBe('scroll-up');
    expect(event!.button).toBe('none');
  });

  it('should parse scroll down', () => {
    const event = parseMouseInput('\x1b[<65;5;5M');
    expect(event).not.toBeNull();
    expect(event!.type).toBe('scroll-down');
  });

  it('should parse mouse drag with left button held', () => {
    // baseButton 32 = motion + button 0 (left)
    const event = parseMouseInput('\x1b[<32;20;10M');
    expect(event).not.toBeNull();
    expect(event!.type).toBe('move');
    expect(event!.button).toBe(0);
  });

  it('should parse mouse drag with middle button held', () => {
    // baseButton 33 = motion + button 1 (middle)
    const event = parseMouseInput('\x1b[<33;20;10M');
    expect(event).not.toBeNull();
    expect(event!.type).toBe('move');
    expect(event!.button).toBe(1);
  });

  it('should parse mouse drag with right button held', () => {
    // baseButton 34 = motion + button 2 (right)
    const event = parseMouseInput('\x1b[<34;20;10M');
    expect(event).not.toBeNull();
    expect(event!.type).toBe('move');
    expect(event!.button).toBe(2);
  });

  it('should parse mouse move with no button', () => {
    // baseButton 35 = motion + no button
    const event = parseMouseInput('\x1b[<35;20;10M');
    expect(event).not.toBeNull();
    expect(event!.type).toBe('move');
    expect(event!.button).toBe('none');
  });

  it('should parse ctrl+click', () => {
    const event = parseMouseInput('\x1b[<16;5;5M');
    expect(event).not.toBeNull();
    expect(event!.ctrl).toBe(true);
    expect(event!.shift).toBe(false);
    expect(event!.alt).toBe(false);
  });

  it('should parse shift+click', () => {
    const event = parseMouseInput('\x1b[<4;5;5M');
    expect(event).not.toBeNull();
    expect(event!.shift).toBe(true);
  });

  it('should return null for non-mouse input', () => {
    expect(parseMouseInput('hello')).toBeNull();
    expect(parseMouseInput('\x1b[A')).toBeNull(); // arrow key
  });

  it('should convert coordinates to 0-indexed', () => {
    const event = parseMouseInput('\x1b[<0;1;1M');
    expect(event!.x).toBe(0);
    expect(event!.y).toBe(0);
  });
});

describe('mouse control sequences', () => {
  it('MOUSE_ENABLE should contain basic mouse tracking mode', () => {
    expect(MOUSE_ENABLE).toContain('1000h');
  });

  it('MOUSE_DISABLE should contain basic mouse tracking disable', () => {
    expect(MOUSE_DISABLE).toContain('1000l');
  });

  it('MOUSE_ENABLE should contain motion tracking mode', () => {
    expect(MOUSE_ENABLE).toMatch(/100[23]h/);
  });
});

describe('X11 normal mouse parsing', () => {
  it('parses X11 normal mouse click (button 0)', () => {
    // ESC [ M cb cx cy where cb=32+0=0x20, cx=32+10=0x2a, cy=32+5=0x25
    const data = '\x1b[M' + String.fromCharCode(32, 42, 37);
    const event = parseMouseInput(data);
    expect(event).not.toBeNull();
    expect(event!.type).toBe('press');
    expect(event!.button).toBe(0);
    expect(event!.x).toBe(9); // 42-32-1 = 9
    expect(event!.y).toBe(4); // 37-32-1 = 4
  });

  it('parses X11 normal mouse release (button 3)', () => {
    const data = '\x1b[M' + String.fromCharCode(35, 42, 37); // 35 = 32+3 = release
    const event = parseMouseInput(data);
    expect(event).not.toBeNull();
    expect(event!.type).toBe('release');
  });

  it('parses X11 normal scroll up', () => {
    const data = '\x1b[M' + String.fromCharCode(96, 42, 37); // 96 = 32+64 = scroll-up
    const event = parseMouseInput(data);
    expect(event).not.toBeNull();
    expect(event!.type).toBe('scroll-up');
  });

  it('parses X11 normal scroll down', () => {
    const data = '\x1b[M' + String.fromCharCode(97, 42, 37); // 97 = 32+65 = scroll-down
    const event = parseMouseInput(data);
    expect(event).not.toBeNull();
    expect(event!.type).toBe('scroll-down');
  });
});
