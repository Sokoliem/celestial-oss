import { describe, expect, it } from 'vitest';
import { canvas } from '../canvas.js';
import { resolveCanvasMode } from '../resolve-mode.js';

describe('resolveCanvasMode — explicit modes', () => {
  it('passes braille through unchanged', () => {
    expect(resolveCanvasMode('braille')).toBe('braille');
  });

  it('passes sextant through unchanged', () => {
    expect(resolveCanvasMode('sextant')).toBe('sextant');
  });

  it('passes octant through unchanged even when caps say it is unsupported', () => {
    // Explicit caller request beats capability snapshot.
    expect(resolveCanvasMode('octant', { unicodeOctant: false })).toBe('octant');
  });

  it('passes quarter and halfblock through unchanged', () => {
    expect(resolveCanvasMode('quarter')).toBe('quarter');
    expect(resolveCanvasMode('halfblock')).toBe('halfblock');
  });
});

describe('resolveCanvasMode — auto mode', () => {
  it('picks octant when caps.unicodeOctant is true', () => {
    expect(resolveCanvasMode('auto', { unicodeOctant: true })).toBe('octant');
  });

  it('picks sextant when octant is unsupported (the primary fallback)', () => {
    expect(resolveCanvasMode('auto', { unicodeOctant: false, unicodeSextant: true })).toBe('sextant');
  });

  it('picks braille when neither octant nor sextant is available', () => {
    expect(resolveCanvasMode('auto', { unicodeOctant: false, unicodeSextant: false, unicodeBraille: true })).toBe('braille');
  });

  it('picks quarter as the deepest fallback', () => {
    expect(resolveCanvasMode('auto', { unicodeOctant: false, unicodeSextant: false, unicodeBraille: false })).toBe('quarter');
  });

  it('defaults to sextant when no capability snapshot is provided (sextants assumed widely available)', () => {
    expect(resolveCanvasMode('auto')).toBe('sextant');
    expect(resolveCanvasMode('auto', {})).toBe('sextant');
  });

  it('defaults each capability conservatively when partially specified', () => {
    // Only octant given; sextant defaults to true, so we still get sextant.
    expect(resolveCanvasMode('auto', { unicodeOctant: false })).toBe('sextant');
    // Only sextant given; octant defaults to false (conservative).
    expect(resolveCanvasMode('auto', { unicodeSextant: true })).toBe('sextant');
  });

  it('upgrades to octant once explicitly enabled in caps', () => {
    // Same shape as above but with octant flipped on — must upgrade.
    expect(resolveCanvasMode('auto', { unicodeOctant: true, unicodeSextant: true })).toBe('octant');
  });
});

describe('canvas — accepts auto mode and forwards to resolver', () => {
  it('canvas(_, _, "auto") with no caps picks sextant', () => {
    const c = canvas(1, 1, 'auto');
    // Sextant has subRows=3.
    expect(c.pixelHeight).toBe(3);
  });

  it('canvas(_, _, "auto", { unicodeOctant: true }) picks octant', () => {
    const c = canvas(1, 1, 'auto', { unicodeOctant: true });
    // Octant has subRows=4.
    expect(c.pixelHeight).toBe(4);
  });

  it('canvas(_, _, undefined) preserves the legacy braille default', () => {
    const c = canvas(1, 1);
    // Braille has subRows=4.
    expect(c.pixelHeight).toBe(4);
  });
});
