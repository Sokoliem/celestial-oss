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

import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planLayout, rasterize } from '@celestial/core/nebula';
import { createTestApp } from '@celestial/test';
import { createCelestialShowcaseApp } from '../examples/celestial-showcase/src/app.js';
import { createTaskConsoleApp } from '../examples/task-console/src/app.js';
import { createApiInspectorApp } from '../examples/api-inspector/src/app.js';
import { createHorizonWorkbenchApp } from '../examples/horizon-workbench/src/app.js';
import { rasterizeFrame } from './lib/terminal-raster.mjs';

const { GIFEncoder, applyPalette, quantize } = createRequire(import.meta.url)('gifenc');

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

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
