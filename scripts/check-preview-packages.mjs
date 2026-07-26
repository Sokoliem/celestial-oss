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
  const normalize = (value) => {
    const result = Array.isArray(value) ? value[0] : value;
    return result && typeof result === 'object' ? result : null;
  };

  try {
    const result = normalize(JSON.parse(output.trim()));
    if (result) return result;
  } catch {
    // Some pnpm versions prefix their JSON result with a status line.
  }

  for (const line of output.split(/\r?\n/).reverse()) {
    try {
      const result = normalize(JSON.parse(line.trim()));
      if (result) return result;
    } catch {
      // Keep looking for the final machine-readable line.
    }
  }

  const start = output.indexOf('{');
  const end = output.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error(`${operation} did not return JSON.\n${output}`);
  const result = normalize(JSON.parse(output.slice(start, end + 1)));
  if (!result) throw new Error(`${operation} returned JSON without a package result.\n${output}`);
  return result;
}

function packedManifest(tarball) {
  return JSON.parse(run('tar', ['-xOf', tarball, 'package/package.json']));
}

function exportTargets(value) {
  if (typeof value === 'string') return [value];
  if (!value || typeof value !== 'object') return [];
  return Object.values(value).flatMap(exportTargets);
}

function exportSpecifiers(packageName, manifest) {
  return Object.keys(manifest.exports ?? { '.': manifest.main })
    .filter((subpath) => !subpath.includes('*') && subpath !== './package.json')
    .map((subpath) => (subpath === '.' ? packageName : `${packageName}/${subpath.slice(2)}`));
}

function assertPackedReferences(packageName, tarball, result) {
  const textArtifacts = result.files
    .map((file) => file.path.replaceAll('\\', '/'))
    .filter((path) => path.startsWith('dist/') && /(?:\.[cm]?js|\.d\.ts)$/.test(path));

  for (const path of textArtifacts) {
    const content = run('tar', ['-xOf', tarball, `package/${path}`]);
    let cursor = 0;
    while (cursor < content.length) {
      const start = content.indexOf('@celestial/', cursor);
      if (start < 0) break;
      const match = /^@celestial\/[a-z0-9_-]+/i.exec(content.slice(start));
      if (!match) throw new Error(`${packageName} ${path} contains an unresolved or computed Celestial package reference.`);
      if (!previewPackageSet.has(match[0])) throw new Error(`${packageName} ${path} leaks unpublished package ${match[0]}.`);
      cursor = start + match[0].length;
    }
  }
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

  for (const target of exportTargets(manifest.exports)) {
    if (!target.startsWith('./dist/')) continue;
    const path = target.slice(2);
    if (!paths.has(path)) throw new Error(`${packageName} export target ${target} is missing from its tarball.`);
  }
}

try {
  run('node', ['scripts/check-preview-boundary.mjs']);

  const packedPackages = [];
  for (const packageName of previewPackages) {
    const packageDirectory = previewPackageDirectories[packageName];
    const sourceManifest = JSON.parse(readFileSync(join(repositoryRoot, packageDirectory, 'package.json'), 'utf8'));
    if (sourceManifest.private === true) continue;

    const output = run('pnpm', ['--dir', packageDirectory, 'pack', '--pack-destination', packDirectory, '--json']);
    const result = parseJsonOutput(output, `packing ${packageName}`);
    if (result.name !== packageName) throw new Error(`Packed ${result.name} from ${packageDirectory}; expected ${packageName}.`);
    const manifest = packedManifest(result.filename);
    assertPackedPackage(packageName, result, manifest);
    assertPackedReferences(packageName, result.filename, result);
    packedPackages.push({ manifest, name: packageName, tarball: result.filename });
  }

  if (packedPackages.length === 0) throw new Error('No preview packages were packed.');
  const tarballs = packedPackages.map(({ tarball }) => tarball);
  const moduleSpecifiers = packedPackages.flatMap(({ manifest, name }) => exportSpecifiers(name, manifest));
  const runtimeModuleSpecifiers = moduleSpecifiers.filter((specifier) => specifier !== '@celestial/test/vitest');

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
    `for (const specifier of ${JSON.stringify(runtimeModuleSpecifiers)}) await import(specifier);
const core = await import('@celestial/core');
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
  'ui.actionCommands': ui.actionCommands,
  'ui.helpView': ui.helpView,
  'ui.keyMap': ui.keyMap,
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
    `for (const specifier of ${JSON.stringify(runtimeModuleSpecifiers)}) require(specifier);
const core = require('@celestial/core');
const ui = require('@celestial/ui');
const test = require('@celestial/test');
const horizon = require('@celestial/horizon');
require('@celestial/core/nebula');
require('@celestial/test/pty');
const cjsExports = {
  'core.app': core.app,
  'ui.actionCommands': ui.actionCommands,
  'ui.helpView': ui.helpView,
  'ui.keyMap': ui.keyMap,
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
    `${moduleSpecifiers.map((specifier, index) => `import * as packedModule${index} from '${specifier}';`).join('\n')}
import { type AppConfig, Cmd, Sub, text } from '@celestial/core';
import type { AriaAttrs } from '@celestial/core/nebula';
import { actionCommands, helpView, keyMap, modal, statusBar, type KeyBinding } from '@celestial/ui';
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
const binding: KeyBinding<Message> = { key: 'q', msg: { type: 'quit' }, description: 'Quit' };
const mappedKeys = keyMap([binding]);
const keyboardHelp = helpView([binding]);
const status = statusBar({ left: [{ text: 'READY', mode: true }] });
const disabledMenuitem: AriaAttrs = { role: 'menuitem', label: 'Unavailable', disabled: true };
const handle = createTestApp(config);
handle.stop();
void surface;
void actionCommands;
void mappedKeys;
void keyboardHelp;
void status;
void disabledMenuitem;
void horizon;
void [${moduleSpecifiers.map((_specifier, index) => `packedModule${index}`).join(', ')}];
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

  console.log(`Preview package smoke test passed for ${tarballs.length} tarballs and ${moduleSpecifiers.length} export surfaces.`);
  if (keep || requestedOutput) console.log(`Artifacts: ${temporaryRoot}`);
} finally {
  if (ownsTemporaryRoot && !keep) rmSync(temporaryRoot, { recursive: true, force: true });
}
