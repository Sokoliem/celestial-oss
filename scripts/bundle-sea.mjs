#!/usr/bin/env node

/**
 * Celestial Single Executable Application (SEA) Bundler
 * Compiles a Celestial application into a standalone native executable with zero external dependencies.
 *
 * Usage:
 *   node scripts/bundle-sea.mjs <entry-file> [output-name]
 *
 * Example:
 *   node scripts/bundle-sea.mjs examples/celestial-showcase/src/index.ts celestial-flight-deck
 *
 * Platform notes:
 * - macOS: the copied Node binary's signature is removed before injection and
 *   the result is ad-hoc re-signed, otherwise the injected binary is killed on
 *   launch (arm64). `codesign` must be available (Xcode CLT).
 * - postject is a pinned devDependency of this repo; no network fetch happens
 *   at bundle time.
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import process from 'node:process';

const require = createRequire(import.meta.url);

const entryFile = process.argv[2] || 'examples/task-console/src/index.ts';
const rawOutputName = process.argv[3] || 'celestial-app';
// Normalize: callers may or may not pass the extension; exactly one is applied.
const outputName = rawOutputName.replace(/\.exe$/i, '');
const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const distDir = resolve(process.cwd(), 'dist-bin');

if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

function bin(specifier, hint) {
  try {
    return require.resolve(specifier);
  } catch {
    console.error(`[SEA] Missing ${hint}. Run \`pnpm install\` at the repository root first.`);
    process.exit(1);
  }
}

function exec(label, command, args) {
  console.log(`[SEA] ${label}...`);
  execFileSync(command, args, { stdio: 'inherit' });
}

/** tsup/postject bins are JS CLIs; run them through the current Node. */
function execJs(label, scriptPath, args) {
  exec(label, process.execPath, [scriptPath, ...args]);
}

console.log(`[SEA] Packaging ${entryFile} into standalone binary ${outputName}...`);

// 1. Bundle the TypeScript entry point into a single CJS file via the pinned tsup.
execJs('1. Bundling JavaScript with tsup', bin('tsup/dist/cli-default.js', 'tsup package'), [
  entryFile,
  '--format',
  'cjs',
  '--target',
  'node22',
  '--no-splitting',
  '--no-dts',
  '--clean',
  '--out-dir',
  distDir,
  `--entry.bundle=${entryFile}`,
]);

// tsup emits bundle.cjs or bundle.js depending on the nearest package.json
// "type" field — resolve whichever was produced.
const bundledJs = [join(distDir, 'bundle.cjs'), join(distDir, 'bundle.js')].find((candidate) => existsSync(candidate));
if (!bundledJs) {
  console.error('[SEA] tsup did not produce dist-bin/bundle.{cjs,js}');
  process.exit(1);
}

// 2. Generate the SEA config and blob.
const seaConfigPath = join(distDir, 'sea-config.json');
const seaBlobPath = join(distDir, 'sea-prep.blob');
const seaConfig = {
  main: bundledJs,
  output: seaBlobPath,
  disableExperimentalSEAWarning: true,
  useCodeCache: true,
};
writeFileSync(seaConfigPath, JSON.stringify(seaConfig, null, 2), 'utf8');

exec('2. Generating Node SEA blob', process.execPath, ['--experimental-sea-config', seaConfigPath]);

// 3. Copy the Node binary as the target executable.
const targetExe = join(distDir, isWin ? `${outputName}.exe` : outputName);
console.log(`[SEA] 3. Creating binary base: ${targetExe}...`);
copyFileSync(process.execPath, targetExe);

// 4. macOS: the stock binary's signature invalidates once the blob is
// injected; remove it first, ad-hoc re-sign after.
if (isMac) {
  exec('4a. Removing existing code signature (macOS)', 'codesign', ['--remove-signature', targetExe]);
}

// 5. Inject the blob via the pinned postject. Any failure here is fatal —
// a binary without its blob silently runs stock Node.
const postjectArgs = [targetExe, 'NODE_SEA_BLOB', seaBlobPath, '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'];
if (isMac) postjectArgs.push('--macho-segment-name', 'NODE_SEA');
execJs('5. Injecting SEA blob via postject', bin('postject/dist/cli.js', 'postject package'), postjectArgs);

if (isMac) {
  exec('5a. Ad-hoc re-signing (macOS)', 'codesign', ['--sign', '-', '--force', targetExe]);
}

console.log(`\n[SEA] SUCCESS! Standalone single binary created at: ${targetExe}`);
