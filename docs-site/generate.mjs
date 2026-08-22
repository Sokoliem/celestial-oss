#!/usr/bin/env node

/**
 * docs-site/generate.mjs
 *
 * Regenerates docs-site/previews.js from the REAL built @celestial packages.
 * Nothing on the site is hand-drawn markup: every terminal pane is produced
 * by the framework's own layout/rasterize pipeline (planLayout + rasterize,
 * the same path the runtime renderer uses) or by driving the public
 * inlinePrompt API through a headless @celestial/test MockTerminal and
 * replaying the exact ANSI stream the runtime emitted.
 *
 * The code shown on the site is read verbatim from docs-site/snippets/*.ts(x).
 * Those files are typechecked (pnpm --filter docs-site exec tsc --noEmit) and
 * are also transpiled and executed here, so the preview and the displayed
 * snippet come from the same source and cannot drift.
 *
 * Run from the repo root:  node docs-site/generate.mjs
 *                    or:   pnpm --filter docs-site generate
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { visualWidth } from '@celestial/core/corona';
import { planLayout, rasterize } from '@celestial/core/nebula';
import { MockTerminal } from '@celestial/test';
import { inlinePrompt } from '@celestial/ui';
import ts from 'typescript';

const siteRoot = dirname(fileURLToPath(import.meta.url));
const snippetsRoot = join(siteRoot, 'snippets');
const outFile = join(siteRoot, 'previews.js');
const cacheRoot = join(siteRoot, 'node_modules', '.cache', 'docs-site-snippets');

// ─── ANSI palette → CSS ──────────────────────────────────────────────────────
// Tuned to the site's GitHub-dark theme; 16 base colors plus the xterm cube.

const BASE16 = [
  '#484f58',
  '#ff7b72',
  '#3fb950',
  '#d29922',
  '#58a6ff',
  '#bc8cff',
  '#39c5cf',
  '#b1bac4',
  '#8b949e',
  '#ffa198',
  '#56d364',
  '#e3b341',
  '#79c0ff',
  '#d2a8ff',
  '#56d4dd',
  '#ffffff',
];

const DEFAULT_FG = '#c9d1d9';
const DEFAULT_BG = '#090d13';

function xterm256(n) {
  if (n < 16) return BASE16[n];
  if (n < 232) {
    const levels = [0, 95, 135, 175, 215, 255];
    const i = n - 16;
    const r = levels[Math.floor(i / 36)];
    const g = levels[Math.floor((i % 36) / 6)];
    const b = levels[i % 6];
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  }
  const v = 8 + (n - 232) * 10;
  return `#${hex(v)}${hex(v)}${hex(v)}`;
}

function hex(v) {
  return v.toString(16).padStart(2, '0');
}

function rgbHex(r, g, b) {
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** Fold one SGR parameter list into a style record. */
function applySgrParams(style, params) {
  const list = params.length === 0 ? [0] : params;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (p === 0) {
      for (const key of Object.keys(style)) delete style[key];
    } else if (p === 1) style.bold = true;
    else if (p === 2) style.dim = true;
    else if (p === 3) style.italic = true;
    else if (p === 4) style.underline = true;
    else if (p === 7) style.reverse = true;
    else if (p === 8) style.hidden = true;
    else if (p === 9) style.strikethrough = true;
    else if (p === 21 || p === 22) {
      delete style.bold;
      if (p === 22) delete style.dim;
    } else if (p === 23) delete style.italic;
    else if (p === 24) delete style.underline;
    else if (p === 27) delete style.reverse;
    else if (p === 28) delete style.hidden;
    else if (p === 29) delete style.strikethrough;
    else if (p === 39) delete style.fg;
    else if (p === 49) delete style.bg;
    else if (p >= 30 && p <= 37) style.fg = BASE16[p - 30];
    else if (p >= 40 && p <= 47) style.bg = BASE16[p - 40];
    else if (p >= 90 && p <= 97) style.fg = BASE16[p - 90 + 8];
    else if (p >= 100 && p <= 107) style.bg = BASE16[p - 100 + 8];
    else if (p === 38 || p === 48) {
      const target = p === 38 ? 'fg' : 'bg';
      if (list[i + 1] === 5 && list[i + 2] !== undefined) {
        style[target] = xterm256(list[i + 2]);
        i += 2;
      } else if (list[i + 1] === 2 && list[i + 4] !== undefined) {
        style[target] = rgbHex(list[i + 2], list[i + 3], list[i + 4]);
        i += 4;
      }
    }
  }
}

/** Parse a string of concatenated SGR escape sequences into a style record. */
function parseSgr(escapeRun) {
  const style = {};
  if (!escapeRun) return style;
  const re = /\x1b\[([0-9;]*)m/g;
  let match = re.exec(escapeRun);
  while (match) {
    const params = match[1] === '' ? [] : match[1].split(';').map(Number);
    applySgrParams(style, params);
    match = re.exec(escapeRun);
  }
  return style;
}

// ─── Styled-cell lines → HTML ────────────────────────────────────────────────

function isDefaultCell(cell) {
  return (cell.char === ' ' || cell.char === '') && Object.keys(cell.style).length === 0;
}

/** Trim trailing default/space cells and trailing empty rows (mirrors renderToLines). */
function trimRows(rows) {
  const trimmed = rows.map((row) => {
    let end = row.length;
    while (end > 0 && isDefaultCell(row[end - 1])) end--;
    return row.slice(0, end);
  });
  while (trimmed.length > 0 && trimmed[trimmed.length - 1].length === 0) trimmed.pop();
  return trimmed;
}

function styleKey(style) {
  return JSON.stringify(Object.entries(style).sort(([a], [b]) => (a < b ? -1 : 1)));
}

function styleCss(style) {
  const fg = style.reverse ? (style.bg ?? DEFAULT_BG) : style.fg;
  const bg = style.reverse ? (style.fg ?? DEFAULT_FG) : style.bg;
  const parts = [];
  if (fg) parts.push(`color:${fg}`);
  if (bg) parts.push(`background-color:${bg}`);
  if (style.bold) parts.push('font-weight:700');
  if (style.dim) parts.push('opacity:0.72');
  if (style.italic) parts.push('font-style:italic');
  const decorations = [style.underline && 'underline', style.strikethrough && 'line-through'].filter(Boolean);
  if (decorations.length > 0) parts.push(`text-decoration:${decorations.join(' ')}`);
  return parts.join(';');
}

function escapeHtml(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/** Convert trimmed styled-cell rows to HTML, merging runs of equal style. */
function rowsToHtml(rows) {
  const lines = [];
  for (const row of rows) {
    let line = '';
    let runKey = null;
    let runCss = '';
    let runText = '';
    const flush = () => {
      if (runText === '') return;
      line += runCss === '' ? escapeHtml(runText) : `<span style="${runCss}">${escapeHtml(runText)}</span>`;
      runText = '';
    };
    for (let col = 0; col < row.length; col++) {
      const cell = row[col];
      const char = cell.style.hidden ? ' ' : cell.char;
      const key = styleKey(cell.style);
      if (key !== runKey) {
        flush();
        runKey = key;
        runCss = styleCss(cell.style);
      }
      runText += char;
      if (char !== ' ') col += Math.max(0, visualWidth(char) - 1);
    }
    flush();
    lines.push(line);
  }
  return lines.join('\n');
}

// ─── Path 1: rasterize a VNode through the real layout pipeline ──────────────

function vnodeToRows(vnode, cols, maxRows = 48) {
  const plan = planLayout(vnode, cols, maxRows);
  const grid = rasterize(plan);
  const rows = [];
  for (let r = 0; r < grid.height; r++) {
    const cells = grid.cells[r] ?? [];
    rows.push(cells.map((cell) => ({ char: cell.char, style: parseSgr(`${cell.style.fg ?? ''}${cell.style.bg ?? ''}`), ...boolStyles(cell.style) })));
  }
  return rows;
}

function boolStyles(style) {
  const out = {};
  for (const key of ['bold', 'dim', 'italic', 'underline', 'strikethrough', 'reverse', 'hidden']) {
    if (style[key]) out[key] = true;
  }
  return out;
}

// ─── Path 2: replay a captured ANSI stream (inline prompts, markdown) ────────

function ansiToRows(stream) {
  const grid = [];
  const current = {};
  let row = 0;
  let col = 0;

  const ensureRow = (r) => {
    while (grid.length <= r) grid.push([]);
    return grid[r];
  };
  const put = (char) => {
    const cells = ensureRow(row);
    cells[col] = { char, style: { ...current } };
    col += Math.max(1, visualWidth(char));
  };

  let i = 0;
  while (i < stream.length) {
    const ch = stream[i];
    if (ch === '\x1b') {
      const next = stream[i + 1];
      if (next === '[') {
        const match = /^\x1b\[([0-9;?]*)([A-Za-z])/.exec(stream.slice(i, i + 32));
        if (!match) {
          i += 2;
          continue;
        }
        const [raw, paramText, final] = match;
        i += raw.length;
        if (paramText.startsWith('?')) continue; // private modes (cursor, sync, alt screen)
        const params = paramText === '' ? [] : paramText.split(';').map(Number);
        const n = params[0] ?? 1;
        if (final === 'm') applySgrParams(current, params);
        else if (final === 'H' || final === 'f') {
          row = Math.max(0, (params[0] ?? 1) - 1);
          col = Math.max(0, (params[1] ?? 1) - 1);
        } else if (final === 'A') row = Math.max(0, row - n);
        else if (final === 'B') row += n;
        else if (final === 'C') col += n;
        else if (final === 'D') col = Math.max(0, col - n);
        else if (final === 'G') col = Math.max(0, n - 1);
        else if (final === 'J' && (params[0] ?? 0) === 2) grid.length = 0;
        else if (final === 'K') {
          const cells = ensureRow(row);
          for (let c = col; c < cells.length; c++) cells[c] = { char: ' ', style: {} };
        }
        continue;
      }
      if (next === ']') {
        // OSC (hyperlinks etc.) — consume to BEL or ST.
        const bel = stream.indexOf('\x07', i);
        const st = stream.indexOf('\x1b\\', i);
        const end = bel === -1 ? st : st === -1 ? bel : Math.min(bel, st);
        i = end === -1 ? stream.length : end + (end === st ? 2 : 1);
        continue;
      }
      i += 2; // ESC 7 / ESC 8 and other two-byte sequences carry no content
      continue;
    }
    if (ch === '\n') {
      row += 1;
      col = 0;
      i += 1;
      continue;
    }
    if (ch === '\r') {
      col = 0;
      i += 1;
      continue;
    }
    // Printable text — iterate by code point so surrogate pairs stay intact.
    const codePoint = String.fromCodePoint(stream.codePointAt(i));
    i += codePoint.length;
    put(codePoint);
  }

  return grid.map((cells) => {
    const dense = [];
    for (let c = 0; c < cells.length; c++) dense.push(cells[c] ?? { char: ' ', style: {} });
    return dense;
  });
}

// ─── Snippet loading: transpile docs-site/snippets and import the real code ──

function loadSnippetModules() {
  rmSync(cacheRoot, { recursive: true, force: true });
  mkdirSync(cacheRoot, { recursive: true });
  const files = [
    'tool-call.ts',
    'diff-viewer.ts',
    'streaming-markdown.ts',
    'inline-prompt.ts',
    'progress.ts',
    'card.ts',
    'data-table.ts',
    'horizon-windows.ts',
    'tsx-box.tsx',
  ];
  const modules = new Map();
  for (const file of files) {
    const sourcePath = join(snippetsRoot, file);
    const source = readFileSync(sourcePath, 'utf8');
    const { outputText } = ts.transpileModule(source, {
      fileName: file,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.ReactJSX,
        jsxImportSource: '@celestial/core',
        esModuleInterop: true,
      },
    });
    const outPath = join(cacheRoot, file.replace(/\.tsx?$/, '.mjs'));
    writeFileSync(outPath, outputText, 'utf8');
    modules.set(file, { source, module: null, outPath });
  }
  return modules;
}

async function importSnippets(modules) {
  for (const entry of modules.values()) {
    entry.module = await import(pathToFileURL(entry.outPath).href);
  }
}

// ─── Inline prompt driving (public API + headless MockTerminal) ──────────────

const flush = async (ms = 40) => {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, ms));
  await Promise.resolve();
};

async function withTimeout(promise, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} did not settle within 5s`)), 5000);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Drive inlinePrompt.text exactly as the snippet's promptForLaunch() does,
 * capturing the live editing frame the runtime paints while the user types.
 */
async function captureTextPrompt(options, typed) {
  const terminal = new MockTerminal({ cols: 64, rows: 24 });
  const promise = withTimeout(inlinePrompt.text(options, { terminal }), 'inlinePrompt.text');
  terminal.simulateInput(Buffer.from(typed, 'utf8'));
  await flush();
  const rows = ansiToRows(terminal.output);
  terminal.simulateInput(Buffer.from('\r', 'utf8'));
  await flush();
  await promise;
  return rows;
}

/** Drive inlinePrompt.select: open, move once down, capture, then confirm. */
async function captureSelectPrompt(options) {
  const terminal = new MockTerminal({ cols: 64, rows: 24 });
  const promise = withTimeout(inlinePrompt.select(options, { terminal }), 'inlinePrompt.select');
  terminal.simulateInput(Buffer.from('\x1b[B', 'utf8')); // arrow down
  await flush();
  const rows = ansiToRows(terminal.output);
  terminal.simulateInput(Buffer.from('\r', 'utf8')); // enter
  await flush();
  await promise;
  return rows;
}

// ─── Preview assembly ────────────────────────────────────────────────────────

function previewFromRows(key, title, filename, rows, cols) {
  const trimmed = trimRows(rows);
  const html = rowsToHtml(trimmed);
  if (html.trim() === '') throw new Error(`preview "${key}" rendered empty`);
  const width = trimmed.reduce(
    (max, row) =>
      Math.max(
        max,
        row.reduce((sum, cell) => sum + Math.max(1, visualWidth(cell.char)), 0),
      ),
    0,
  );
  return {
    title,
    filename: `snippets/${filename}`,
    terminal: `${key} · real render ${Math.min(cols, Math.max(width, 1))}x${trimmed.length}`,
    html,
  };
}

async function buildPreviews(modules) {
  const get = (file) => modules.get(file);
  const previews = {};

  // AI & Agentic ────────────────────────────────────────────────────────────
  const toolCallMod = get('tool-call.ts').module;
  previews['tool-call'] = previewFromRows('tool-call', 'Tool Call Execution Card', 'tool-call.ts', vnodeToRows(toolCallMod.bashCardView, 64), 64);

  const diffMod = get('diff-viewer.ts').module;
  previews['diff-viewer'] = previewFromRows('diff-viewer', 'Git Diff Viewer', 'diff-viewer.ts', vnodeToRows(diffMod.serverDiff, 64), 64);

  const markdownMod = get('streaming-markdown.ts').module;
  const rendered = markdownMod.snapshot.rendered;
  if (typeof rendered !== 'string' || rendered.trim() === '') throw new Error('markdown stream produced no rendered output');
  previews['streaming-md'] = previewFromRows('streaming-md', 'Streaming Markdown Parser', 'streaming-markdown.ts', ansiToRows(rendered), 64);

  const promptMod = get('inline-prompt.ts').module;
  const textRows = await captureTextPrompt(promptMod.projectName, 'celestial');
  const selectRows = await captureSelectPrompt(promptMod.environment);
  previews['inline-prompt'] = previewFromRows(
    'inline-prompt',
    'Inline CLI Prompt (Clack/Inquirer style)',
    'inline-prompt.ts',
    [...trimRows(textRows), [], ...trimRows(selectRows)],
    64,
  );

  // Curated UI ───────────────────────────────────────────────────────────────
  const progressMod = get('progress.ts').module;
  previews.progress = previewFromRows('progress', 'ProgressBar & Animated Spinners', 'progress.ts', vnodeToRows(progressMod.buildStatus, 64), 64);

  const cardMod = get('card.ts').module;
  previews.card = previewFromRows('card', 'Card & Semantic Badges', 'card.ts', vnodeToRows(cardMod.healthCardView, 64), 64);

  const tableMod = get('data-table.ts').module;
  const [tableModel] = tableMod.packageTable.init();
  const [movedModel] = tableMod.packageTable.update({ type: 'cursor-down' }, tableModel);
  previews.table = previewFromRows('table', 'DataTable with Keyboard Navigation', 'data-table.ts', vnodeToRows(tableMod.packageTable.view(movedModel), 72), 72);

  const horizonMod = get('horizon-windows.ts').module;
  previews.horizon = previewFromRows('horizon', 'Horizon Beta Multi-Window Tiling', 'horizon-windows.ts', vnodeToRows(horizonMod.dashboard, 72), 72);

  const tsxMod = get('tsx-box.tsx').module;
  previews['tsx-box'] = previewFromRows(
    'tsx-box',
    'Declarative TSX / JSX Syntax',
    'tsx-box.tsx',
    vnodeToRows(tsxMod.missionControlView({ count: 42 }), 64),
    64,
  );

  // Attach the verbatim snippet source so the site can never drift from it.
  for (const preview of Object.values(previews)) {
    const file = preview.filename.replace('snippets/', '');
    preview.code = get(file).source;
  }

  return previews;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const modules = loadSnippetModules();
  await importSnippets(modules);
  const previews = await buildPreviews(modules);

  const banner = '// GENERATED by docs-site/generate.mjs from the built @celestial packages. Do not edit by hand.\n';
  const body = `${banner}window.CELESTIAL_PREVIEWS = ${JSON.stringify(previews, null, 2)};\n`;
  writeFileSync(outFile, body, 'utf8');

  console.log(`Wrote ${outFile}`);
  for (const [key, preview] of Object.entries(previews)) {
    const lines = preview.html.split('\n').length;
    console.log(`- ${key}: ${lines} rendered lines, snippet ${preview.code.length} chars`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
