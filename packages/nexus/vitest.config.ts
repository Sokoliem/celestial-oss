import path from 'node:path';
import { defineConfig } from 'vitest/config';

const repoRoot = path.resolve(__dirname, '../..');

export default defineConfig({
  resolve: {
    alias: {
      '@celestial/atlas': path.join(repoRoot, 'packages', 'atlas', 'src', 'index.ts'),
      '@celestial/aurora': path.join(repoRoot, 'packages', 'aurora', 'src', 'index.ts'),
      '@celestial/corona': path.join(repoRoot, 'packages', 'corona', 'src', 'index.ts'),
      '@celestial/nebula': path.join(repoRoot, 'packages', 'nebula', 'src', 'index.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
