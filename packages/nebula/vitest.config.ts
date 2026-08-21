import { defineConfig } from 'vitest/config';
import path from 'node:path';

const pkgRoot = path.resolve(__dirname, '..');

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    fileParallelism: false,
  },
  resolve: {
    alias: [
      // Specific subpaths must precede the bare package alias.
      { find: '@celestial/nebula/jsx-runtime', replacement: path.join(pkgRoot, 'nebula/src/jsx/jsx-runtime.ts') },
      { find: '@celestial/nebula/jsx-dev-runtime', replacement: path.join(pkgRoot, 'nebula/src/jsx/jsx-dev-runtime.ts') },
      { find: '@celestial/nebula/jsx', replacement: path.join(pkgRoot, 'nebula/src/jsx/index.ts') },
      { find: '@celestial/aurora', replacement: path.join(pkgRoot, 'aurora/src/index.ts') },
      { find: '@celestial/atlas', replacement: path.join(pkgRoot, 'atlas/src/index.ts') },
      { find: '@celestial/corona', replacement: path.join(pkgRoot, 'corona/src/index.ts') },
      { find: '@celestial/nebula', replacement: path.join(pkgRoot, 'nebula/src/index.ts') },
    ],
  },
});
