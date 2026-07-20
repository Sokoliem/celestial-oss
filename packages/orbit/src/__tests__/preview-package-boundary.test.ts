import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('@celestial/orbit public package boundary', () => {
  const orbitRoot = resolve(__dirname, '..', '..');

  it('depends on the curated public UI package', () => {
    const manifest = JSON.parse(readFileSync(resolve(orbitRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    expect(manifest.dependencies?.['@celestial/ui']).toBe('workspace:*');
    expect(manifest.dependencies?.['@celestial/constellation']).toBeUndefined();
  });

  it('type-checks against workspace sources instead of private declaration shims', () => {
    const config = JSON.parse(readFileSync(resolve(orbitRoot, 'tsconfig.json'), 'utf8')) as {
      extends?: string;
      compilerOptions?: { paths?: Record<string, unknown> };
    };
    expect(config.extends).toBe('../../tsconfig.json');
    expect(config.compilerOptions?.paths).toBeUndefined();
  });
});
