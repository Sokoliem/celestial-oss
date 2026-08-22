# Migrating from Ink

Ink and Celestial both render terminal UIs from declarative element trees —
`<Box>`, `<Text>`, flex layout. The difference is what drives the tree. Ink
runs a React reconciler: hooks, local state, effects. Celestial runs an
Elm-style loop: one immutable model, one typed message union, and a single
`update` that turns messages into the next model. This guide maps the
concepts.

## The ten-minute version

```tsx
// Ink
function Counter() {
  const [count, setCount] = useState(0);
  useInput((input, key) => {
    if (input === '+') setCount((c) => c + 1);
    if (input === 'q') exit();
  });
  return (
    <Box borderStyle="round" paddingX={1}>
      <Text bold>Count: {count}</Text>
    </Box>
  );
}
render(<Counter />);
```

```tsx
// Celestial — tsconfig: "jsx": "react-jsx", "jsxImportSource": "@celestial/core"
import { app, Cmd, Sub } from '@celestial/core';

type Model = { count: number };
type Msg = { type: 'inc' } | { type: 'quit' };

app<Model, Msg>({
  init: () => [{ count: 0 }, Cmd.none()],
  update: (msg, model) =>
    msg.type === 'inc' ? [{ count: model.count + 1 }, Cmd.none()] : [model, Cmd.quit()],
  view: (model) => (
    <Box border="rounded" padding={1}>
      <Text bold>Count: {model.count}</Text>
    </Box>
  ),
  subscriptions: () => Sub.batch<Msg>(Sub.key('+', { type: 'inc' }), Sub.key('q', { type: 'quit' })),
});
```

## Concept mapping

| Ink | Celestial | Notes |
| --- | --- | --- |
| `render(<App />)` | `app(config)` | Returns an `AppHandle` (`dispatch`, `stop`, `model`, `getLayoutPlan()`, `getHitRegions()`). |
| `useState` | The model + `update` | No per-component state at the view layer. Reusable stateful widgets are *descriptors* (`init`/`update`/`view`/`subscriptions`) — all 52 `@celestial/ui` builders work this way, and you compose their model/messages through your `update`. |
| `useInput((input, key) => …)` | `Sub.key`, `Sub.keyEvent`, `Sub.keyWithModifiers` | Input is data (messages), not callbacks inside components. `useInput`'s `key.ctrl/meta/shift` → `Sub.keyWithModifiers('d', { ctrl: true }, msg)`. |
| `useApp().exit()` | `Cmd.quit()` | Commands are values returned from `update`. |
| `useEffect` / data fetching | `Cmd.async` / `Cmd.attempt` / `Cmd.fetch` | Side effects are values the runtime executes, with `AbortSignal` cancellation and success/error message mapping. |
| Timers (`setInterval` in hooks) | `Sub.timer(ms, msg)` | Ticks arrive as messages; `Cmd.debounce`/`Cmd.throttle` cover rate limiting. |
| `<Box>` Yoga flexbox | `<Box>`, `row`, `column`, `flex`, `grid` | Cell-exact integer geometry; `border="rounded"` ≈ `borderStyle="round"`. Advanced layouts: `@celestial/core/gravity`. |
| `<Text bold color="cyan">` | `<Text bold color={color.brightCyan}>` | Colors are typed values, not strings — themes and capability fallbacks apply automatically. |
| `<Spacer>` | `flex` grow/shrink in Gravity | |
| `useFocus` / `useFocusManager` | `focus(id, child)` nodes, `Sub.focus`, focus groups | Focus is discoverable state, not a hook. |
| `<Static>` (append-only output) | `app(config, { inline: true \| { height } })` | Inline mode renders without the alternate screen and preserves scrollback. |
| Ink + Clack/Inquirer prompts | `inlinePrompt.text/select/confirm` | Promise-based, Elm-implemented, `PromptCancelledError` on Esc/Ctrl+C. |

## The two deliberate differences

**Mouse handlers are message tags, not closures.** Ink has no first-class
mouse; Celestial is mouse-first, and `onClick="save"` dispatches through
`Sub.elementMouse` into your `update` — the same message path as keys. You
never write `onClick={() => setOpen(false)}`; you route `{ type: 'close' }`.
This feels foreign for an afternoon and then pays for itself: every
interaction is typed, loggable, and testable headlessly.

**Messages are the whole world.** A keystroke, a click, an HTTP response, a
timer tick, a window resize — all messages through one `update`. There is no
escape hatch of "just this once, local state." The DevTools plugin
(`createDevTools` + F12) records every message and overlays layout and hit
regions; an Ink-style `console.log` debug session becomes a replayable
message log.

## Testing

Ink tests render to strings. Celestial tests drive the real app:

```ts
import { createTestApp } from '@celestial/test';

const handle = createTestApp(config, { cols: 80, rows: 24 });
handle.pressKey('+');
handle.click(col, row);          // real mouse routing
expect(handle.model.count).toBe(1);
expect(handle.lastFrame()).toContain('Count: 1');
handle.stop();
```

Snapshot audits additionally check hit regions, affordance/handler agreement,
and contrast — the same gate the framework's own 52 builders pass.

## What you get for switching

Capability-driven degradation (NO_COLOR, dumb terminals, ConPTY, reduced
motion handled at the framework layer), grapheme-safe text everywhere
(emoji/CJK/bidi survive resize and animation), 52 audited builders with theme
contracts, window management (`@celestial/horizon` beta), and a packaging
story (SEA/Bun single binaries) — with one runtime dependency (`zod`, in the
forms package only).
