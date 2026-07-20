import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { conditionalPreviewPackages, previewPackageSet, requiredPreviewPackages } from './preview-packages.mjs';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const workspaceRoots = ['packages', 'apps', 'examples'];
const conditionalSet = new Set(conditionalPreviewPackages);
const manifests = [];
const supportedDemos = new Map([
  ['@celestial/demo-task-console', new Set(['@celestial/core', '@celestial/ui'])],
  ['@celestial/demo-api-inspector', new Set(['@celestial/core', '@celestial/ui'])],
  ['@celestial/demo-horizon-workbench', new Set(['@celestial/core', '@celestial/ui', '@celestial/horizon'])],
  ['@celestial/demo-showcase', new Set(['@celestial/core', '@celestial/ui', '@celestial/horizon'])],
]);
const focusedWorkspaceSet = new Set([...previewPackageSet, ...supportedDemos.keys()]);

function sourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(path));
    else if (entry.isFile() && /\.[cm]?tsx?$/.test(entry.name)) files.push(path);
  }
  return files;
}

function celestialImports(source) {
  const imports = [];
  const pattern = /(?:from\s*|import\s*\()\s*['"](@celestial\/[^'"]+)['"]/g;
  for (const match of source.matchAll(pattern)) imports.push(match[1]);
  return imports;
}

for (const workspaceRoot of workspaceRoots) {
  const absoluteRoot = join(repositoryRoot, workspaceRoot);
  if (!existsSync(absoluteRoot)) continue;
  for (const entry of readdirSync(absoluteRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(absoluteRoot, entry.name, 'package.json');
    try {
      manifests.push({
        path: manifestPath,
        relativePath: relative(repositoryRoot, manifestPath).replaceAll('\\', '/'),
        manifest: JSON.parse(readFileSync(manifestPath, 'utf8')),
      });
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
}

const errors = [];
const byName = new Map(manifests.map((entry) => [entry.manifest.name, entry]));

for (const packageName of requiredPreviewPackages) {
  const entry = byName.get(packageName);
  if (!entry) {
    errors.push(`missing required preview package ${packageName}`);
    continue;
  }
  if (entry.manifest.private === true) errors.push(`${packageName} must not be private`);
  if (entry.manifest.publishConfig?.access !== 'public') errors.push(`${packageName} must set publishConfig.access=public`);
}

for (const entry of manifests) {
  const { manifest, relativePath } = entry;
  if (!focusedWorkspaceSet.has(manifest.name)) {
    errors.push(`${relativePath} (${manifest.name}) is outside the focused public source boundary`);
    continue;
  }
  const isPreview = previewPackageSet.has(manifest.name);
  if (!isPreview) {
    if (manifest.private !== true) errors.push(`${relativePath} (${manifest.name}) must be private`);
    if (manifest.publishConfig !== undefined) errors.push(`${relativePath} (${manifest.name}) must not define publishConfig`);
    continue;
  }

  if (conditionalSet.has(manifest.name) && manifest.private === true) {
    if (manifest.publishConfig !== undefined) errors.push(`${manifest.name} is private but still defines publishConfig`);
    continue;
  }

  if (manifest.publishConfig?.access !== 'public') {
    errors.push(`${manifest.name} must set publishConfig.access=public when publishable`);
  }

  const dependencySections = ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies'];
  for (const section of dependencySections) {
    for (const dependencyName of Object.keys(manifest[section] ?? {})) {
      if (dependencyName.startsWith('@celestial/') && !previewPackageSet.has(dependencyName)) {
        errors.push(`${manifest.name} ${section} references private package ${dependencyName}`);
      }
    }
  }
}

for (const [demoName, allowedRuntimeImports] of supportedDemos) {
  const entry = byName.get(demoName);
  if (!entry) {
    errors.push(`missing supported demo ${demoName}`);
    continue;
  }

  const { manifest, path: manifestPath } = entry;
  if (manifest.private !== true) errors.push(`${demoName} must remain private`);
  if (manifest.publishConfig !== undefined) errors.push(`${demoName} must not define publishConfig`);

  for (const dependencyName of Object.keys(manifest.dependencies ?? {})) {
    if (dependencyName.startsWith('@celestial/') && !allowedRuntimeImports.has(dependencyName)) {
      errors.push(`${demoName} dependencies references unsupported package ${dependencyName}`);
    }
  }

  for (const dependencyName of Object.keys(manifest.devDependencies ?? {})) {
    if (dependencyName.startsWith('@celestial/') && dependencyName !== '@celestial/test' && !allowedRuntimeImports.has(dependencyName)) {
      errors.push(`${demoName} devDependencies references unsupported package ${dependencyName}`);
    }
  }

  const demoRoot = resolve(manifestPath, '..');
  const sourceRoot = join(demoRoot, 'src');
  for (const file of sourceFiles(sourceRoot)) {
    const isTest = file.includes(`${join('src', '__tests__')}\\`) || file.includes(`${join('src', '__tests__')}/`);
    for (const specifier of celestialImports(readFileSync(file, 'utf8'))) {
      const packageName = specifier.startsWith('@celestial/test/') ? '@celestial/test' : specifier;
      const allowed = allowedRuntimeImports.has(packageName) || (isTest && packageName === '@celestial/test');
      if (!allowed) {
        errors.push(`${relative(repositoryRoot, file).replaceAll('\\', '/')} imports unsupported preview surface ${specifier}`);
      }
    }
  }
}

const horizon = byName.get('@celestial/horizon')?.manifest;
if (horizon && horizon.private !== true) {
  const celestialRuntimeDependencies = Object.keys(horizon.dependencies ?? {}).filter((name) => name.startsWith('@celestial/'));
  if (celestialRuntimeDependencies.length !== 1 || celestialRuntimeDependencies[0] !== '@celestial/core') {
    errors.push('@celestial/horizon may be public only when its sole Celestial runtime dependency is @celestial/core');
  }
}

if (errors.length > 0) {
  console.error('Preview boundary violations:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  const publicNames = manifests
    .filter(({ manifest }) => previewPackageSet.has(manifest.name) && manifest.private !== true)
    .map(({ manifest }) => manifest.name)
    .sort();
  console.log(`Preview boundary valid (${publicNames.length} publishable packages):`);
  for (const name of publicNames) console.log(`- ${name}`);
}
