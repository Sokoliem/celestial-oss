import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/animation.ts',
    'src/floating-window-drag.ts',
    'src/core/index.ts',
    'src/state/index.ts',
    'src/compat/index.ts',
    'src/primitives/index.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
});
