# @celestial/test

Deterministic testing utilities for Celestial terminal applications.

```ts
import { createTestApp, fireKey, renderToText } from '@celestial/test';
```

- `@celestial/test` provides the headless terminal and query APIs.
- `@celestial/test/vitest` installs the optional Vitest matchers.
- `@celestial/test/pty` provides a black-box PTY transcript harness and needs
  the optional `node-pty` peer dependency.

The PTY harness disables Nebula's Win32 native-console bridge inside the
nested ConPTY session by default. Pass
`env: { CELESTIAL_DISABLE_WIN32_INPUT_BRIDGE: undefined }` only when the
bridge itself is the subject of the scenario.
