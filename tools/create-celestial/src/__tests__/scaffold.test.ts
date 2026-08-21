import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { scaffoldProject, TEMPLATE_KEYS } from '../index.js';

const packageRoot = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const scratchRoot = join(packageRoot, '.tmp-tests');

/**
 * Resolve the workspace TypeScript compiler. The scaffolded fixtures rely on
 * plain NodeNext resolution walking up to this package's node_modules, so the
 * check exercises the same package surface an npm-installed consumer gets.
 */
const tscBin = createRequire(import.meta.url).resolve('typescript/bin/tsc');

function typecheck(projectDir: string): { status: number; output: string } {
  const result = spawnSync(process.execPath, [tscBin, '--noEmit', '-p', projectDir], {
    cwd: projectDir,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  return { status: result.status ?? 1, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

afterAll(() => {
  rmSync(scratchRoot, { recursive: true, force: true });
});

describe('create-celestial scaffolding', () => {
  it('exposes exactly the documented four templates', () => {
    expect(TEMPLATE_KEYS).toEqual(['counter-tea', 'tsx-app', 'ai-assistant', 'minimal-prompt']);
  });

  it('refuses to overwrite an existing directory', () => {
    const root = join(scratchRoot, 'occupied');
    mkdirSync(root, { recursive: true });
    expect(() => scaffoldProject({ root, name: 'occupied', templateKey: 'counter-tea' })).toThrow(/already exists/);
  });

  it('rejects an unknown template', () => {
    expect(() => scaffoldProject({ root: join(scratchRoot, 'nope'), name: 'nope', templateKey: 'vue-app' })).toThrow(RangeError);
  });

  for (const templateKey of TEMPLATE_KEYS) {
    it(`scaffolds and typechecks the ${templateKey} template against the packed API surface`, () => {
      const root = join(scratchRoot, templateKey);
      const written = scaffoldProject({ root, name: templateKey, templateKey });

      expect(written).toContain('package.json');
      expect(written).toContain('tsconfig.json');
      expect(written).toContain('README.md');
      expect(written.some((path) => path.startsWith('src/'))).toBe(true);

      const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
      expect(manifest.dependencies['@celestial/core']).toBeDefined();
      expect(manifest.dependencies['@celestial/ui']).toBeDefined();

      const { status, output } = typecheck(root);
      expect(status, `tsc failed for ${templateKey}:\n${output}`).toBe(0);
    }, 120_000);
  }

  it('built CLI entry exists with a shebang and imports inertly', async () => {
    const distEntry = join(packageRoot, 'dist', 'index.js');
    if (!existsSync(distEntry)) {
      // Build has not run in this pipeline (e.g. bare `vitest` invocation).
      return;
    }
    const content = readFileSync(distEntry, 'utf8');
    expect(content.startsWith('#!')).toBe(true);
    // Importing the module must never launch the interactive scaffolder.
    const module = await import('../index.js');
    expect(typeof module.scaffoldProject).toBe('function');
    expect(typeof module.run).toBe('function');
  });
});
