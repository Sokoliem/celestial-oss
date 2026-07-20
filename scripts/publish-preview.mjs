import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { previewPackageDirectories, previewPackages } from './preview-packages.mjs';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const confirm = process.argv.includes('--confirm');
const provenance = process.argv.includes('--provenance');
const tagIndex = process.argv.indexOf('--tag');
const tag = tagIndex >= 0 ? process.argv[tagIndex + 1] : 'preview';
if (!tag || !/^[a-z0-9][a-z0-9._-]*$/i.test(tag)) throw new Error('The npm tag is invalid.');
if (tag.toLowerCase() === 'latest') throw new Error('The preview publisher refuses the npm "latest" tag. Use "preview", "beta", or another prerelease tag.');

function executable(name) {
  return process.platform === 'win32' && (name === 'pnpm' || name === 'npm') ? `${name}.cmd` : name;
}

function run(name, args) {
  const requiresWindowsShell = process.platform === 'win32' && (name === 'pnpm' || name === 'npm');
  const result = spawnSync(executable(name), args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: process.env,
    stdio: 'inherit',
    shell: requiresWindowsShell,
    windowsHide: true,
  });
  if (result.status !== 0) {
    const outcome = result.signal ? `signal ${result.signal}` : `exit code ${result.status}`;
    throw new Error(`${name} ${args.join(' ')} failed with ${outcome}.`, { cause: result.error });
  }
}

function capture(name, args) {
  const requiresWindowsShell = process.platform === 'win32' && (name === 'pnpm' || name === 'npm');
  const result = spawnSync(executable(name), args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: process.env,
    shell: requiresWindowsShell,
    windowsHide: true,
  });
  if (result.error) throw new Error(`Unable to run ${name} ${args.join(' ')}.`, { cause: result.error });
  return result;
}

run('node', ['scripts/check-preview-boundary.mjs']);

const releases = previewPackages.flatMap((packageName) => {
  const directory = previewPackageDirectories[packageName];
  const manifest = JSON.parse(readFileSync(join(repositoryRoot, directory, 'package.json'), 'utf8'));
  if (manifest.private === true) return [];
  if (manifest.name !== packageName) throw new Error(`${directory} is ${manifest.name}; expected ${packageName}.`);
  if (manifest.publishConfig?.access !== 'public') throw new Error(`${packageName} is missing publishConfig.access=public.`);
  if (typeof manifest.version !== 'string' || !manifest.version.includes('-')) {
    throw new Error(`${packageName} must use a prerelease version before the preview publisher can run.`);
  }
  return [{ name: packageName, version: manifest.version, directory }];
});

console.log(`Celestial preview release plan (${tag} tag):`);
for (const release of releases) console.log(`- ${release.name}@${release.version} from ${release.directory}`);

if (!confirm) {
  console.log('Dry run only. Re-run with --confirm after preview:validate and the secret/license gates pass.');
  process.exit(0);
}

if (!process.env.NODE_AUTH_TOKEN && !process.env.NPM_TOKEN) {
  throw new Error('Publishing requires NODE_AUTH_TOKEN or NPM_TOKEN.');
}

run('npm', ['whoami', '--registry', 'https://registry.npmjs.org']);

// Check the complete release set before publishing the first tarball. This
// converts duplicate versions and registry outages into an all-or-nothing
// preflight failure instead of discovering them halfway through the package
// dependency order.
for (const release of releases) {
  const specifier = `${release.name}@${release.version}`;
  const result = capture('npm', ['view', specifier, 'version', '--json', '--registry', 'https://registry.npmjs.org']);
  if (result.status === 0) throw new Error(`${specifier} is already published; bump the preview versions before retrying.`);
  const detail = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (!/(?:\bE404\b|404 Not Found|No match found for version|is not in this registry)/i.test(detail)) {
    throw new Error(`Registry preflight failed for ${specifier}.\n${detail.trim()}`);
  }
}

for (const release of releases) {
  const args = ['--dir', release.directory, 'publish', '--access', 'public', '--tag', tag, '--no-git-checks'];
  if (provenance) args.push('--provenance');
  run('pnpm', args);
}

console.log(`Published ${releases.length} allowlisted Celestial packages with the ${tag} tag.`);
