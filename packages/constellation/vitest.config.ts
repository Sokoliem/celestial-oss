import path from 'node:path';
import { defineConfig } from 'vitest/config';

const repoPackagesRoot = path.resolve(__dirname, '..', '..', 'packages');

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@celestial/aurora': path.join(repoPackagesRoot, 'aurora/src/index.ts'),
      '@celestial/atlas': path.join(repoPackagesRoot, 'atlas/src/index.ts'),
      '@celestial/corona': path.join(repoPackagesRoot, 'corona/src/index.ts'),
      '@celestial/nebula': path.join(repoPackagesRoot, 'nebula/src/index.ts'),
      '@celestial/gravity': path.join(repoPackagesRoot, 'gravity/src/index.ts'),
    },
  },
});
