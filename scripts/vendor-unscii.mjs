#!/usr/bin/env node

/**
 * Regenerate scripts/vendor/unscii-16-subset.bin from the public-domain
 * unscii-16-full.hex font by Viznut (http://viznut.fi/unscii/).
 *
 *   curl -sL http://viznut.fi/unscii/unscii-16-full.hex -o /tmp/unscii-16-full.hex
 *   node scripts/vendor-unscii.mjs /tmp/unscii-16-full.hex
 *
 * Output format: repeated [uint32 codepoint][16 bytes glyph rows], sorted by
 * codepoint for binary search. Each glyph is 8x16, one bit per pixel,
 * most-significant bit leftmost. unscii is public domain.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RANGES = [
  [0x20, 0x7e], // ASCII
  [0xa0, 0xff], // Latin-1 supplement
  [0x2190, 0x21ff], // arrows
  [0x2300, 0x23ff], // miscellaneous technical
  [0x2500, 0x257f], // box drawing
  [0x2580, 0x259f], // block elements
  [0x25a0, 0x25ff], // geometric shapes
  [0x2600, 0x26ff], // miscellaneous symbols
  [0x2700, 0x27bf], // dingbats
  [0x2800, 0x28ff], // braille patterns
];
const EXTRA = [0x1f680, 0x1f916]; // 🚀 🤖 (demo icons)

const source = process.argv[2];
if (!source) {
  console.error('usage: node scripts/vendor-unscii.mjs <unscii-16-full.hex>');
  process.exit(1);
}

const wanted = new Set();
for (const [lo, hi] of RANGES) for (let cp = lo; cp <= hi; cp++) wanted.add(cp);
for (const cp of EXTRA) wanted.add(cp);

const glyphs = new Map();
for (const line of readFileSync(source, 'utf8').split(/\r?\n/)) {
  if (!line) continue;
  const sep = line.indexOf(':');
  const cp = Number.parseInt(line.slice(0, sep), 16);
  if (!wanted.has(cp)) continue;
  const hex = line.slice(sep + 1).trim();
  if (hex.length !== 32) continue; // unscii-16 rows are 8px wide × 16 rows = 32 hex chars
  glyphs.set(cp, Buffer.from(hex, 'hex'));
}

const sorted = [...glyphs.entries()].sort((a, b) => a[0] - b[0]);
const out = Buffer.alloc(sorted.length * 20);
sorted.forEach(([cp, bitmap], i) => {
  out.writeUInt32LE(cp, i * 20);
  bitmap.copy(out, i * 20 + 4);
});

const target = join(dirname(fileURLToPath(import.meta.url)), 'vendor', 'unscii-16-subset.bin');
writeFileSync(target, out);
console.log(`wrote ${target} with ${sorted.length} glyphs (${out.length} bytes)`);
