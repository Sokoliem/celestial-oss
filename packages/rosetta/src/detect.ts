/**
 * @celestial/rosetta — Direction detection and bidi character classification.
 *
 * Implements the first-strong-character rule from UAX #9 (P2/P3) for
 * paragraph-level direction detection, plus character-level bidi type
 * classification.
 */

import type { BidiCharType } from './types.js';

// ── RTL script ranges ────────────────────────────────────────────────────

/**
 * Check whether a code point is a Right-to-Left character.
 * Covers Arabic, Hebrew, Syriac, Thaana, N'Ko, Samaritan, Mandaic,
 * Arabic Extended, and supplementary RTL scripts.
 */
export function isRtlChar(cp: number): boolean {
  // Hebrew
  if (cp >= 0x0590 && cp <= 0x05ff) return true;
  // Arabic
  if (cp >= 0x0600 && cp <= 0x06ff) return true;
  // Syriac
  if (cp >= 0x0700 && cp <= 0x074f) return true;
  // Arabic Supplement
  if (cp >= 0x0750 && cp <= 0x077f) return true;
  // Thaana
  if (cp >= 0x0780 && cp <= 0x07bf) return true;
  // N'Ko
  if (cp >= 0x07c0 && cp <= 0x07ff) return true;
  // Samaritan
  if (cp >= 0x0800 && cp <= 0x083f) return true;
  // Mandaic
  if (cp >= 0x0840 && cp <= 0x085f) return true;
  // Arabic Extended-A
  if (cp >= 0x08a0 && cp <= 0x08ff) return true;
  // Hebrew presentation forms
  if (cp >= 0xfb1d && cp <= 0xfb4f) return true;
  // Arabic presentation forms A
  if (cp >= 0xfb50 && cp <= 0xfdff) return true;
  // Arabic presentation forms B
  if (cp >= 0xfe70 && cp <= 0xfeff) return true;
  // RTL marks
  if (cp === 0x200f) return true; // RLM
  if (cp === 0x061c) return true; // ALM
  // Supplementary RTL scripts
  if (cp >= 0x10800 && cp <= 0x10fff) return true; // Cypriot, Imperial Aramaic, etc.
  if (cp >= 0x1e800 && cp <= 0x1edff) return true; // Mende Kikakui, Adlam
  if (cp >= 0x1ee00 && cp <= 0x1eeff) return true; // Arabic Mathematical Alphabetic Symbols
  return false;
}

// ── LTR script ranges ───────────────────────────────────────────────────

/**
 * Check whether a code point is a Left-to-Right character.
 * Covers Latin, Greek, Cyrillic, Armenian, Georgian, CJK, Hangul, and
 * other LTR scripts.
 */
export function isLtrChar(cp: number): boolean {
  // Basic Latin letters
  if (cp >= 0x0041 && cp <= 0x005a) return true;
  if (cp >= 0x0061 && cp <= 0x007a) return true;
  // Latin Extended
  if (cp >= 0x00c0 && cp <= 0x02af) return true;
  // Greek
  if (cp >= 0x0370 && cp <= 0x03ff) return true;
  // Cyrillic
  if (cp >= 0x0400 && cp <= 0x052f) return true;
  // Armenian
  if (cp >= 0x0530 && cp <= 0x058f) return true;
  // Georgian
  if (cp >= 0x10a0 && cp <= 0x10ff) return true;
  // Hangul Jamo
  if (cp >= 0x1100 && cp <= 0x11ff) return true;
  // CJK Unified Ideographs
  if (cp >= 0x4e00 && cp <= 0x9fff) return true;
  // Hangul Syllables
  if (cp >= 0xac00 && cp <= 0xd7af) return true;
  // Hiragana
  if (cp >= 0x3040 && cp <= 0x309f) return true;
  // Katakana
  if (cp >= 0x30a0 && cp <= 0x30ff) return true;
  // Latin Extended Additional
  if (cp >= 0x1e00 && cp <= 0x1eff) return true;
  // LRM
  if (cp === 0x200e) return true;
  return false;
}

// ── Bidi character type classification ──────────────────────────────────

/**
 * Classify a code point into its UAX #9 bidi character type.
 * This is a simplified classification covering the most common ranges.
 */
export function getCharBidiType(cp: number): BidiCharType {
  // Explicit formatting characters
  if (cp === 0x202a) return 'LRE';
  if (cp === 0x202b) return 'RLE';
  if (cp === 0x202c) return 'PDF';
  if (cp === 0x202d) return 'LRO';
  if (cp === 0x202e) return 'RLO';
  if (cp === 0x2066) return 'LRI';
  if (cp === 0x2067) return 'RLI';
  if (cp === 0x2068) return 'FSI';
  if (cp === 0x2069) return 'PDI';

  // Paragraph/segment separators
  if (cp === 0x000a || cp === 0x000d || cp === 0x001c || cp === 0x001d || cp === 0x001e || cp === 0x0085 || cp === 0x2029) return 'B';
  if (cp === 0x0009 || cp === 0x001f) return 'S';

  // Whitespace
  if (cp === 0x000c || cp === 0x0020 || cp === 0x1680 || (cp >= 0x2000 && cp <= 0x200a) || cp === 0x2028 || cp === 0x205f || cp === 0x3000) return 'WS';

  // Boundary neutral
  if (
    cp === 0x200b ||
    cp === 0x200c ||
    cp === 0x200d ||
    cp === 0x2060 ||
    cp === 0xfeff ||
    (cp >= 0x0000 && cp <= 0x0008) ||
    cp === 0x000e ||
    cp === 0x000f ||
    (cp >= 0x0010 && cp <= 0x001b)
  )
    return 'BN';

  // LRM / RLM / ALM
  if (cp === 0x200e) return 'L';
  if (cp === 0x200f) return 'R';
  if (cp === 0x061c) return 'AL';

  // Arabic letters (AL)
  if (
    (cp >= 0x0608 && cp <= 0x0608) ||
    (cp >= 0x060b && cp <= 0x060b) ||
    (cp >= 0x060d && cp <= 0x060d) ||
    (cp >= 0x0620 && cp <= 0x063f) ||
    (cp >= 0x0641 && cp <= 0x064a) ||
    (cp >= 0x066d && cp <= 0x066f) ||
    (cp >= 0x0671 && cp <= 0x06d5) ||
    (cp >= 0x06e5 && cp <= 0x06e6) ||
    (cp >= 0x06ee && cp <= 0x06ef) ||
    (cp >= 0x06fa && cp <= 0x06ff)
  )
    return 'AL';
  // Broader Arabic ranges → AL
  if (cp >= 0x0750 && cp <= 0x077f) return 'AL'; // Arabic Supplement
  if (cp >= 0x08a0 && cp <= 0x08ff) return 'AL'; // Arabic Extended-A
  if (cp >= 0xfb50 && cp <= 0xfdff) return 'AL'; // Arabic Pres. Forms A
  if (cp >= 0xfe70 && cp <= 0xfeff) return 'AL'; // Arabic Pres. Forms B

  // Arabic numbers (AN)
  if ((cp >= 0x0660 && cp <= 0x0669) || (cp >= 0x06f0 && cp <= 0x06f9)) return 'AN';

  // Hebrew letters (R)
  if ((cp >= 0x05d0 && cp <= 0x05ea) || (cp >= 0x05f0 && cp <= 0x05f4) || (cp >= 0xfb1d && cp <= 0xfb4f)) return 'R';
  // Syriac, Thaana, N'Ko, Samaritan, Mandaic → R
  if (cp >= 0x0700 && cp <= 0x074f) return 'R';
  if (cp >= 0x0780 && cp <= 0x07bf) return 'R';
  if (cp >= 0x07c0 && cp <= 0x07ff) return 'R';
  if (cp >= 0x0800 && cp <= 0x083f) return 'R';
  if (cp >= 0x0840 && cp <= 0x085f) return 'R';

  // Nonspacing marks (NSM) — combining marks
  if (
    (cp >= 0x0300 && cp <= 0x036f) ||
    (cp >= 0x0483 && cp <= 0x0489) ||
    (cp >= 0x0591 && cp <= 0x05bd) ||
    cp === 0x05bf ||
    (cp >= 0x05c1 && cp <= 0x05c2) ||
    (cp >= 0x05c4 && cp <= 0x05c5) ||
    cp === 0x05c7 ||
    (cp >= 0x0610 && cp <= 0x061a) ||
    (cp >= 0x064b && cp <= 0x065f) ||
    cp === 0x0670 ||
    (cp >= 0x06d6 && cp <= 0x06dc) ||
    (cp >= 0x06df && cp <= 0x06e4) ||
    (cp >= 0x06e7 && cp <= 0x06e8) ||
    (cp >= 0x06ea && cp <= 0x06ed) ||
    (cp >= 0x20d0 && cp <= 0x20f0) ||
    (cp >= 0xfe20 && cp <= 0xfe2f)
  )
    return 'NSM';

  // European numbers (EN)
  if (cp >= 0x0030 && cp <= 0x0039) return 'EN'; // ASCII digits
  if (cp >= 0x00b2 && cp <= 0x00b3) return 'EN'; // superscript 2-3
  if (cp === 0x00b9) return 'EN'; // superscript 1
  if (cp >= 0x2070 && cp <= 0x2079) return 'EN'; // superscripts
  if (cp >= 0x2080 && cp <= 0x2089) return 'EN'; // subscripts

  // European separator (ES)
  if (cp === 0x002b || cp === 0x002d) return 'ES'; // + -
  if (cp === 0x207a || cp === 0x207b) return 'ES'; // superscript + -
  if (cp === 0x208a || cp === 0x208b) return 'ES'; // subscript + -
  if (cp === 0x2212) return 'ES'; // minus sign

  // European terminator (ET)
  if (cp === 0x0023 || cp === 0x0024) return 'ET'; // # $
  if (cp === 0x0025) return 'ET'; // %
  if (cp >= 0x00a2 && cp <= 0x00a5) return 'ET'; // currency symbols
  if (cp === 0x00b0 || cp === 0x00b1) return 'ET'; // degree, plus-minus
  if (cp === 0x058f) return 'ET'; // Armenian Dram
  if (cp === 0x20a0 || (cp >= 0x20a1 && cp <= 0x20cf)) return 'ET'; // Currency symbols

  // Common separator (CS)
  if (cp === 0x002c) return 'CS'; // comma
  if (cp === 0x002e || cp === 0x002f) return 'CS'; // period, slash
  if (cp === 0x003a) return 'CS'; // colon
  if (cp === 0x00a0) return 'CS'; // NBSP

  // Strong LTR
  if (isLtrChar(cp)) return 'L';

  // Catch remaining RTL
  if (isRtlChar(cp)) return 'R';

  // Default: Other Neutral
  return 'ON';
}

// ── Direction detection ─────────────────────────────────────────────────

/**
 * Detect the base direction of a paragraph of text using the first strong
 * character rule from UAX #9 (rules P2 and P3).
 *
 * Returns 'ltr' if no strong character is found (default per Unicode spec).
 */
export function detectDirection(text: string): 'ltr' | 'rtl' {
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    const type = getCharBidiType(cp);
    if (type === 'L') return 'ltr';
    if (type === 'R' || type === 'AL') return 'rtl';
  }
  // Default paragraph direction is LTR (UAX #9 P3)
  return 'ltr';
}
