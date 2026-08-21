# Getting started

This guide takes you from zero to a working Celestial app and points at the
next thing to read at each step. If you haven't installed anything yet:

```bash
npm create celestial@latest my-app
cd my-app && pnpm install && pnpm dev
```

Or add Celestial to an existing Node 22+ project:

```bash
pnpm add @celestial/core@preview @celestial/ui@preview
```

## 1. The shape of every app

Celestial apps are state machines. Four functions describe everything:

```ts
import { app, Cmd, column, Sub, text } from '@celestial/core';

app({
  init: () => [{ count: 0 }, Cmd.none()],
  update: (msg, model) => (msg.type === 'inc' ? [{ count: model.count + 1 }, Cmd.none()] : [model, Cmd.none()]),
  view: (model) => column(text(`Count: ${model.count}`)),
  subscriptions: () => Sub.key('+', { type: 'inc' }),
});
```

- **Model** — your immutable state. Updates replace it, never mutate it.
- **Messages** — everything that can happen, as a typed union.
- **update(msg, model) → [model, Cmd]** — the only place state changes.
- **view(model) → VNode** — a pure projection of state to a terminal tree.
- **subscriptions(model) → Sub** — the input you listen for: keys, mouse,
  timers, resize, focus.

If that loop feels familiar, that's the point: it's the Elm architecture.
Every interaction — a keystroke, a click, an HTTP response, a timer tick —
arrives as a message and flows through the same `update`.

## 2. Layout

Compose `text`, `row`, `column`, and `box`:

```ts
import { border, box, color, column, row, style, text } from '@celestial/core';

const card = box(
  column(
    text('Release', style({ bold: true, color: color.brightCyan })),
    row(text('19 packages  '), text('45 surfaces', style({ dim: true }))),
  ),
  style({ border: border.rounded, padding: 1 }),
);
```

`box` accepts width/height (`Responsive<number>` — numbers or
breakpoint-tiered values), `fit: 'content' | 'fill'`, and overflow policies.
Flex and grid live in `column`/`row` and `@celestial/core/gravity`
(`flex`, `grid`, `responsive`) for breakpoint-driven layouts. Terminal cells
are integer, half-open geometry — the framework clamps, never produces NaN or
negative sizes.

## 3. Input: keyboard *and* mouse

Keyboard is one subscription per key:

```ts
Sub.batch(
  Sub.key('q', { type: 'quit' }),
  Sub.keyWithModifiers('d', { ctrl: true }, { type: 'debug' }),
  Sub.keyEvent((event) => ({ type: 'key', event })), // everything, incl. chars
)
```

Mouse interaction is element-scoped. Wrap a region with `event` and route its
handler tags through `Sub.elementMouse`:

```ts
import { event } from '@celestial/core';

const clickable = event('save-button', text('[ Save ]'), { onClick: 'save' });

// in subscriptions:
Sub.elementMouse((e) => (e.handlerTag === 'save' ? { type: 'save' } : { type: 'noop' }))
```

The curated builders in `@celestial/ui` (buttons, tables, modals, …) own this
wiring themselves — you thread their typed messages through your update
instead. SGR 1006 mouse tracking is negotiated automatically; terminals
without mouse support simply never emit these events, and keyboard fallbacks
keep every interactive builder usable.

## 4. Side effects are values

HTTP, timers, subprocesses — all are `Cmd` descriptions the runtime executes
with cancellation:

```ts
const load = Cmd.async(
  async (signal) => (await fetch('/health', { signal })).json(),
  {
    onSuccess: (data): Msg => ({ type: 'loaded', data }),
    onError: (err): Msg => ({ type: 'failed', message: err.message }),
  },
);
```

Useful combinators: `Cmd.batch`, `Cmd.sequence`, `Cmd.race`, `Cmd.timeout`,
`Cmd.debounce` (quiet-period), `Cmd.throttle` (leading-edge), `Cmd.startTask`
for cancellable managed work.

## 5. TSX, if you prefer it

```jsonc
// tsconfig.json
{ "compilerOptions": { "jsx": "react-jsx", "jsxImportSource": "@celestial/core" } }
```

```tsx
import { Box, Button, Text } from '@celestial/core/jsx';

const view = (model) => (
  <Box border="rounded" padding={1}>
    <Text bold>Count: {model.count}</Text>
    <Button label="[+] Add" onClick="inc" />
  </Box>
);
```

`onClick` is a message tag routed via `Sub.elementMouse` — never a closure.
See [ADR 0005](../decisions/0005-jsx-layer.md).

## 6. Components that own their state

The 52 builders in `@celestial/ui` are descriptors with their own
`init`/`update`/`view`/`subscriptions`. Compose one per feature:

```ts
import { checkbox, type CheckboxModel, type CheckboxMsg } from '@celestial/ui';

const headlessChecks = checkbox({ label: 'Run headless checks', checked: true });

// host model: { checks: CheckboxModel }
// init:  const [checks, cmd] = headlessChecks.init();
// update: thread { type: 'checks', msg: CheckboxMsg } through headlessChecks.update
// view:  headlessChecks.view(model.checks)
// subs:  Sub.map(headlessChecks.subscriptions?.(model.checks) ?? Sub.none(), wrap)
```

## 7. See it working

- `pnpm demo:showcase` — the Flight Deck tours every package (recorded in the
  README).
- [Testing](../packages/telescope/README.md) — drive your app headlessly:
  `createTestApp(config)`, `pressKey`, `click`, snapshot audits.
- [DevTools](../packages/nebula/README.md#devtools-inspector) — F12/Ctrl+D in
  any app with the plugin installed.
- [Platform support](./platform-support.md) and
  [Troubleshooting](./troubleshooting.md).
