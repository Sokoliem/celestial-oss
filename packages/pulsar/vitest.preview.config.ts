import path from 'node:path';
import { defineConfig } from 'vitest/config';

const packages = path.resolve(__dirname, '..');

export default defineConfig({
  test: { include: ['src/**/*.test.ts'] },
  resolve: {
    alias: {
      '@celestial/aurora': path.join(packages, 'aurora/src/index.ts'),
      '@celestial/corona': path.join(packages, 'corona/src/index.ts'),
      '@celestial/nebula': path.join(packages, 'nebula/src/index.ts'),
      '@celestial/nexus': path.join(packages, 'nexus/src/index.ts'),
      '@celestial/rosetta': path.join(packages, 'rosetta/src/index.ts'),
      '@celestial/spectrum': path.join(packages, 'spectrum/src/index.ts'),
      '@celestial/stellar': path.join(packages, 'stellar/src/index.ts'),
    },
  },
});
