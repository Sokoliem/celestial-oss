import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import process from 'node:process';

const root = process.cwd();
const sourceRoot = resolve(root, 'examples/celestial-showcase/src');
const approvedThemeFiles = new Set(['themes.ts']);
const forbidden = [
  { name: 'defaultTheme', pattern: /\bdefaultTheme\b/ },
  { name: 'raw style()', pattern: /\bstyle\s*\(/ },
  { name: 'concrete border', pattern: /\bborder\.(?:rounded|square|double|thick|hidden|custom)\b/ },
  { name: 'literal presentation color', pattern: /\bcolor\.(?:hex|rgb|hsl)\s*\(/ },
];

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(path);
    return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
  });
}

const violations = [];
for (const file of sourceFiles(sourceRoot)) {
  if (approvedThemeFiles.has(relative(sourceRoot, file).replaceAll('\\', '/'))) continue;
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    for (const rule of forbidden) {
      if (rule.pattern.test(line)) {
        violations.push(`${relative(root, file)}:${index + 1}: ${rule.name}: ${line.trim()}`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error('Showcase conformance failed. Presentation belongs in framework primitives or approved theme declarations.');
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}

console.log('Showcase conformance passed: production demo source contains no direct theme, style, border, or literal presentation-color escape hatches.');
