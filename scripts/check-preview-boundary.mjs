import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import {
  conditionalPreviewPackages,
  previewDemos,
  previewPackageSet,
  requiredPreviewPackages,
} from './preview-packages.mjs';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const workspaceRoots = ['packages', 'apps', 'examples'];
const conditionalSet = new Set(conditionalPreviewPackages);
const manifests = [];
const supportedDemoNames = Object.keys(previewDemos);
const focusedWorkspaceSet = new Set([...previewPackageSet, ...supportedDemoNames]);
const errors = [];

function normalized(path) {
  return relative(repositoryRoot, path).replaceAll('\\', '/');
}

function sourceFiles(directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(path));
    else if (entry.isFile() && /(?:\.d)?\.[cm]?[jt]sx?$/.test(entry.name)) files.push(path);
  }
  return files;
}

function scriptKind(path) {
  const extension = extname(path).toLowerCase();
  if (extension === '.tsx') return ts.ScriptKind.TSX;
  if (extension === '.jsx') return ts.ScriptKind.JSX;
  if (extension === '.js' || extension === '.cjs' || extension === '.mjs') return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function locationOf(sourceFile, node) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return `${normalized(sourceFile.fileName)}:${line + 1}:${character + 1}`;
}

function moduleReferences(file, { rejectComputedImports }) {
  const source = readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind(file));
  const references = [];

  function record(node, value) {
    if (ts.isStringLiteralLike(value)) {
      references.push({ specifier: value.text, location: locationOf(sourceFile, node) });
      return;
    }
    if (rejectComputedImports) errors.push(`${locationOf(sourceFile, node)} uses a computed dynamic import; publishable source requires a literal specifier`);
  }

  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      record(node, node.moduleSpecifier);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression) {
      record(node, node.moduleReference.expression);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      record(node, node.argument.literal);
    } else if (ts.isCallExpression(node)) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      const isRequireResolve =
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === 'require' &&
        node.expression.name.text === 'resolve';
      if (isDynamicImport || isRequire || isRequireResolve) {
        const argument = node.arguments[0];
        if (argument) record(node, argument);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return references;
}

function celestialPackageName(specifier) {
  return /^(@celestial\/[^/]+)/.exec(specifier)?.[1];
}

function isTestFile(file) {
  const path = file.replaceAll('\\', '/');
  return path.includes('/__tests__/') || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path);
}

function dependencyNames(manifest, includeDev) {
  const sections = ['dependencies', 'optionalDependencies', 'peerDependencies'];
  if (includeDev) sections.push('devDependencies');
  return new Set(sections.flatMap((section) => Object.keys(manifest[section] ?? {})));
}

function checkReferences({ file, manifest, rejectComputedImports }) {
  const ownName = manifest.name;
  const declared = dependencyNames(manifest, isTestFile(file));
  for (const { specifier, location } of moduleReferences(file, { rejectComputedImports })) {
    const packageName = celestialPackageName(specifier);
    if (!packageName) continue;
    if (!previewPackageSet.has(packageName)) {
      errors.push(`${location} imports private Celestial package ${specifier}`);
    } else if (packageName !== ownName && !declared.has(packageName)) {
      errors.push(`${location} imports undeclared Celestial dependency ${packageName}`);
    }
    if (specifier.includes('/src/')) errors.push(`${location} deep-imports another package source through ${specifier}`);
  }
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
        root: dirname(manifestPath),
        relativePath: normalized(manifestPath),
        manifest: JSON.parse(readFileSync(manifestPath, 'utf8')),
      });
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
}

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
  const { manifest, relativePath, root } = entry;
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

  if (manifest.publishConfig?.access !== 'public') errors.push(`${manifest.name} must set publishConfig.access=public when publishable`);

  for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies']) {
    for (const dependencyName of Object.keys(manifest[section] ?? {})) {
      if (dependencyName.startsWith('@celestial/') && !previewPackageSet.has(dependencyName)) {
        errors.push(`${manifest.name} ${section} references private package ${dependencyName}`);
      }
    }
  }

  for (const file of sourceFiles(join(root, 'src'))) checkReferences({ file, manifest, rejectComputedImports: true });
  for (const file of sourceFiles(join(root, 'dist'))) checkReferences({ file, manifest, rejectComputedImports: false });
}

for (const [demoName, definition] of Object.entries(previewDemos)) {
  const entry = byName.get(demoName);
  if (!entry) {
    errors.push(`missing supported demo ${demoName}`);
    continue;
  }

  const { manifest, root } = entry;
  const allowedRuntimeImports = new Set(definition.runtimePackages);
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

  for (const file of sourceFiles(join(root, 'src'))) {
    for (const { specifier, location } of moduleReferences(file, { rejectComputedImports: true })) {
      const packageName = celestialPackageName(specifier);
      if (!packageName) continue;
      const allowed = allowedRuntimeImports.has(packageName) || (isTestFile(file) && packageName === '@celestial/test');
      if (!allowed) errors.push(`${location} imports unsupported preview surface ${specifier}`);
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
