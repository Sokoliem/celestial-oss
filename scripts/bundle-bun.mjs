#!/usr/bin/env node

/**
 * Celestial Bun Standalone Compiler
 * Compiles a Celestial application using `bun build --compile` for sub-millisecond startup times.
 *
 * Usage:
 *   node scripts/bundle-bun.mjs <entry-file> [output-name]
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';

const entryFile = process.argv[2] || 'examples/task-console/src/index.ts';
const outputName = process.argv[3] || 'celestial-app';
const isWin = process.platform === 'win32';
const distDir = resolve(process.cwd(), 'dist-bin');

if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

const targetExe = join(distDir, isWin ? `${outputName}.exe` : outputName);
console.log(`[Bun Compile] Compiling ${entryFile} into ${targetExe}...`);

try {
  execSync(`bun build --compile --minify "${entryFile}" --outfile "${targetExe}"`, { stdio: 'inherit' });
  console.log(`\n[Bun Compile] SUCCESS! Standalone native binary created at: ${targetExe}`);
} catch (error) {
  console.error('[Bun Compile] Bun compiler failed or Bun is not installed in PATH.');
  console.error('To install Bun: npm install -g bun or visit https://bun.sh');
  process.exit(1);
}
