/**
 * Unicode East Asian Width / Character Width
 *
 * Returns the visual column width of a Unicode codepoint in a monospace
 * terminal.  Uses the East Asian Width property plus zero-width categories.
 *
 * - 2 for Wide (W) / Fullwidth (F) characters (CJK, fullwidth forms, etc.)
 * - 2 for most emoji in supplementary planes
 * - 0 for combining marks, zero-width joiners, variation selectors
 * - 1 for everything else (Latin, Cyrillic, Greek, ...)
 */

// ── Zero-width ranges (combining marks, ZWJ, variation selectors) ────────

const ZERO_WIDTH_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0300, 0x036f], // Combining Diacritical Marks
  [0x0483, 0x0489], // Cyrillic combining marks
  [0x0591, 0x05bd], // Hebrew combining marks
  [0x05bf, 0x05bf],
  [0x05c1, 0x05c2],
  [0x05c4, 0x05c5],
  [0x05c7, 0x05c7],
  [0x0610, 0x061a], // Arabic combining marks
  [0x064b, 0x065f],
  [0x0670, 0x0670],
  [0x06d6, 0x06dc],
  [0x06df, 0x06e4],
  [0x06e7, 0x06e8],
  [0x06ea, 0x06ed],
  [0x0711, 0x0711], // Syriac
  [0x0730, 0x074a],
  [0x07a6, 0x07b0], // Thaana
  [0x07eb, 0x07f3],
  [0x0816, 0x0819], // Samaritan
  [0x081b, 0x0823],
  [0x0825, 0x0827],
  [0x0829, 0x082d],
  [0x0859, 0x085b], // Mandaic
  [0x08d4, 0x08e1], // Arabic Extended-A
  [0x08e3, 0x0902],
  [0x093a, 0x093a], // Devanagari
  [0x093c, 0x093c],
  [0x0941, 0x0948],
  [0x094d, 0x094d],
  [0x0951, 0x0957],
  [0x0962, 0x0963],
  [0x0981, 0x0981], // Bengali
  [0x09bc, 0x09bc],
  [0x09c1, 0x09c4],
  [0x09cd, 0x09cd],
  [0x09e2, 0x09e3],
  [0x0a01, 0x0a02], // Gurmukhi
  [0x0a3c, 0x0a3c],
  [0x0a41, 0x0a42],
  [0x0a47, 0x0a48],
  [0x0a4b, 0x0a4d],
  [0x0a51, 0x0a51],
  [0x0a70, 0x0a71],
  [0x0a75, 0x0a75],
  [0x0a81, 0x0a82], // Gujarati
  [0x0abc, 0x0abc],
  [0x0ac1, 0x0ac5],
  [0x0ac7, 0x0ac8],
  [0x0acd, 0x0acd],
  [0x0ae2, 0x0ae3],
  [0x0b01, 0x0b01], // Oriya
  [0x0b3c, 0x0b3c],
  [0x0b3f, 0x0b3f],
  [0x0b41, 0x0b44],
  [0x0b4d, 0x0b4d],
  [0x0b56, 0x0b56],
  [0x0b62, 0x0b63],
  [0x0b82, 0x0b82], // Tamil
  [0x0bc0, 0x0bc0],
  [0x0bcd, 0x0bcd],
  [0x0c00, 0x0c00], // Telugu
  [0x0c3e, 0x0c40],
  [0x0c46, 0x0c48],
  [0x0c4a, 0x0c4d],
  [0x0c55, 0x0c56],
  [0x0c62, 0x0c63],
  [0x0c81, 0x0c81], // Kannada
  [0x0cbc, 0x0cbc],
  [0x0cbf, 0x0cbf],
  [0x0cc6, 0x0cc6],
  [0x0ccc, 0x0ccd],
  [0x0ce2, 0x0ce3],
  [0x0d01, 0x0d01], // Malayalam
  [0x0d41, 0x0d44],
  [0x0d4d, 0x0d4d],
  [0x0d62, 0x0d63],
  [0x0dca, 0x0dca], // Sinhala
  [0x0dd2, 0x0dd4],
  [0x0dd6, 0x0dd6],
  [0x0e31, 0x0e31], // Thai
  [0x0e34, 0x0e3a],
  [0x0e47, 0x0e4e],
  [0x0eb1, 0x0eb1], // Lao
  [0x0eb4, 0x0eb9],
  [0x0ebb, 0x0ebc],
  [0x0ec8, 0x0ecd],
  [0x0f18, 0x0f19], // Tibetan
  [0x0f35, 0x0f35],
  [0x0f37, 0x0f37],
  [0x0f39, 0x0f39],
  [0x0f71, 0x0f7e],
  [0x0f80, 0x0f84],
  [0x0f86, 0x0f87],
  [0x0f8d, 0x0f97],
  [0x0f99, 0x0fbc],
  [0x0fc6, 0x0fc6],
  [0x102d, 0x1030], // Myanmar
  [0x1032, 0x1037],
  [0x1039, 0x103a],
  [0x103d, 0x103e],
  [0x1058, 0x1059],
  [0x105e, 0x1060],
  [0x1071, 0x1074],
  [0x1082, 0x1082],
  [0x1085, 0x1086],
  [0x108d, 0x108d],
  [0x109d, 0x109d],
  [0x135d, 0x135f], // Ethiopic
  [0x1712, 0x1714], // Tagalog
  [0x1732, 0x1734], // Hanunoo
  [0x1752, 0x1753], // Buhid
  [0x1772, 0x1773], // Tagbanwa
  [0x17b4, 0x17b5], // Khmer
  [0x17b7, 0x17bd],
  [0x17c6, 0x17c6],
  [0x17c9, 0x17d3],
  [0x17dd, 0x17dd],
  [0x180b, 0x180d], // Mongolian
  [0x1885, 0x1886],
  [0x18a9, 0x18a9],
  [0x1920, 0x1922], // Buginese
  [0x1927, 0x1928],
  [0x1932, 0x1932],
  [0x1939, 0x193b],
  [0x1a17, 0x1a18], // Tai Tham
  [0x1a1b, 0x1a1b],
  [0x1a56, 0x1a56],
  [0x1a58, 0x1a5e],
  [0x1a60, 0x1a60],
  [0x1a62, 0x1a62],
  [0x1a65, 0x1a6c],
  [0x1a73, 0x1a7c],
  [0x1a7f, 0x1a7f],
  [0x1ab0, 0x1abe], // Combining Diacritical Marks Extended
  [0x1b00, 0x1b03], // Balinese
  [0x1b34, 0x1b34],
  [0x1b36, 0x1b3a],
  [0x1b3c, 0x1b3c],
  [0x1b42, 0x1b42],
  [0x1b6b, 0x1b73],
  [0x1b80, 0x1b81], // Sundanese
  [0x1ba2, 0x1ba5],
  [0x1ba8, 0x1ba9],
  [0x1bab, 0x1bad],
  [0x1be6, 0x1be6], // Batak
  [0x1be8, 0x1be9],
  [0x1bed, 0x1bed],
  [0x1bef, 0x1bf1],
  [0x1c2c, 0x1c33], // Lepcha
  [0x1c36, 0x1c37],
  [0x1cd0, 0x1cd2], // Vedic Extensions
  [0x1cd4, 0x1ce0],
  [0x1ce2, 0x1ce8],
  [0x1ced, 0x1ced],
  [0x1cf4, 0x1cf4],
  [0x1cf8, 0x1cf9],
  [0x1dc0, 0x1df5], // Combining Diacritical Marks Supplement
  [0x1dfb, 0x1dff],
  [0x200b, 0x200f], // Zero-width space, ZWNJ, ZWJ, LRM, RLM
  [0x2028, 0x202e], // Line/paragraph separators, bidi controls
  [0x2060, 0x2064], // Word joiner, invisible plus, etc.
  [0x2066, 0x206f], // Bidi isolates
  [0x20d0, 0x20f0], // Combining Diacritical Marks for Symbols
  [0xfe00, 0xfe0f], // Variation Selectors
  [0xfe20, 0xfe2f], // Combining Half Marks
  [0xfeff, 0xfeff], // BOM / ZWNBSP
  [0xfff9, 0xfffb], // Interlinear annotation
  [0x1d167, 0x1d169], // Musical symbols combining
  [0x1d173, 0x1d182],
  [0x1d185, 0x1d18b],
  [0x1d1aa, 0x1d1ad],
  [0x1d242, 0x1d244],
  [0xe0001, 0xe0001], // Language tag
  [0xe0020, 0xe007f], // Tag characters
  [0xe0100, 0xe01ef], // Variation Selectors Supplement
];

// ── Wide / Fullwidth ranges ─────────────────────────────────────────────

const WIDE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x1100, 0x115f], // Hangul Jamo
  [0x231a, 0x231b], // Watch / Hourglass (emoji)
  [0x2329, 0x232a], // Angle brackets
  [0x23e9, 0x23f3], // Various emoji
  // [0x23f8, 0x23fa] — Pause / Stop / Record media-control symbols.
  // Removed: Unicode UAX #11 classifies these as Wide, but Claude Code (and
  // most Node TUI libraries used in modern terminals) treat them as 1 col.
  // The Wide classification caused the cursor to advance 2 cols per char
  // while CC tracked it as 1 col, exposing previous-render content at the
  // 1-col gap on every CUF skip — visible as "⏺tDone" / "tDone. Created
  // threeE~50-line" / sparse-last-char-of-word patterns in long-running
  // PTY sessions.
  [0x25fd, 0x25fe], // Medium small square
  [0x2614, 0x2615], // Umbrella, hot beverage
  [0x2648, 0x2653], // Zodiac emoji
  [0x267f, 0x267f], // Wheelchair
  [0x2693, 0x2693], // Anchor
  [0x26a1, 0x26a1], // High voltage
  [0x26aa, 0x26ab], // Circles
  [0x26bd, 0x26be], // Soccer, baseball
  [0x26c4, 0x26c5], // Snowman, sun behind cloud
  [0x26ce, 0x26ce], // Ophiuchus
  [0x26d4, 0x26d4], // No entry
  [0x26ea, 0x26ea], // Church
  [0x26f2, 0x26f3], // Fountain, golf
  [0x26f5, 0x26f5], // Sailboat
  [0x26fa, 0x26fa], // Tent
  [0x26fd, 0x26fd], // Fuel pump
  [0x2702, 0x2702], // Scissors
  [0x2705, 0x2705], // Check mark
  [0x2708, 0x270d], // Various emoji
  [0x270f, 0x270f], // Pencil
  [0x2712, 0x2712], // Black nib
  [0x2714, 0x2714], // Heavy check
  [0x2716, 0x2716], // Heavy multiplication
  [0x271d, 0x271d], // Latin cross
  [0x2721, 0x2721], // Star of David
  [0x2728, 0x2728], // Sparkles
  // [0x2733, 0x2734] — Eight Spoked Asterisk / Eight Pointed Black Star.
  // Same root cause as 0x23f8-0x23fa: classified Wide by Unicode but
  // treated as narrow by Claude Code (used as the "thinking" spinner glyph).
  [0x2744, 0x2744], // Snowflake
  [0x2747, 0x2747], // Sparkle
  [0x274c, 0x274c], // Cross mark
  [0x274e, 0x274e], // Cross mark
  [0x2753, 0x2755], // Question marks
  [0x2757, 0x2757], // Exclamation
  [0x2763, 0x2764], // Heart exclamation, heart
  [0x2795, 0x2797], // Plus, minus, divide
  [0x27a1, 0x27a1], // Right arrow
  [0x27b0, 0x27b0], // Curly loop
  [0x27bf, 0x27bf], // Double curly loop
  [0x2934, 0x2935], // Arrows
  [0x2b05, 0x2b07], // Arrows
  [0x2b1b, 0x2b1c], // Black/white large square
  [0x2b50, 0x2b50], // Star
  [0x2b55, 0x2b55], // Heavy large circle
  [0x2e80, 0x303e], // CJK Radicals, Kangxi, Ideographic Description, CJK Symbols
  [0x3041, 0x33bf], // Hiragana, Katakana, Bopomofo, Hangul compat, Kanbun, CJK compat
  [0x3400, 0x4dbf], // CJK Unified Ideographs Extension A
  [0x4e00, 0x9fff], // CJK Unified Ideographs
  [0xa000, 0xa4cf], // Yi Syllables + Radicals
  [0xa960, 0xa97f], // Hangul Jamo Extended-A
  [0xac00, 0xd7af], // Hangul Syllables
  [0xf900, 0xfaff], // CJK Compatibility Ideographs
  [0xfe10, 0xfe19], // Vertical forms
  [0xfe30, 0xfe6f], // CJK Compatibility Forms + Small Form Variants
  [0xff01, 0xff60], // Fullwidth Forms
  [0xffe0, 0xffe6], // Fullwidth Signs
  [0x16fe0, 0x16fff], // Ideographic Symbols and Punctuation
  [0x17000, 0x187ff], // Tangut
  [0x18800, 0x18aff], // Tangut Components
  [0x1b000, 0x1b12f], // Kana Supplement + Extended-A
  [0x1b130, 0x1b16f], // Kana Extended-B (small kana)
  [0x1b170, 0x1b2ff], // Nushu
  [0x1f004, 0x1f004], // Mahjong tile
  [0x1f0cf, 0x1f0cf], // Playing card
  [0x1f18e, 0x1f18e], // AB button
  [0x1f191, 0x1f19a], // Squared symbols
  [0x1f1e0, 0x1f1ff], // Regional indicator symbols (flags)
  [0x1f200, 0x1f202], // Enclosed ideographic supplement
  [0x1f210, 0x1f23b],
  [0x1f240, 0x1f248],
  [0x1f250, 0x1f251],
  [0x1f260, 0x1f265],
  [0x1f300, 0x1f64f], // Miscellaneous Symbols and Pictographs + Emoticons
  [0x1f680, 0x1f6ff], // Transport and Map Symbols
  [0x1f700, 0x1f77f], // Alchemical Symbols
  [0x1f780, 0x1f7ff], // Geometric Shapes Extended
  [0x1f800, 0x1f8ff], // Supplemental Arrows-C
  [0x1f900, 0x1f9ff], // Supplemental Symbols and Pictographs
  [0x1fa00, 0x1fa6f], // Chess Symbols
  [0x1fa70, 0x1faff], // Symbols and Pictographs Extended-A
  [0x1fb00, 0x1fbff], // Symbols for Legacy Computing
  [0x20000, 0x2fffd], // CJK Unified Ideographs Extension B through F
  [0x30000, 0x3fffd], // CJK Unified Ideographs Extension G+
];

/**
 * Binary search to check if a codepoint falls within any of the given ranges.
 */
function inRanges(cp: number, ranges: ReadonlyArray<readonly [number, number]>): boolean {
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const [start, end] = ranges[mid]!;
    if (cp < start) {
      hi = mid - 1;
    } else if (cp > end) {
      lo = mid + 1;
    } else {
      return true;
    }
  }
  return false;
}

/**
 * Return the visual column width of a single Unicode codepoint.
 *
 * - 0 for combining marks, zero-width joiners, variation selectors, etc.
 * - 2 for East Asian Wide/Fullwidth characters, CJK, most emoji
 * - 1 for everything else
 */
export function charWidth(cp: number): number {
  // Fast path: ASCII (and C0 control codes render as 1 in most terminals)
  if (cp < 0x0300) return cp === 0 ? 0 : 1;

  // Check zero-width first (combining marks appear more often in mixed text)
  if (inRanges(cp, ZERO_WIDTH_RANGES)) return 0;

  // Check wide / fullwidth
  if (inRanges(cp, WIDE_RANGES)) return 2;

  return 1;
}

/**
 * Return the visual column width of a string by summing `charWidth` for
 * each codepoint.  This does NOT strip ANSI — call `stripAnsi` first if
 * needed (the `visualWidth` in utils.ts does this automatically).
 */
export function stringWidth(str: string): number {
  let width = 0;
  for (const ch of str) {
    width += charWidth(ch.codePointAt(0)!);
  }
  return width;
}
