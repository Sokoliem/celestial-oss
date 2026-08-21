#!/usr/bin/env node

/**
 * Generate docs/media/social-preview.png (1280x640) — the repository's social
 * share card, rendered from a real Flight Deck frame by the same rasterizer
 * that records the demo GIFs. No staged artwork: the backdrop is the
 * framework's own output.
 *
 *   pnpm tsx scripts/social-card.mjs
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { planLayout, rasterize } from '@celestial/core/nebula';
import { createTestApp } from '@celestial/test';
import { createCelestialShowcaseApp } from '../examples/celestial-showcase/src/app.js';
import { createCanvas, drawText, fillRect, hexToRgb, rasterizeFrame } from './lib/terminal-raster.mjs';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const CARD_W = 1280;
const CARD_H = 640;

// Capture the Components gallery — the densest real surface. The showcase
// minimum viewport is 70x32, so the backdrop is a center crop of a full-res
// frame: chrome-free lab content as texture.
const size = { cols: 80, rows: 32 };
const handle = createTestApp(createCelestialShowcaseApp({ initialSize: size, fast: true }), size);
handle.pressKey('2');
await handle.waitForUpdate();
await new Promise((resolve) => setTimeout(resolve, 2000));
const grid = rasterize(planLayout(handle.__config.view(handle.model), size.cols, size.rows));
handle.stop();

// Backdrop: real frame at 1280x1024 (80x32 cells × 16px × 2), center-cropped
// to the card height.
const full = createCanvas(CARD_W, 1024);
rasterizeFrame(grid, 2, full);
const canvas = createCanvas(CARD_W, CARD_H);
const cropY = (1024 - CARD_H) / 2;
for (let y = 0; y < CARD_H; y++) {
  for (let x = 0; x < CARD_W; x++) {
    const src = ((y + cropY) * CARD_W + x) * 4;
    const dst = (y * CARD_W + x) * 4;
    canvas.rgba[dst] = full.rgba[src];
    canvas.rgba[dst + 1] = full.rgba[src + 1];
    canvas.rgba[dst + 2] = full.rgba[src + 2];
    canvas.rgba[dst + 3] = 255;
  }
}

// Left panel: darkened for legibility, with a cyan accent edge.
const PANEL_W = 660;
fillRect(canvas, 0, 0, PANEL_W, CARD_H, hexToRgb('#0b0f14'), 0.86);
fillRect(canvas, PANEL_W - 6, 0, 6, CARD_H, hexToRgb('#22d3ee'), 0.9);

const white = hexToRgb('#f8fafc');
const cyan = hexToRgb('#56d4dd');
const muted = hexToRgb('#9fb0c3');
const dim = hexToRgb('#64748b');

// Wordmark + rule.
drawText(canvas, 'CELESTIAL', 56, 72, 6, white);
fillRect(canvas, 60, 176, 420, 3, cyan, 0.9);

// Tagline.
drawText(canvas, 'State-driven terminal user', 60, 208, 2, white);
drawText(canvas, 'interfaces, in TypeScript.', 60, 244, 2, white);

// Feature lines.
const features = ['Elm runtime · typed messages', 'Mouse-first · 52 audited builders', 'TSX · DevTools · Windows', 'Headless + PTY testing'];
features.forEach((line, i) => {
  drawText(canvas, '◆', 60, 320 + i * 48, 2, cyan);
  drawText(canvas, line, 100, 320 + i * 48, 2, muted);
});

// Footer.
drawText(canvas, 'github.com/Sokoliem/celestial-oss', 60, CARD_H - 64, 2, dim);

const png = new PNG({ width: CARD_W, height: CARD_H });
png.data.set(canvas.rgba);

const out = join(repoRoot, 'docs', 'media', 'social-preview.png');
writeFileSync(out, PNG.sync.write(png));
console.log(`wrote ${out}`);
