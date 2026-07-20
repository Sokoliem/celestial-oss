import { defineConfig } from 'vitest/config';
import path from 'node:path';

const pkgRoot = path.resolve(__dirname, '..');

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@celestial/aurora': path.join(pkgRoot, 'aurora/src/index.ts'),
      '@celestial/atlas': path.join(pkgRoot, 'atlas/src/index.ts'),
      '@celestial/corona': path.join(pkgRoot, 'corona/src/index.ts'),
      '@celestial/nebula': path.join(pkgRoot, 'nebula/src/index.ts'),
    },
  },
});
