# `@celestial/test`

Deterministic headless and real-terminal testing for Celestial applications.

## Headless applications

```ts
import { createScreen, createTestApp } from '@celestial/test';

const handle = createTestApp(myApp, { cols: 80, rows: 24 });
const screen = createScreen(handle);

try {
  handle.dispatch({ type: 'open-menu' });
  screen.fireMouse({ type: 'click', row: 4, col: 12 });
  await screen.waitForText('Selected');
  screen.getByRole('menuitem', { name: 'Selected' });
} finally {
  handle.stop();
}
```

`dispatch` calls the Nebula runtime directly; it does not reserve or synthesize
a keyboard binding. Queries resolve the current terminal size for every call,
so `screen.fireResize(cols, rows)` immediately changes responsive results.
Text positions and widths use terminal cells and do not count wide-grapheme
continuation cells twice.

`createTestApp` can install fetch and subprocess mocks. Unmatched fetches fail
closed unless `fetchPassthrough: true` is explicit, and nested apps restore the
previous fetch layer independently when stopped.

## Static rendering and waits

`renderToText`, `renderToLines`, and `renderToSnapshot` use an 80 by 24 terminal
unless dimensions are supplied. Explicit dimensions are passed through to
responsive components. Invalid or excessively large render surfaces fail
before allocating a grid.

Async helpers accept an `AbortSignal` and remove their timers when they settle:

```ts
const controller = new AbortController();
await screen.waitForText('Ready', {
  timeout: 2_000,
  signal: controller.signal,
});
```

Import `@celestial/test/vitest` to install the optional Vitest matchers.

## PTY scenarios

The optional `@celestial/test/pty` entry runs a built application in a real
pseudoterminal and requires the `node-pty` peer dependency.

```ts
import { createPtyHarness } from '@celestial/test/pty';

const pty = await createPtyHarness({
  command: process.execPath,
  args: ['dist/app.js'],
  cols: 80,
  rows: 24,
  timeoutMs: 10_000,
});

try {
  await pty.waitForText('Ready');
  pty.write('q');
  await pty.waitForExit();
} finally {
  pty.dispose();
}
```

PTY waits reject immediately on abort, disposal, or an early child exit. The
transcript is bounded by UTF-8 bytes without retaining a broken code point.
Inside nested Windows ConPTY sessions, the harness disables Nebula's native
console bridge by default. Pass
`env: { CELESTIAL_DISABLE_WIN32_INPUT_BRIDGE: undefined }` only when the bridge
itself is under test.
