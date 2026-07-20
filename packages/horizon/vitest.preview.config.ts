import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/__tests__/*.test.ts'],
    exclude: [
      'src/__tests__/pty-*.test.ts',
      'src/__tests__/workspace-transition.test.ts',
    ],
  },
});
