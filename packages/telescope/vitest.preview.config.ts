import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'src/__tests__/a11y-audit.test.ts',
      'src/__tests__/async.test.ts',
      'src/__tests__/budget-assertions.test.ts',
      'src/__tests__/capability-fixtures.test.ts',
      'src/__tests__/coverage.test.ts',
      'src/__tests__/dispatch-focus.test.ts',
      'src/__tests__/events.test.ts',
      'src/__tests__/fixtures.test.ts',
      'src/__tests__/motion-modes.test.ts',
      'src/__tests__/parity.test.ts',
      'src/__tests__/preview-pty-lifecycle.test.ts',
      'src/__tests__/preview-pty.test.ts',
      'src/__tests__/preview-public-api.test.ts',
      'src/__tests__/profiler.test.ts',
      'src/__tests__/queries.test.ts',
      'src/__tests__/runtime-a11y.test.ts',
      'src/__tests__/snapshots.test.ts',
      'src/__tests__/telescope.test.ts',
    ],
    testTimeout: 15_000,
  },
});
