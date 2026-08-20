#!/usr/bin/env node

/**
 * Celestial Single Executable Application (SEA) Bundler
 * Compiles a Celestial application into a standalone native executable with zero external dependencies.
 *
 * Usage:
 *   node scripts/bundle-sea.mjs <entry-file> [output-name]
 *
 * Example:
 *   node scripts/bundle-sea.mjs examples/task-console/src/index.ts task-console
 */

import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';

const entryFile = process.argv[2] || 'examples/task-console/src/index.ts';
const outputName = process.argv[3] || 'celestial-app';
const isWin = process.platform === 'win32';
const distDir = resolve(process.cwd(), 'dist-bin');

if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

console.log(`[SEA] Packaging ${entryFile} into standalone binary ${outputName}...`);

// 1. Bundle TypeScript entry point into a single standalone JS file using tsup / esbuild
const bundledJs = join(distDir, 'bundle.cjs');
console.log('[SEA] 1. Bundling JavaScript with tsup...');
execSync(`npx tsup ${entryFile} --format cjs --target node22 --no-splitting --no-dts --out-dir ${distDir} --entry.bundle=${entryFile}`, {
  stdio: 'inherit',
});

// 2. Generate SEA config
const seaConfigPath = join(distDir, 'sea-config.json');
const seaBlobPath = join(distDir, 'sea-prep.blob');
const seaConfig = {
  main: bundledJs,
  output: seaBlobPath,
  disableExperimentalSEAWarning: true,
  useCodeCache: true,
};
writeFileSync(seaConfigPath, JSON.stringify(seaConfig, null, 2), 'utf8');

// 3. Generate SEA blob via Node.js
console.log('[SEA] 2. Generating Node SEA blob...');
execSync(`node --experimental-sea-config "${seaConfigPath}"`, { stdio: 'inherit' });

// 4. Copy node binary to target executable
const targetExe = join(distDir, isWin ? `${outputName}.exe` : outputName);
console.log(`[SEA] 3. Creating binary base: ${targetExe}...`);
copyFileSync(process.execPath, targetExe);

// 5. Inject blob into binary via postject
console.log('[SEA] 4. Injecting bytecode resource into binary via postject...');
try {
  const postjectCmd = isWin
    ? `npx postject "${targetExe}" NODE_SEA_BLOB "${seaBlobPath}" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`
    : `npx postject "${targetExe}" NODE_SEA_BLOB "${seaBlobPath}" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 --macho-segment-name NODE_SEA`;
  execSync(postjectCmd, { stdio: 'inherit' });
  console.log(`\n[SEA] SUCCESS! Standalone single binary created at: ${targetExe}`);
} catch (error) {
  console.warn('[SEA] Note: If postject requires code-signing removal on macOS, run: codesign --remove-signature <binary>');
  console.log(`[SEA] Blob and bundle ready in ${distDir}`);
}
