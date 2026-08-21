#!/usr/bin/env node

/**
 * Deterministic offline demo recorder.
 *
 * Drives the supported demos headlessly through @celestial/test, rasterizes
 * the framework's own styled cell grids with the vendored public-domain
 * unscii-16 bitmap font (scripts/vendor/unscii-16-subset.bin), and writes
 * animated GIFs to docs/media/. No terminal, PTY, ffmpeg, or network needed —
 * what ships in the README is exactly what the framework rendered.
 *
 *   pnpm tsx scripts/record-demo.mjs [showcase|tasks|api|horizon|all]
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planLayout, rasterize } from '@celestial/core/nebula';
import { createTestApp } from '@celestial/test';
import { createCelestialShowcaseApp } from '../examples/celestial-showcase/src/app.js';
import { createTaskConsoleApp } from '../examples/task-console/src/app.js';
import { createApiInspectorApp } from '../examples/api-inspector/src/app.js';
import { createHorizonWorkbenchApp } from '../examples/horizon-workbench/src/app.js';

const { GIFEncoder, applyPalette, quantize } = createRequire(import.meta.url)('gifenc');

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const fontBin = readFileSync(join(repoRoot, 'scripts', 'vendor', 'unscii-16-subset.bin'));
const GLYPH_COUNT = fontBin.length / 20;

function glyphFor(codepoint) {
  let lo = 0;
  let hi = GLYPH_COUNT - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const cp = fontBin.readUInt32LE(mid * 20);
    if (cp === codepoint) return fontBin.subarray(mid * 20 + 4, mid * 20 + 20);
    if (cp < codepoint) lo = mid + 1;
    else hi = mid - 1;
  }
  // U+25AF white vertical rectangle as the tofu fallback, else '?'.
  return glyphFor.cached ??= [0x25af, 0x3f].map((cp) => {
    let l = 0;
    let h = GLYPH_COUNT - 1;
    while (l <= h) {
      const m = (l + h) >> 1;
      const c = fontBin.readUInt32LE(m * 20);
      if (c === cp) return fontBin.subarray(m * 20 + 4, m * 20 + 20);
      if (c < cp) l = m + 1;
      else h = m - 1;
    }
    return new Uint8Array(16);
  })[0];
}

// ─── Color handling ─────────────────────────────────────────────────────────

const BASE16 = [
  '#000000', '#cc0000', '#4e9a06', '#c4a000', '#3465a4', '#75507b', '#06989a', '#d3d7cf',
  '#555753', '#ef2929', '#8ae234', '#fce94f', '#729fcf', '#ad7fa8', '#34e2e2', '#eeeeec',
].map(hexToRgb);

function hexToRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function xterm256(n) {
  if (n < 16) return BASE16[n];
  if (n < 232) {
    const i = n - 16;
    const steps = [0, 95, 135, 175, 215, 255];
    return [steps[Math.floor(i / 36) % 6], steps[Math.floor(i / 6) % 6], steps[i % 6]];
  }
  const g = 8 + (n - 232) * 10;
  return [g, g, g];
}

/** Parse an SGR color escape ("\x1b[38;5;196m", "\x1b[38;2;R;G;Bm", "\x1b[31m") to RGB. */
function parseSgrColor(escape) {
  if (!escape) return null;
  const m = /\[(\d+(?:;\d+)*)m/.exec(escape);
  if (!m) return null;
  const parts = m[1].split(';').map(Number);
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if ((p === 38 || p === 48) && parts[i + 1] === 5) return xterm256(parts[i + 2]);
    if ((p === 38 || p === 48) && parts[i + 1] === 2) return [parts[i + 2], parts[i + 3], parts[i + 4]];
    if (p >= 30 && p <= 37) return BASE16[p - 30];
    if (p >= 90 && p <= 97) return BASE16[p - 90 + 8];
    if (p >= 40 && p <= 47) return BASE16[p - 40];
    if (p >= 100 && p <= 107) return BASE16[p - 100 + 8];
  }
  return null;
}

const DEFAULT_BG = hexToRgb('#0b0f14');
const DEFAULT_FG = hexToRgb('#d3d7cf');

// ─── Frame rasterizer ───────────────────────────────────────────────────────

const CELL_W = 8;
const CELL_H = 16;

function shade(rgb, factor) {
  return rgb.map((v) => Math.max(0, Math.min(255, Math.round(v * factor))));
}

function rasterizeFrame(grid, scale = 2) {
  const width = grid.width * CELL_W * scale;
  const height = grid.height * CELL_H * scale;
  const rgba = new Uint8Array(width * height * 4);

  // Background fill.
  for (let i = 0; i < width * height; i++) {
    rgba.set([...DEFAULT_BG, 255], i * 4);
  }

  for (let row = 0; row < grid.height; row++) {
    const line = grid.cells[row] ?? [];
    for (let col = 0; col < grid.width; col++) {
      const cell = line[col];
      if (!cell || cell.opaqueId) continue;
      const style = cell.style ?? {};
      let fg = parseSgrColor(style.fg) ?? DEFAULT_FG;
      let bg = parseSgrColor(style.bg) ?? DEFAULT_BG;
      if (style.reverse) [fg, bg] = [bg, fg];
      if (style.bold) fg = shade(fg, 1.3);
      if (style.dim) fg = shade(fg, 0.68);
      if (style.hidden) fg = bg;

      const glyph = glyphFor(cell.char.codePointAt(0) ?? 0x20);
      const x0 = col * CELL_W * scale;
      const y0 = row * CELL_H * scale;

      for (let gy = 0; gy < CELL_H; gy++) {
        const bits = glyph[gy];
        const isUnderlineRow = style.underline && gy === CELL_H - 1;
        for (let gx = 0; gx < CELL_W; gx++) {
          const on = isUnderlineRow || ((bits >> (7 - gx)) & 1) === 1;
          const color = on ? fg : bg;
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              const px = ((y0 + gy * scale + sy) * width + (x0 + gx * scale + sx)) * 4;
              rgba[px] = color[0];
              rgba[px + 1] = color[1];
              rgba[px + 2] = color[2];
              rgba[px + 3] = 255;
            }
          }
        }
      }
    }
  }
  return { rgba, width, height };
}

// ─── Recorder ───────────────────────────────────────────────────────────────

async function record(name, size, factory, script, outFile, { scale = 2, actionDelayMs = 520 } = {}) {
  const handle = createTestApp(factory({ initialSize: size, fast: true }), size);
  const frames = [];
  const renderText = () => {
    const vnode = handle.__config.view(handle.model);
    const grid = rasterize(planLayout(vnode, size.cols, size.rows));
    return grid;
  };
  const gridKey = (grid) =>
    grid.cells.map((line) => line.map((cell) => `${cell.char}${cell.style?.fg ?? ''}${cell.style?.bg ?? ''}`).join('')).join('\n');

  // Capture only once the rendered grid stops changing — page transitions in
  // the demos animate for ~1s of ticks, so enforce a minimum observation
  // window before consecutive-identical grids count as settled.
  const capture = async (maxWaitMs = 6000) => {
    const deadline = Date.now() + maxWaitMs;
    let lastKey = '';
    let stable = 0;
    let grid = renderText();
    let polls = 0;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 160));
      await handle.waitForUpdate().catch(() => {});
      grid = renderText();
      polls++;
      const key = gridKey(grid);
      if (key === lastKey) {
        stable++;
        if (stable >= 3 && polls >= 8) break;
      } else {
        stable = 0;
        lastKey = key;
      }
    }
    frames.push(rasterizeFrame(grid, scale));
  };

  try {
    await capture(); // settle initial frame
    for (const step of script) {
      if (typeof step === 'number') {
        await capture(step);
      } else if (step.key) {
        handle.pressKey(step.key);
        await capture();
      } else if (step.click) {
        handle.click(step.click[0], step.click[1]);
        await capture();
      } else if (step.wait) {
        await capture(step.wait);
      }
    }
  } finally {
    handle.stop();
  }

  const gif = GIFEncoder();
  for (const frame of frames) {
    const palette = quantize(frame.rgba, 256);
    const index = applyPalette(frame.rgba, palette);
    gif.writeFrame(index, frame.width, frame.height, { palette, delay: 420, repeat: 0 });
  }
  gif.finish();

  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, gif.bytes());
  console.log(`${name}: ${frames.length} frames → ${outFile} (${(gif.bytes().length / 1024).toFixed(0)} KB)`);
}

const mediaDir = join(repoRoot, 'docs', 'media');

const RECORDINGS = {
  showcase: () =>
    record(
      'showcase',
      { cols: 100, rows: 32 },
      (opts) => createCelestialShowcaseApp(opts),
      [
        { key: '2' }, // Components lab
        { key: ']' }, // gallery page 2
        { key: ']' }, // gallery page 3
        { key: ']' }, // gallery page 4
        { key: ']' }, // gallery page 5
        { key: '4' }, // Visuals lab
        { key: 'v' }, // cycle visual
        { key: '7' }, // Windows lab
        { key: ']' }, // window system 2
        { key: '8' }, // Smoke lab
        { key: '1' }, // back to Core
      ],
      join(mediaDir, 'flight-deck.gif'),
    ),
  tasks: () =>
    record(
      'task-console',
      { cols: 90, rows: 28 },
      (opts) => createTaskConsoleApp(opts),
      [{ key: 'a' }, { wait: 900 }, { wait: 900 }, { wait: 900 }, { key: 'r' }, { wait: 900 }],
      join(mediaDir, 'task-console.gif'),
    ),
  api: () =>
    record(
      'api-inspector',
      { cols: 90, rows: 28 },
      (opts) => createApiInspectorApp(opts),
      [{ key: 's' }, { wait: 900 }, { key: 'h' }, { wait: 500 }],
      join(mediaDir, 'api-inspector.gif'),
    ),
  horizon: () =>
    record(
      'horizon-workbench',
      { cols: 100, rows: 30 },
      (opts) => createHorizonWorkbenchApp(opts),
      [{ key: ']' }, { key: ']' }, { key: '2' }, { key: 'm' }, { key: 'm' }, { key: 'i' }],
      join(mediaDir, 'horizon-workbench.gif'),
    ),
};

const which = process.argv[2] ?? 'all';
if (which === 'all') {
  for (const run of Object.values(RECORDINGS)) await run();
} else {
  const run = RECORDINGS[which];
  if (!run) {
    console.error(`unknown demo "${which}" — expected one of: all, ${Object.keys(RECORDINGS).join(', ')}`);
    process.exit(1);
  }
  await run();
}
