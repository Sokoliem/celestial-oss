import { describe, expect, it } from 'vitest';
import { getCodec } from '../codec.js';

const codec = getCodec('octant');

describe('octant codec — geometry', () => {
  it('reports 2 sub-columns and 4 sub-rows', () => {
    expect(codec.subCols).toBe(2);
    expect(codec.subRows).toBe(4);
  });

  it('has square pixel aspect (1.0)', () => {
    expect(codec.pixelAspect).toBe(1.0);
  });
});

describe('octant codec — bit layout', () => {
  it('maps (dy, dx) → bit in row-major order', () => {
    expect(codec.dotBit(0, 0)).toBe(0x01);
    expect(codec.dotBit(0, 1)).toBe(0x02);
    expect(codec.dotBit(1, 0)).toBe(0x04);
    expect(codec.dotBit(1, 1)).toBe(0x08);
    expect(codec.dotBit(2, 0)).toBe(0x10);
    expect(codec.dotBit(2, 1)).toBe(0x20);
    expect(codec.dotBit(3, 0)).toBe(0x40);
    expect(codec.dotBit(3, 1)).toBe(0x80);
  });
});

describe('octant codec — full bitmask coverage', () => {
  it('produces a non-empty single-codepoint glyph for every mask 0..255', () => {
    for (let mask = 0; mask < 256; mask++) {
      const ch = codec.toChar(mask);
      expect(ch.length).toBeGreaterThan(0);
      // String.fromCodePoint of a BMP codepoint produces 1 UTF-16 code unit;
      // codepoints beyond the BMP (≥ 0x10000) produce a surrogate pair (2).
      expect([1, 2]).toContain(ch.length);
    }
  });

  it('assigns every mask a unique codepoint', () => {
    const seen = new Set<string>();
    for (let mask = 0; mask < 256; mask++) {
      seen.add(codec.toChar(mask));
    }
    expect(seen.size).toBe(256);
  });
});

describe('octant codec — known legacy mappings', () => {
  it('mask 0x00 → SPACE', () => {
    expect(codec.toChar(0x00)).toBe(' ');
  });

  it('mask 0xFF → FULL BLOCK U+2588', () => {
    expect(codec.toChar(0xff)).toBe('█');
  });

  it('mask 0x0F → UPPER HALF BLOCK U+2580', () => {
    expect(codec.toChar(0x0f)).toBe('▀');
  });

  it('mask 0xF0 → LOWER HALF BLOCK U+2584', () => {
    expect(codec.toChar(0xf0)).toBe('▄');
  });

  it('mask 0x55 → LEFT HALF BLOCK U+258C', () => {
    expect(codec.toChar(0x55)).toBe('▌');
  });

  it('mask 0xAA → RIGHT HALF BLOCK U+2590', () => {
    expect(codec.toChar(0xaa)).toBe('▐');
  });

  it('quadrant patterns route to U+2596–U+259F', () => {
    expect(codec.toChar(0x05)).toBe('▘'); // ▘ UL
    expect(codec.toChar(0x0a)).toBe('▝'); // ▝ UR
    expect(codec.toChar(0x50)).toBe('▖'); // ▖ LL
    expect(codec.toChar(0xa0)).toBe('▗'); // ▗ LR
    expect(codec.toChar(0xa5)).toBe('▚'); // ▚ UL+LR diagonal
    expect(codec.toChar(0x5a)).toBe('▞'); // ▞ UR+LL anti-diagonal
    expect(codec.toChar(0x5f)).toBe('▛'); // ▛ UL+UR+LL
    expect(codec.toChar(0xaf)).toBe('▜'); // ▜ UL+UR+LR
    expect(codec.toChar(0xf5)).toBe('▙'); // ▙ UL+LL+LR
    expect(codec.toChar(0xfa)).toBe('▟'); // ▟ UR+LL+LR
  });
});

describe('octant codec — Unicode 16 range', () => {
  it('non-legacy patterns map into U+1CD00..U+1CDEF', () => {
    // Bit 0x01 alone (top-left only) is not a legacy pattern — must come
    // from the new range.
    const ch = codec.toChar(0x01);
    const cp = ch.codePointAt(0)!;
    expect(cp).toBeGreaterThanOrEqual(0x1cd00);
    expect(cp).toBeLessThanOrEqual(0x1cdef);
  });

  it('spans the full new range exactly (240 unique codepoints)', () => {
    const newCodepoints = new Set<number>();
    for (let mask = 0; mask < 256; mask++) {
      const cp = codec.toChar(mask).codePointAt(0)!;
      if (cp >= 0x1cd00 && cp <= 0x1cdef) newCodepoints.add(cp);
    }
    // 256 total - 16 legacy = 240 must land in the new range.
    expect(newCodepoints.size).toBe(240);
    // The smallest codepoint used should be U+1CD00 (assigned to the
    // smallest non-legacy mask, which is 0x01).
    expect(Math.min(...newCodepoints)).toBe(0x1cd00);
    expect(Math.max(...newCodepoints)).toBe(0x1cdef);
  });
});

describe('octant codec — composability', () => {
  it('composing dotBit values matches the rendered glyph for that mask', () => {
    // Set top-left and bottom-right: bits 0 and 7 → mask 0x81.
    const mask = codec.dotBit(0, 0) | codec.dotBit(3, 1);
    expect(mask).toBe(0x81);
    const direct = codec.toChar(0x81);
    expect(codec.toChar(mask)).toBe(direct);
  });

  it('full coverage via composing all (dy, dx) reaches mask 0xFF', () => {
    let mask = 0;
    for (let dy = 0; dy < 4; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        mask |= codec.dotBit(dy, dx);
      }
    }
    expect(mask).toBe(0xff);
    expect(codec.toChar(mask)).toBe('█');
  });
});
