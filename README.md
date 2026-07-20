# Celestial

Celestial is a TypeScript framework for building state-driven terminal user interfaces. It combines an Elm-style runtime, terminal capability detection, styling, animation, layout, and mouse interaction behind one entry point.

This repository is an **open-source preview**, not a 1.0 release. It contains a deliberately small, supported lane extracted from Celestial's broader research codebase.

## Install

Node.js 22 or newer is required.

```bash
pnpm add @celestial/core@preview @celestial/ui@preview
```

Testing utilities are optional:

```bash
pnpm add -D @celestial/test@preview vitest
```

Horizon window management is available as a beta:

```bash
pnpm add @celestial/horizon@preview
```

Until the first npm preview is published, clone the repository and run one of the supported demos below.

## Quickstart

```typescript
import { app, Cmd, color, column, type Msg, style, Sub, text } from '@celestial/core';

interface Model {
  count: number;
}

type CounterMsg = Msg<'increment'> | Msg<'decrement'> | Msg<'quit'>;

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
      text('[+] increment  [-] decrement  [q] quit'),
    ),

  subscriptions: () =>
    Sub.batch<CounterMsg>(
      Sub.key('+', { type: 'increment' }),
      Sub.key('-', { type: 'decrement' }),
      Sub.key('q', { type: 'quit' }),
    ),
});
```

The programming model is always the same:

1. `init` creates the model and initial command.
2. `update` turns messages into a new model and commands.
3. `view` renders the model as a virtual terminal tree.
4. `subscriptions` describes keyboard, mouse, timer, focus, and other input.

The same architecture powers four supported, local-only demos:

| Demo | Command | What it exercises |
| --- | --- | --- |
| Task Console | `pnpm demo:tasks` | Real worker processes, streaming subscriptions, progress, cancellation, retry, responsive layout, and layered UI |
| API Inspector | `pnpm demo:api` | Loopback HTTP, abortable commands, form controls, response tabs, history, and error states |
| Horizon Workbench | `pnpm demo:horizon` | Beta splits, tabs, workspaces, responsive panes, floating windows, and window chrome |
| Celestial Flight Deck | `pnpm demo:showcase` | The complete reduced preview: six core foundations, 27 curated builders, mouse/layers/adaptiveness, Horizon windows, contextual help, and live smoke receipts |

All four demos import only the supported preview packages. They use bundled/local fixtures and never require credentials or an external service. The Flight Deck's detailed manual and automated acceptance path is in [`examples/celestial-showcase/README.md`](examples/celestial-showcase/README.md).

## Preview packages

| Package | Status | Purpose |
| --- | --- | --- |
| `@celestial/core` | Preview | The recommended entry point for Atlas, Corona, Aurora, Nebula, Gravity, and Nexus |
| `@celestial/atlas` | Preview | Terminal environment and capability detection |
| `@celestial/corona` | Preview | Colors, themes, tokens, borders, and text styling |
| `@celestial/aurora` | Preview | Tweens, springs, easing, and animation sequences |
| `@celestial/nebula` | Preview | Elm runtime, virtual terminal DOM, commands, subscriptions, signals, and focus |
| `@celestial/gravity` | Preview | Flex, grid, responsive, and spatial layout primitives |
| `@celestial/nexus` | Preview | Hit testing, mouse interaction, focus stacks, and pointer primitives |
| `@celestial/ui` | Preview | A curated set of 27 tested components |
| `@celestial/test` | Preview | Headless app testing, queries, snapshots, Vitest matchers, and an optional PTY harness |
| `@celestial/horizon` | Beta | Splits, tabs, floating windows, workspaces, constraints, snapping, and persistence |

`@celestial/core` provides both a concise golden path and explicit subpaths such as `@celestial/core/nebula` and `@celestial/core/corona`. The six implementation packages remain usable for consumers who need their full APIs.

## Curated UI

The preview publishes 27 builders instead of the repository's full experimental catalog:

- Input: `button`, `textInput`, `textarea`, `checkbox`, `radioGroup`, `select`, `toggle`, `slider`
- Navigation: `tabs`, `breadcrumb`, `pagination`, `commandPalette`
- Data and display: `dataTable`, `tree`, `list`, `progressBar`, `spinner`, `card`, `divider`, `emptyState`
- Feedback: `badge`, `alert`, `tooltip`, `createToastManager`
- Layers: `modal`, `confirmDialog`, `drawer`

The public surface is mouse-aware, has keyboard fallbacks where appropriate, uses semantic theme tokens, and requires dismissible layered surfaces.

## Testing

`@celestial/test` includes deterministic headless rendering and interaction helpers:

```typescript
import { createScreen, createTestApp } from '@celestial/test';

const handle = createTestApp(myApp, { cols: 80, rows: 24 });
const screen = createScreen(handle);

screen.fireMouse({ type: 'click', row: 2, col: 8 });
screen.getByText('Saved');
handle.stop();
```

Vitest matchers are installed through a separate opt-in entry:

```typescript
import '@celestial/test/vitest';
```

Real subprocess interaction is available through `@celestial/test/pty` when the optional `node-pty` peer dependency is installed.

## Horizon beta

Horizon is intentionally labeled beta. Its published runtime dependency closure is only `@celestial/core`, and its preview surface covers window and pane management. PTY embedding, Lens automation, and advanced cross-package transitions are not part of the beta API.

## Repository scope

This focused repository contains only the packages and demos listed above. Exploratory work such as 3D and browser rendering, remote sharing, multiprocess orchestration, agent tooling, and advanced visual effects is developed separately. Additional surfaces will be brought in selectively after their dependency boundary, tests, documentation, and release contract are ready.

See [`docs/preview-scope.md`](docs/preview-scope.md) for the exact boundary.

## Develop from source

```bash
git clone https://github.com/Sokoliem/celestial-oss.git
cd celestial-oss
corepack enable
pnpm install --frozen-lockfile
pnpm run preview:validate
pnpm demo:showcase
```

Useful commands:

```bash
pnpm run preview:boundary
pnpm run preview:build
pnpm run preview:typecheck
pnpm run preview:test
pnpm run demos:test
pnpm run demos:test:pty
pnpm run preview:pack:check
```

## Stability

Preview versions can change APIs between releases. Only exports documented by the packages in this repository are supported.

Contributions should target the preview lane. Read [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`SECURITY.md`](SECURITY.md) before opening a report.

## License

MIT. See [`LICENSE`](LICENSE).
