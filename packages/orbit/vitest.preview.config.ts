import path from 'node:path';
import { defineConfig } from 'vitest/config';

const repoPackagesRoot = path.resolve(__dirname, '..');

export default defineConfig({
  test: {
    include: ['src/__tests__/*.test.ts'],
  },
  resolve: {
    alias: {
      '@celestial/ui': path.join(repoPackagesRoot, 'constellation/src/index.ts'),
      '@celestial/corona': path.join(repoPackagesRoot, 'corona/src/index.ts'),
      '@celestial/nebula': path.join(repoPackagesRoot, 'nebula/src/index.ts'),
      '@celestial/nexus': path.join(repoPackagesRoot, 'nexus/src/index.ts'),
      '@celestial/rosetta': path.join(repoPackagesRoot, 'rosetta/src/index.ts'),
    },
  },
});
