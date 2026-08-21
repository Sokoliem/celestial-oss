# @celestial/core

The supported entry point for the Celestial TypeScript terminal UI preview.

Celestial is an Elm-style framework: your app is a model, an `update` function
that turns messages into a new model plus commands, a `view` that renders the
model as a virtual terminal tree, and `subscriptions` that describe keyboard,
mouse, timer, and focus input.

## Install

```bash
pnpm add @celestial/core@preview
```

Node.js 22 or newer is required.

## Your first app

```ts
import { app, Cmd, color, column, style, Sub, text } from '@celestial/core';

interface Model {
  count: number;
}

type CounterMsg = { type: 'increment' } | { type: 'decrement' } | { type: 'quit' };

const countStyle = style({ color: color.brightCyan, bold: true });

app<Model, CounterMsg>({
  init: () => [{ count: 0 }, Cmd.none()],

  update(message, model) {
    switch (message.type) {
      case 'increment':
        return [{ count: model.count + 1 }, Cmd.none()];
      case 'decrement':
        return [{ count: model.count - 1 }, Cmd.none()];
      case 'quit':
        return [model, Cmd.quit()];
    }
  },

  view: (model) =>
    column(
      text(`Count: ${model.count}`, countStyle),
      text('[+] increment  [-] decrement  [q] quit', style({ dim: true })),
    ),

  subscriptions: () =>
    Sub.batch<CounterMsg>(
      Sub.key('+', { type: 'increment' }),
      Sub.key('-', { type: 'decrement' }),
      Sub.key('q', { type: 'quit' }),
    ),
});
```

The fastest way to a runnable project is the scaffolder:

```bash
npm create celestial@latest my-app
```

## Declarative TSX

Prefer JSX syntax? The same VNode tree can be written as TSX with the
automatic transform — no runtime pragma imports needed:

```tsx
// tsconfig.json: "jsx": "react-jsx", "jsxImportSource": "@celestial/core"
import { app, Cmd, color, Sub } from '@celestial/core';
import { Box, Button, Row, Text } from '@celestial/core/jsx';

app<Model, CounterMsg>({
  // init/update as above
  view: (model) => (
    <Box border="rounded" padding={1} borderColor={color.brightCyan}>
      <Text bold>Count: {model.count}</Text>
      <Row gap={2}>
        <Button label="[+] Add" onClick="increment" />
        <Button label="[-] Subtract" onClick="decrement" />
      </Row>
    </Box>
  ),
  subscriptions: () => Sub.batch<CounterMsg>(/* keyboard + elementMouse mapping */),
});
```

JSX components compile to exactly the primitives you'd write by hand. Mouse
handlers are message tags (`onClick="increment"`), never closures — clicks
flow through `Sub.elementMouse` into your `update` like every other message.
See `docs/decisions/0005-jsx-layer.md` for the design contract.

## Async work

Commands describe side effects as values; the runtime executes them with
cancellation and error mapping:

```ts
const load = Cmd.async(
  async (signal) => {
    const res = await fetch('https://api.example.com/status', { signal });
    return res.json();
  },
  {
    onSuccess: (data): Msg => ({ type: 'loaded', data }),
    onError: (error): Msg => ({ type: 'failed', message: error.message }),
  },
);
```

`Cmd.throttle(ms, cmd, key)` runs at most once per window (leading edge);
`Cmd.debounce(ms, cmd, key)` waits for a quiet period.

## DevTools

An in-terminal inspector ships as a plugin: it records every message through
your update loop and overlays layout bounds and hit regions from the last
committed frame. Press **F12** or **Ctrl+D** to cycle modes.

```ts
import { app, createDevTools, withPlugins } from '@celestial/core';

const devtools = createDevTools<Model, CounterMsg>();
const handle = app(withPlugins(config, [devtools.plugin]));
devtools.attach(handle);
```

The overlay is a passive layer — it never takes focus or pointer input.

## Package map

The root barrel re-exports the golden path from the six implementation
packages. Explicit subpaths are available when you need their full surfaces:

| Subpath | Surface |
| --- | --- |
| `@celestial/core` | Golden path: app, elements, Cmd, Sub, color, style, layout, animation, signals |
| `@celestial/core/atlas` | Terminal environment and capability detection |
| `@celestial/core/corona` | Colors, themes, tokens, borders, text styling |
| `@celestial/core/aurora` | Tweens, springs, easing, animation sequences |
| `@celestial/core/nebula` | Full runtime: plugins, error boundaries, persistence, devtools, tasks |
| `@celestial/core/gravity` | Flex, grid, responsive, and spatial layout primitives |
| `@celestial/core/nexus` | Hit testing, mouse interaction, focus stacks, pointer primitives |
| `@celestial/core/jsx` | TSX components and pragma (`h`, `jsx`, `Fragment`) |
| `@celestial/core/jsx-runtime` | Automatic JSX transform runtime (`jsxImportSource`) |
| `@celestial/core/jsx-dev-runtime` | Automatic JSX transform dev runtime |

The implementation packages (`@celestial/nebula`, `@celestial/corona`, …)
remain usable directly when you need APIs the facade does not re-export.

## App options worth knowing

- `inline: true | { height }` — render within existing terminal content
  (no alternate screen), for CLI tools that preserve scrollback.
- `terminal` — inject a backend; the basis of headless testing
  (see `@celestial/test`).
- `onRenderError` / `onRenderRecovery` — observe and recover from view errors;
  the runtime keeps the app alive through them.
- `handle.getLayoutPlan()` / `handle.getHitRegions()` — read the last
  committed frame's geometry (what DevTools uses).

## Stability

Preview versions can change APIs between releases. Only exports documented by
the packages in this repository are supported.

## License

MIT.
