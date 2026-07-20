import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/hover-intent/index.ts', 'src/native/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
});
