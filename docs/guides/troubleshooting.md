# Troubleshooting

## My app shows escape codes as literal text (`[?1049h`, `[38;5;...`)

Your output stream isn't a TTY, or a wrapper (another terminal multiplexer,
some IDE consoles, `node > out.txt`) is swallowing the escapes. Check
`process.stdout.isTTY`. For logs, run the app inline
(`app(config, { inline: true })`) or capture frames with `@celestial/test`
instead of scraping stdout.

## Colors are missing or wrong

- `NO_COLOR` is set → color level is `none` by design. Unset it.
- Your terminal reports 16 colors → themes fall back to the base palette.
  Check what Atlas detected:

```ts
import { getCapabilities } from '@celestial/atlas';
console.log(getCapabilities().colorLevel); // 'none' | '16' | '256' | 'truecolor'
```

## Mouse does nothing

- Terminal may not support SGR mouse; the framework enables tracking only when
  a mouse subscription exists, and unsupported terminals stay silent. Use the
  keyboard fallbacks every interactive builder ships with.
- Inside tmux, ensure mouse mode is on: `set -g mouse on`.
- Set `CELESTIAL_DEBUG_INPUT=1` to log input and mouse-mode transitions to
  stderr.

## My view threw and the screen looks stuck

It isn't — the runtime catches view/render errors, keeps the app alive, and
reports them through `onRenderError` (or stderr when no handler is
registered, so they don't vanish behind the alternate screen). Fix the view;
the next successful frame calls `onRenderRecovery`.

```ts
app(config, {
  onRenderError: (err) => process.stderr.write(`view failed: ${err}\n`),
  onRenderRecovery: () => process.stderr.write('view recovered\n'),
});
```

## After a crash my terminal is broken (no cursor, no echo, stuck in alt screen)

That should not happen: crash-recovery restores raw mode, cursor, mouse, and
the alternate screen on uncaught exceptions and signals, and writes a crash
log with a model snapshot. If it ever does: `reset` restores the terminal,
and please file an issue with the crash log.

## Wide characters (emoji, CJK) break layout or get split

They shouldn't — width, wrapping, and hit-testing are grapheme-based
end-to-end. If you see tofu boxes, your terminal font lacks the glyph (the
framework can't fix fonts). If you see actual splitting or NaN widths, that's
a bug — report it with the offending string.

## `Cmd.throttle` doesn't fire my command

Throttle is leading-edge: the first call in a window runs immediately;
repeats *inside the window are dropped*. If you want "run the last one after
things settle," that's `Cmd.debounce`.

## TSX doesn't compile

- `jsxImportSource` must be `@celestial/core` (or `@celestial/nebula`), and
  `jsx` must be `react-jsx`.
- Only the thirteen intrinsics exist (`box`, `text`, `row`, `column`,
  `scroll`, `focus`, `divider`, `badge`, `button`, `textInput`,
  `progressBar`, `spinner`, `card`) — unknown tags are compile errors by
  design. Write a function component for anything custom.
- `onClick` takes a message tag string, not a function.

## inlinePrompt rejects immediately

Escape and Ctrl+C reject with `PromptCancelledError` — catch it:

```ts
try {
  await inlinePrompt.text({ message: 'Name' });
} catch (error) {
  if (error instanceof PromptCancelledError) return;
  throw error;
}
```

In a non-TTY environment prompts resolve their documented defaults
(`initial`/`initialIndex`) instead of rejecting.

## Windows-specific notes

- Windows Terminal, ConPTY, and the win32 input bridge are first-class and
  covered by CI PTY tests. The legacy conhost works too, with a reduced
  capability set.
- If you see double-echo in some embedded terminals, that's the host
  terminal's line discipline, not the framework — the win32 bridge reads
  console input events directly.

## Getting a deterministic repro

`@celestial/test` runs your whole app headlessly. Ninety percent of "works on
my machine" reports become a five-line repro:

```ts
import { createTestApp } from '@celestial/test';

const handle = createTestApp(config, { cols: 80, rows: 24 });
handle.pressKey('x');
console.log(handle.lastFrame());
handle.stop();
```
