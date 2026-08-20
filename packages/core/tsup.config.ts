import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/atlas.ts',
    'src/corona.ts',
    'src/aurora.ts',
    'src/nebula.ts',
    'src/gravity.ts',
    'src/nexus.ts',
    'src/jsx.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
});
