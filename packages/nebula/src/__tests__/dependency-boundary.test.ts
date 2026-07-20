import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const packageRoot = path.resolve(import.meta.dirname, '..', '..');

function readPackageJson() {
  return JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
  };
}

function readSource(relativePath: string): string {
  return readFileSync(path.join(packageRoot, 'src', relativePath), 'utf8');
}

describe('nebula dependency boundary', () => {
  it('does not depend on @celestial/agent directly', () => {
    const pkg = readPackageJson();

    expect(pkg.dependencies ?? {}).not.toHaveProperty('@celestial/agent');
  });

  it('keeps agent runtime integration internal to nebula', () => {
    expect(readSource('app.ts')).not.toContain("from '@celestial/agent'");
    expect(readSource('types.ts')).not.toContain("from '@celestial/agent'");
    expect(readSource('index.ts')).not.toContain("from '@celestial/agent'");
  });
});
