import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@celestial/atlas': fileURLToPath(new URL('../atlas/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
