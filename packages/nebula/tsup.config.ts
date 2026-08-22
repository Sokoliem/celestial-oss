import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/jsx/index.ts', 'src/jsx/jsx-runtime.ts', 'src/jsx/jsx-dev-runtime.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
});
