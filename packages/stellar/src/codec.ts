/**
 * Cell Codecs — encoding strategies for sub-cell pixel rendering.
 *
 * A codec defines how sub-pixel positions map to bitmask bits and
 * how bitmasks convert to Unicode characters.
 *
 * Braille:  2×4 dots per cell (U+2800-U+28FF) — highest resolution, visible row gaps
 * Octant:   2×4 blocks per cell (U+1CD00-U+1CDEF + legacy block elements)
 *           — same resolution as braille but gap-free, requires Unicode 16 fonts
 * Quarter:  2×2 blocks per cell (U+2596-U+259F) — gap-free, universally supported
 * Sextant:  2×3 blocks per cell (U+1FB00-U+1FB3B) — gap-free, requires modern fonts
 * Halfblock: 1×2 blocks per cell (U+2580/U+2584) — lowest resolution, universal
 *
 * Pick a mode with `resolveCanvasMode('auto', caps)` to fall back gracefully
 * on terminals without Unicode 16 / Symbols-for-Legacy-Computing-Supplement
 * font coverage. Sextant is the primary fallback when octants aren't available.
 */

export type CanvasMode = 'braille' | 'sextant' | 'octant' | 'halfblock' | 'quarter';

export interface CellCodec {
  /** Sub-pixel columns per terminal cell (always 2) */
  readonly subCols: number;
  /** Sub-pixel rows per terminal cell (4 for braille, 3 for sextant) */
  readonly subRows: number;
  /**
   * Approximate width/height ratio of a single sub-pixel, assuming ~1:2 char cells.
   *
   * A terminal character cell has width W and height H ≈ 2W. Each codec divides
   * the cell into subCols × subRows sub-pixels:
   *   pixelAspect = (W / subCols) / (H / subRows) = (subRows) / (2 × subCols)
   *
   * Values:
   *   braille  (2×4): 4 / (2×2) = 1.0
   *   sextant  (2×3): 3 / (2×2) = 0.75
   *   quarter  (2×2): 2 / (2×2) = 0.5
   *   halfblock(1×2): 2 / (2×1) = 1.0
   */
  readonly pixelAspect: number;
  /** Get the bitmask bit for a sub-pixel position within a cell */
  dotBit(dy: number, dx: number): number;
  /** Convert a cell bitmask to the rendered Unicode character */
  toChar(bitmask: number): string;
}

// ─── Braille Codec ──────────────────────────────────────────────────────────

/**
 * Braille dot bit positions (2 columns × 4 rows).
 * Layout:
 *   [0x01] [0x08]   row 0
 *   [0x02] [0x10]   row 1
 *   [0x04] [0x20]   row 2
 *   [0x40] [0x80]   row 3
 */
const BRAILLE_BITS: readonly (readonly [number, number])[] = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
];

const BRAILLE_BASE = 0x2800;

const brailleCodec: CellCodec = {
  subCols: 2,
  subRows: 4,
  pixelAspect: 1.0,
  dotBit(dy: number, dx: number): number {
    return BRAILLE_BITS[dy]?.[dx] ?? 0;
  },
  toChar(bitmask: number): string {
    return String.fromCodePoint(BRAILLE_BASE + (bitmask & 0xff));
  },
};

// ─── Sextant Codec ──────────────────────────────────────────────────────────

/**
 * Sextant block bit positions (2 columns × 3 rows).
 * Layout:
 *   [bit0] [bit1]   row 0
 *   [bit2] [bit3]   row 1
 *   [bit4] [bit5]   row 2
 */
const SEXTANT_BITS: readonly (readonly [number, number])[] = [
  [0x01, 0x02],
  [0x04, 0x08],
  [0x10, 0x20],
];

/**
 * Lookup table mapping 6-bit bitmask (0-63) to Unicode codepoint.
 *
 * The sextant range U+1FB00-U+1FB3B has 60 characters for patterns 1-62,
 * but two patterns have pre-existing codepoints in the Block Elements range:
 *   Pattern 21 (0b010101 = left column)  → U+258C LEFT HALF BLOCK
 *   Pattern 42 (0b101010 = right column) → U+2590 RIGHT HALF BLOCK
 *
 * Special cases:
 *   Pattern 0  (empty)  → U+0020 SPACE
 *   Pattern 63 (full)   → U+2588 FULL BLOCK
 */
function buildSextantTable(): string[] {
  const table: string[] = new Array(64);
  table[0] = ' ';
  table[63] = '\u2588'; // FULL BLOCK

  // The sextant range starts at U+1FB00 and contains 60 characters.
  // They cover patterns 1-62, skipping patterns 21 and 42 which use
  // pre-existing Block Element codepoints.
  let codepoint = 0x1fb00;
  for (let mask = 1; mask <= 62; mask++) {
    if (mask === 21) {
      table[mask] = '\u258C'; // LEFT HALF BLOCK
    } else if (mask === 42) {
      table[mask] = '\u2590'; // RIGHT HALF BLOCK
    } else {
      table[mask] = String.fromCodePoint(codepoint);
      codepoint++;
    }
  }

  return table;
}

const SEXTANT_TABLE = buildSextantTable();

const sextantCodec: CellCodec = {
  subCols: 2,
  subRows: 3,
  pixelAspect: 0.75,
  dotBit(dy: number, dx: number): number {
    return SEXTANT_BITS[dy]?.[dx] ?? 0;
  },
  toChar(bitmask: number): string {
    return SEXTANT_TABLE[bitmask & 0x3f]!;
  },
};

// ─── Octant Codec ───────────────────────────────────────────────────────────

/**
 * Octant block bit positions (2 columns × 4 rows). Same geometry as
 * braille — eight sub-cells per terminal cell — but rendered as solid
 * gap-free fills via Unicode 16's "Symbols for Legacy Computing
 * Supplement" block plus the legacy block elements (U+2580–U+259F).
 *
 * Layout (row-major, 0-indexed):
 *   [bit0] [bit1]   row 0 (top)
 *   [bit2] [bit3]   row 1
 *   [bit4] [bit5]   row 2
 *   [bit6] [bit7]   row 3 (bottom)
 */
const OCTANT_BITS: readonly (readonly [number, number])[] = [
  [0x01, 0x02],
  [0x04, 0x08],
  [0x10, 0x20],
  [0x40, 0x80],
];

/**
 * Sixteen of the 256 possible 8-bit octant patterns are already encoded in
 * the legacy Block Elements range (U+2580–U+259F). We reuse those — they
 * have universal font coverage — and assign the remaining 240 patterns to
 * the new Unicode 16 octant range U+1CD00–U+1CDEF.
 *
 * Pattern bits use the row-major layout above:
 *   bit0=top-L bit1=top-R bit2=row1-L bit3=row1-R
 *   bit4=row2-L bit5=row2-R bit6=bot-L bit7=bot-R
 *
 * Quadrant equivalents (each visual quadrant = 2 octant pixels stacked):
 *   ▘ U+2598 upper-left   = bits 0+2 (row0-L + row1-L) = 0x05
 *   ▝ U+259D upper-right  = bits 1+3                   = 0x0A
 *   ▖ U+2596 lower-left   = bits 4+6                   = 0x50
 *   ▗ U+2597 lower-right  = bits 5+7                   = 0xA0
 *   ▀ U+2580 upper-half   = 0x05 | 0x0A                = 0x0F
 *   ▄ U+2584 lower-half   = 0x50 | 0xA0                = 0xF0
 *   ▌ U+258C left-half    = 0x05 | 0x50                = 0x55
 *   ▐ U+2590 right-half   = 0x0A | 0xA0                = 0xAA
 *   ▚ U+259A UL+LR        = 0x05 | 0xA0                = 0xA5
 *   ▞ U+259E UR+LL        = 0x0A | 0x50                = 0x5A
 *   ▛ U+259B UL+UR+LL     = 0x05 | 0x0A | 0x50         = 0x5F
 *   ▜ U+259C UL+UR+LR     = 0x05 | 0x0A | 0xA0         = 0xAF
 *   ▙ U+2599 UL+LL+LR     = 0x05 | 0x50 | 0xA0         = 0xF5
 *   ▟ U+259F UR+LL+LR     = 0x0A | 0x50 | 0xA0         = 0xFA
 *   space U+0020 empty    = 0x00
 *   █ U+2588 full         = 0xFF
 */
const OCTANT_LEGACY_MAP: ReadonlyMap<number, string> = new Map([
  [0x00, ' '],
  [0x05, '▘'], // ▘
  [0x0a, '▝'], // ▝
  [0x0f, '▀'], // ▀
  [0x50, '▖'], // ▖
  [0x55, '▌'], // ▌
  [0x5a, '▞'], // ▞
  [0x5f, '▛'], // ▛
  [0xa0, '▗'], // ▗
  [0xa5, '▚'], // ▚
  [0xaa, '▐'], // ▐
  [0xaf, '▜'], // ▜
  [0xf0, '▄'], // ▄
  [0xf5, '▙'], // ▙
  [0xfa, '▟'], // ▟
  [0xff, '█'], // █
]);

/**
 * Base of the Unicode 16 octant block (U+1CD00). The 240 patterns not
 * covered by `OCTANT_LEGACY_MAP` are assigned consecutively from here in
 * increasing-bitmask order. The block extends to U+1CDEF, totalling 240
 * codepoints — exactly enough for the residual patterns.
 */
const OCTANT_NEW_BASE = 0x1cd00;

/**
 * Build the 256-entry octant lookup table.
 *
 * Algorithm mirrors `buildSextantTable`: scan bitmasks 0–255 in order;
 * for each, prefer the legacy-map codepoint when one exists, otherwise
 * consume the next codepoint from `OCTANT_NEW_BASE`. The resulting table
 * round-trips by construction — every bitmask produces a non-empty
 * string and no two bitmasks share a codepoint.
 */
function buildOctantTable(): string[] {
  const table: string[] = new Array(256);
  let codepoint = OCTANT_NEW_BASE;
  for (let mask = 0; mask < 256; mask++) {
    const legacy = OCTANT_LEGACY_MAP.get(mask);
    if (legacy !== undefined) {
      table[mask] = legacy;
    } else {
      table[mask] = String.fromCodePoint(codepoint);
      codepoint++;
    }
  }
  return table;
}

const OCTANT_TABLE = buildOctantTable();

const octantCodec: CellCodec = {
  subCols: 2,
  subRows: 4,
  pixelAspect: 1.0,
  dotBit(dy: number, dx: number): number {
    return OCTANT_BITS[dy]?.[dx] ?? 0;
  },
  toChar(bitmask: number): string {
    return OCTANT_TABLE[bitmask & 0xff]!;
  },
};

// ─── Halfblock Codec ────────────────────────────────────────────────────────

/**
 * Half-block bit positions (1 column × 2 rows).
 * Uses ▀ (top), ▄ (bottom), █ (both), space (empty).
 * Universally supported, gap-free, but low resolution (1×2 per cell).
 */
const HALFBLOCK_BITS: readonly (readonly [number])[] = [
  [0x01], // row 0 (top)
  [0x02], // row 1 (bottom)
];

const HALFBLOCK_TABLE = [' ', '\u2580', '\u2584', '\u2588'];

const halfblockCodec: CellCodec = {
  subCols: 1,
  subRows: 2,
  pixelAspect: 1.0,
  dotBit(dy: number, _dx: number): number {
    return HALFBLOCK_BITS[dy]?.[0] ?? 0;
  },
  toChar(bitmask: number): string {
    return HALFBLOCK_TABLE[bitmask & 0x03]!;
  },
};

// ─── Quarter-block Codec ───────────────────────────────────────────────────

/**
 * Quarter-block bit positions (2 columns × 2 rows).
 * Uses quadrant block characters (U+2596-U+259F), universally supported.
 * Layout:
 *   [bit0] [bit1]   row 0 (top-left, top-right)
 *   [bit2] [bit3]   row 1 (bottom-left, bottom-right)
 */
const QUARTER_BITS: readonly (readonly [number, number])[] = [
  [0x01, 0x02], // row 0
  [0x04, 0x08], // row 1
];

const QUARTER_TABLE = [
  ' ', // 0b0000
  '\u2598', // 0b0001 ▘ top-left
  '\u259D', // 0b0010 ▝ top-right
  '\u2580', // 0b0011 ▀ upper half
  '\u2596', // 0b0100 ▖ bottom-left
  '\u258C', // 0b0101 ▌ left half
  '\u259E', // 0b0110 ▞ anti-diagonal
  '\u259B', // 0b0111 ▛ TL+TR+BL
  '\u2597', // 0b1000 ▗ bottom-right
  '\u259A', // 0b1001 ▚ diagonal
  '\u2590', // 0b1010 ▐ right half
  '\u259C', // 0b1011 ▜ TL+TR+BR
  '\u2584', // 0b1100 ▄ lower half
  '\u2599', // 0b1101 ▙ TL+BL+BR
  '\u259F', // 0b1110 ▟ TR+BL+BR
  '\u2588', // 0b1111 █ full block
];

const quarterCodec: CellCodec = {
  subCols: 2,
  subRows: 2,
  pixelAspect: 0.5,
  dotBit(dy: number, dx: number): number {
    return QUARTER_BITS[dy]?.[dx] ?? 0;
  },
  toChar(bitmask: number): string {
    return QUARTER_TABLE[bitmask & 0x0f]!;
  },
};

// ─── Factory ────────────────────────────────────────────────────────────────

export function getCodec(mode: CanvasMode): CellCodec {
  if (mode === 'sextant') return sextantCodec;
  if (mode === 'octant') return octantCodec;
  if (mode === 'halfblock') return halfblockCodec;
  if (mode === 'quarter') return quarterCodec;
  return brailleCodec;
}
