import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const sourceRoot = resolve(testDir, '..');
const packageRoot = resolve(sourceRoot, '..');

describe('corona dependency boundaries', () => {
  it('does not import nebula from spinner subscriptions', () => {
    const source = readFileSync(resolve(sourceRoot, 'spinner', 'sub.ts'), 'utf8');
    expect(source).not.toContain('@celestial/nebula');
  });

  it('does not externalize nebula during package builds', () => {
    const tsupConfig = readFileSync(resolve(packageRoot, 'tsup.config.ts'), 'utf8');
    expect(tsupConfig).not.toContain('@celestial/nebula');
  });
});
