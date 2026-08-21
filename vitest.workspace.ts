import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/*/vitest.config.ts',
  // Config-less packages run vitest with defaults; include them so
  // test:watch and IDE runners cover the same suites as the turbo pipeline.
  'packages/mirage',
  'packages/nova',
  'packages/orbit',
  'packages/pulsar',
  'packages/spectrum',
  'packages/stellar',
]);
