import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { previewPackageDirectories, previewPackages, previewPackageSet } from './preview-packages.mjs';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const keep = process.argv.includes('--keep');
const outputIndex = process.argv.indexOf('--out');
const requestedOutput = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
if (outputIndex >= 0 && !requestedOutput) throw new Error('--out requires a directory.');

const temporaryRoot = requestedOutput ? resolve(requestedOutput) : mkdtempSync(join(tmpdir(), 'celestial-preview-pack-'));
const ownsTemporaryRoot = requestedOutput === undefined;
const packDirectory = join(temporaryRoot, 'packs');
const fixtureDirectory = join(temporaryRoot, 'fixture');
mkdirSync(packDirectory, { recursive: true });

function executable(name) {
  return process.platform === 'win32' && (name === 'pnpm' || name === 'npm') ? `${name}.cmd` : name;
}

function run(name, args, options = {}) {
  const requiresWindowsShell = process.platform === 'win32' && (name === 'pnpm' || name === 'npm');
  const result = spawnSync(executable(name), args, {
    cwd: options.cwd ?? repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
    maxBuffer: 32 * 1024 * 1024,
    shell: requiresWindowsShell,
    windowsHide: true,
  });
  if (result.status !== 0) {
    const detail = [result.error?.stack, result.stdout, result.stderr].filter(Boolean).join('\n');
    const outcome = result.signal ? `signal ${result.signal}` : `exit code ${result.status}`;
    throw new Error(`${name} ${args.join(' ')} failed with ${outcome}.\n${detail}`);
  }
  return result.stdout.trim();
}

function parseJsonOutput(output, operation) {
  const start = output.indexOf('{');
  const end = output.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error(`${operation} did not return JSON.\n${output}`);
  return JSON.parse(output.slice(start, end + 1));
}

function packedManifest(tarball) {
  return JSON.parse(run('tar', ['-xOf', tarball, 'package/package.json']));
}

function assertPackedPackage(packageName, result, manifest) {
  const serialized = JSON.stringify(manifest);
  if (serialized.includes('workspace:')) throw new Error(`${packageName} packed manifest still contains workspace: ranges.`);
  if (manifest.private === true) throw new Error(`${packageName} packed manifest is private.`);
  if (manifest.publishConfig?.access !== 'public') throw new Error(`${packageName} packed manifest is not public.`);

  for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies']) {
    for (const dependencyName of Object.keys(manifest[section] ?? {})) {
      if (dependencyName.startsWith('@celestial/') && !previewPackageSet.has(dependencyName)) {
        throw new Error(`${packageName} ${section} leaks unpublished package ${dependencyName}.`);
      }
    }
  }

  const paths = new Set(result.files.map((file) => file.path.replaceAll('\\', '/')));
  for (const requiredPath of ['package.json', 'README.md', 'dist/index.js', 'dist/index.cjs', 'dist/index.d.ts']) {
    if (!paths.has(requiredPath)) throw new Error(`${packageName} tarball is missing ${requiredPath}.`);
  }
}

try {
  run('node', ['scripts/check-preview-boundary.mjs']);

  const tarballs = [];
  for (const packageName of previewPackages) {
    const packageDirectory = previewPackageDirectories[packageName];
    const sourceManifest = JSON.parse(readFileSync(join(repositoryRoot, packageDirectory, 'package.json'), 'utf8'));
    if (sourceManifest.private === true) continue;

    const output = run('pnpm', ['--dir', packageDirectory, 'pack', '--pack-destination', packDirectory, '--json']);
    const result = parseJsonOutput(output, `packing ${packageName}`);
    if (result.name !== packageName) throw new Error(`Packed ${result.name} from ${packageDirectory}; expected ${packageName}.`);
    const manifest = packedManifest(result.filename);
    assertPackedPackage(packageName, result, manifest);
    tarballs.push(result.filename);
  }

  if (tarballs.length === 0) throw new Error('No preview packages were packed.');

  mkdirSync(fixtureDirectory, { recursive: true });
  writeFileSync(
    join(fixtureDirectory, 'package.json'),
    `${JSON.stringify({ name: 'celestial-preview-smoke', private: true, type: 'module', version: '0.0.0' }, null, 2)}\n`,
  );
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', ...tarballs, '@types/node@25', 'vitest@2.1.9'], {
    cwd: fixtureDirectory,
  });

  writeFileSync(
    join(fixtureDirectory, 'smoke.mjs'),
    `const core = await import('@celestial/core');
const ui = await import('@celestial/ui');
const test = await import('@celestial/test');
const horizon = await import('@celestial/horizon');
await import('@celestial/core/atlas');
await import('@celestial/core/corona');
await import('@celestial/core/aurora');
await import('@celestial/core/nebula');
await import('@celestial/core/gravity');
await import('@celestial/core/nexus');
await import('@celestial/test/pty');
const esmExports = {
  'core.app': core.app,
  'ui.modal': ui.modal,
  'test.createTestApp': test.createTestApp,
  'horizon.splitPane': horizon.splitPane,
};
for (const [name, value] of Object.entries(esmExports)) {
  if (typeof value !== 'function') throw new Error('ESM preview smoke test could not find ' + name + '.');
}
`,
  );
  writeFileSync(
    join(fixtureDirectory, 'smoke.cjs'),
    `const core = require('@celestial/core');
const ui = require('@celestial/ui');
const test = require('@celestial/test');
const horizon = require('@celestial/horizon');
require('@celestial/core/nebula');
require('@celestial/test/pty');
const cjsExports = {
  'core.app': core.app,
  'ui.modal': ui.modal,
  'test.createTestApp': test.createTestApp,
  'horizon.splitPane': horizon.splitPane,
};
for (const [name, value] of Object.entries(cjsExports)) {
  if (typeof value !== 'function') throw new Error('CommonJS preview smoke test could not find ' + name + '.');
}
`,
  );
  writeFileSync(
    join(fixtureDirectory, 'smoke.ts'),
    `import { type AppConfig, Cmd, Sub, text } from '@celestial/core';
import { modal } from '@celestial/ui';
import { createTestApp } from '@celestial/test';
import '@celestial/test/vitest';
import * as horizon from '@celestial/horizon';

type Message = { type: 'quit' };
const config: AppConfig<null, Message> = {
  init: () => [null, Cmd.none()],
  update: (_message, model) => [model, Cmd.none()],
  view: () => text('ready'),
  subscriptions: () => Sub.key('q', { type: 'quit' }),
};
const surface = modal({ title: 'Ready', content: text('ready') });
const handle = createTestApp(config);
handle.stop();
void surface;
void horizon;
`,
  );
  writeFileSync(
    join(fixtureDirectory, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          skipLibCheck: false,
          noEmit: true,
        },
        include: ['smoke.ts'],
      },
      null,
      2,
    )}\n`,
  );

  run('node', ['smoke.mjs'], { cwd: fixtureDirectory });
  run('node', ['smoke.cjs'], { cwd: fixtureDirectory });
  run('pnpm', ['exec', 'tsc', '--noEmit', '-p', join(fixtureDirectory, 'tsconfig.json')]);

  console.log(`Preview package smoke test passed for ${tarballs.length} tarballs.`);
  if (keep || requestedOutput) console.log(`Artifacts: ${temporaryRoot}`);
} finally {
  if (ownsTemporaryRoot && !keep) rmSync(temporaryRoot, { recursive: true, force: true });
}
