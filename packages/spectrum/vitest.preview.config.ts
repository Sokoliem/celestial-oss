import path from 'node:path';
import { defineConfig } from 'vitest/config';

const packages = path.resolve(__dirname, '..');

export default defineConfig({
  test: { include: ['src/**/*.test.ts'] },
  resolve: {
    alias: {
      '@celestial/corona': path.join(packages, 'corona/src/index.ts'),
      '@celestial/nebula': path.join(packages, 'nebula/src/index.ts'),
    },
  },
});
