import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/pty.ts', 'src/vitest.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
});
