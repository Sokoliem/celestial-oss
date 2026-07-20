import path from 'node:path';
import { defineConfig } from 'vitest/config';

const repoPackagesRoot = path.resolve(__dirname, '..', '..', 'packages');

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@celestial/nebula': path.join(repoPackagesRoot, 'nebula/src/index.ts'),
      '@celestial/corona': path.join(repoPackagesRoot, 'corona/src/index.ts'),
    },
  },
});
