# create-celestial

Scaffold a modern TypeScript TUI app powered by [Celestial](https://github.com/Sokoliem/celestial-oss).

## Usage

```bash
npm create celestial my-app
cd my-app
pnpm install
pnpm dev
```

Or run it directly:

```bash
pnpm dlx create-celestial my-app
```

## Templates

| Template | What you get |
| --- | --- |
| `counter-tea` | Clean Elm-architecture starter: model, update, view, keyboard subscriptions |
| `tsx-app` | Declarative TSX starter with `<Box>`, `<Text>`, clickable `<Button>`s, and flex layouts |
| `ai-assistant` | Agent-style TUI with an interactive tool execution card and a syntax-highlighted diff viewer |
| `minimal-prompt` | Clack/Inquirer-style inline CLI prompts that preserve scrollback |

Every template scaffolds a `package.json`, `tsconfig.json` (preconfigured for
the Celestial JSX transform via `jsxImportSource: "@celestial/core"`), a
README, and a runnable `src/` entry point.

## Requirements

Node.js 22 or newer.
