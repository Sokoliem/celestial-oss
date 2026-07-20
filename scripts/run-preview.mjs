import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  previewDemoDirectories,
  previewPackageDirectories,
  previewPackages,
} from './preview-packages.mjs';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const [task, ...rawArgs] = process.argv.slice(2);

if (!['build', 'clean', 'lint', 'test', 'typecheck'].includes(task)) {
  throw new Error('Usage: node scripts/run-preview.mjs <build|clean|lint|test|typecheck> [--exclude=<package>]');
}

const excluded = new Set(
  rawArgs
    .filter((argument) => argument.startsWith('--exclude='))
    .map((argument) => argument.slice('--exclude='.length)),
);
const passthrough = rawArgs.filter((argument) => !argument.startsWith('--exclude='));

function executable(name) {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

function run(name, args) {
  const result = spawnSync(executable(name), args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    windowsHide: true,
  });
  if (result.status !== 0) {
    const outcome = result.signal ? `signal ${result.signal}` : `exit code ${result.status}`;
    throw new Error(`${name} ${args.join(' ')} failed with ${outcome}.`, { cause: result.error });
  }
}

if (task === 'lint') {
  const packageSources = previewPackages
    .filter((packageName) => !excluded.has(packageName))
    .map((packageName) => `${previewPackageDirectories[packageName]}/src`);
  run('pnpm', [
    'exec',
    'biome',
    'check',
    '--formatter-enabled=false',
    '--assist-enabled=false',
    ...packageSources,
    ...previewDemoDirectories.map((directory) => `${directory}/src`),
    'scripts',
    ...passthrough,
  ]);
} else {
  const filters = previewPackages
    .filter((packageName) => !excluded.has(packageName))
    .map((packageName) => `--filter=${packageName}`);
  run('pnpm', ['exec', 'turbo', 'run', task, ...filters, ...passthrough]);
}
