import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { previewPackageDirectories, previewPackages } from './preview-packages.mjs';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const allowedLicenses = new Set(['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', '0BSD', 'BlueOak-1.0.0', 'CC0-1.0', 'Unlicense']);
const checkedExternal = new Map();
const errors = [];

function licenseIsAllowed(value) {
  if (typeof value !== 'string') return false;
  return value
    .replaceAll('(', '')
    .replaceAll(')', '')
    .split(/\s+(?:AND|OR)\s+/)
    .every((license) => allowedLicenses.has(license));
}

for (const packageName of previewPackages) {
  const directory = previewPackageDirectories[packageName];
  const manifestPath = join(repositoryRoot, directory, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.private === true) continue;
  if (!licenseIsAllowed(manifest.license)) errors.push(`${packageName} has unsupported or missing license ${JSON.stringify(manifest.license)}.`);

  for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const dependencyName of Object.keys(manifest[section] ?? {})) {
      if (dependencyName.startsWith('@celestial/') || checkedExternal.has(dependencyName)) continue;
      const candidates = [join(repositoryRoot, directory, 'node_modules', dependencyName, 'package.json'), join(repositoryRoot, 'node_modules', dependencyName, 'package.json')];
      const dependencyManifestPath = candidates.find(existsSync);
      if (!dependencyManifestPath) {
        errors.push(`Could not inspect license for ${dependencyName}, referenced by ${packageName} ${section}.`);
        continue;
      }
      const dependencyManifest = JSON.parse(readFileSync(dependencyManifestPath, 'utf8'));
      checkedExternal.set(dependencyName, dependencyManifest.license);
      if (!licenseIsAllowed(dependencyManifest.license)) {
        errors.push(`${dependencyName}@${dependencyManifest.version} has unsupported or missing license ${JSON.stringify(dependencyManifest.license)}.`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error('Preview license violations:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Preview license gate passed (${checkedExternal.size} external peer dependencies inspected).`);
}
